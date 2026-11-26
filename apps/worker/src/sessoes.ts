// Gerenciador das conexões do WhatsApp (uma por usuário + a da plataforma).
// Mantém cada conexão viva, guarda o estado no banco (as telas leem de lá)
// e reconecta sozinho em caso de queda.
import { readFile } from "node:fs/promises";
import makeWASocket, { Browsers, downloadMediaMessage, extractMessageContent, fetchLatestBaileysVersion, isLidUser, makeCacheableSignalKeyStore, type AnyMessageContent, type WASocket } from "@whiskeysockets/baileys";
import type { Logger } from "pino";
import { prisma, StatusWhatsapp } from "@filapro/db";
import { apagarAuth, usarAuthNoBanco } from "./auth-banco.js";
import { numeroDoJid, paraJid } from "./numero.js";
import { decidirQueda, descreverQueda, esperaDaTentativa, motivoDaFalha } from "./queda.js";
import { Porteiro } from "./porteiro.js";
import { esquecerDono } from "./numeros.js";
import { reservarNumero, type Conflito } from "./numero-unico.js";
import { registrarLogSessao, textoVolta } from "./log-sessao.js";
import type { Conteudo, Remetente } from "./disparos.js";

/** Id fixo da sessão do número da plataforma (decisão #51). */
export const SESSAO_PLATAFORMA = "plataforma";

type Conexao = { sock: WASocket; tentativas: number; encerrando: boolean; qrGerado: boolean; /** nº de série desta conexão (decisão #133) */ geracao: number };

/** O que o gerenciador usa de fora — trocável nos testes (decisão #133). */
export type OpcoesSessoes = {
  criarSocket?: (config: Parameters<typeof makeWASocket>[0]) => WASocket;
  usarAuth?: typeof usarAuthNoBanco;
  apagarAuth?: typeof apagarAuth;
  /** Versão do WhatsApp Web (nos testes, evita buscar na internet) */
  versao?: [number, number, number];
  /** Porteiro das aberturas automáticas (decisão #154); nos testes, sem espera */
  porteiro?: Porteiro;
  /** Sorteio 0 a 1 da variação do intervalo de reconexão (nos testes, fixo) */
  aleatorio?: () => number;
};

/** Mensagem recebida, com o tipo e (para imagens) como baixar a imagem — Conversas IA. */
export type MensagemRecebida = { texto: string; tipo: string; /** Endereço de origem quando o contato é LID (decisão #129) */ jid?: string; baixarImagem?: () => Promise<{ tipo: string; base64: string } | null> };

export class GerenciadorSessoes implements Remetente {
  // ===== Porta única de cada número (encapsulamento — decisões #132 e #133) =====
  // Tudo o que muda a conexão de um número (conectar, desconectar, reconectar) passa por estas estruturas:
  /** Conexão atual de cada número */
  private conexoes = new Map<string, Conexao>();
  /** Relógio da reconexão automática de cada número (guardado para poder cancelar) */
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Nº de série da última conexão aberta de cada número: avisos de conexões antigas são ignorados */
  private geracoes = new Map<string, number>();
  /** Fila de cada número: as operações do mesmo número acontecem uma de cada vez */
  private filas = new Map<string, Promise<void>>();
  /** Números que conectam só para SAIR do WhatsApp (logout) — decisões #138 e #140:
   *  "apagar" = sem dono (usuário excluído): o registro some; "manter" = bloqueado (saiu do plano): conversas e apelido ficam */
  private paraSair = new Map<string, "apagar" | "manter">();
  /** Falhas seguidas ao ABRIR a conexão de cada número (decisão #144): só a 1ª vai para os Logs; ao voltar, registra a recuperação */
  private falhas = new Map<string, number>();
  /** Números que estão lendo o QR agora (decisão #152): ao abrir, é um pareamento NOVO e o número não pode estar em outro espaço.
   *  Fica entre as conexões (o WhatsApp reinicia a conexão depois da leitura). Reconexão de login salvo nunca entra aqui. */
  private pareando = new Set<string>();
  /** Última queda de cada número (decisão #153 — M4): o motivo e a hora, para a linha dos Logs quando ele voltar */
  private ultimaQueda = new Map<string, { codigo: number; em: Date }>();
  /** Números reconectados por causa do reinício do serviço (decisão #153): a volta não é uma queda e o Log diz isso */
  private aposReinicio = new Set<string>();
  private versao: [number, number, number] | undefined;
  /** Chamado a cada mensagem recebida de um contato (respostas dos leads — etapa 8b). */
  aoReceber: ((sessaoId: string, telefone: string, texto: string, extra: MensagemRecebida) => Promise<void>) | null = null;
  /** WhatsApp conectou (etapa 10b): atende quem ficou esperando enquanto estava desconectado. */
  aoConectar: ((sessaoId: string) => Promise<void>) | null = null;
  /** Número voltou depois de uma queda (decisão #142): recebe o estado de ANTES de limpar as marcas. */
  aoVoltar: ((s: { id: string; usuarioId: string | null; apelido: string; numero: string | null; quedaEm: Date | null; avisoQuedaEm: Date | null }) => Promise<void>) | null = null;
  /** Número desconectou de vez, sem pedido do usuário (decisão #142): avisa na hora, com o motivo. */
  aoDesconectarDeVez: ((s: { id: string; usuarioId: string | null; apelido: string; numero: string | null }, motivo: string) => Promise<void>) | null = null;

  /** Aberturas AUTOMÁTICAS (ao ligar e nas tentativas depois de queda) entram na fila: no máximo 2 por vez, 1,5 s entre elas (decisão #154) */
  private porteiro: Porteiro;

  constructor(private chave: Buffer, private log: Logger, private opcoes: OpcoesSessoes = {}) {
    this.versao = opcoes.versao;
    this.porteiro = opcoes.porteiro ?? new Porteiro();
  }

  /** Põe a operação na fila do número: nunca duas ao mesmo tempo para o mesmo número. */
  private emFila(id: string, fn: () => Promise<void>): Promise<void> {
    const anterior = this.filas.get(id) ?? Promise.resolve();
    const atual = anterior.then(fn, fn);
    const guardada = atual.catch(() => undefined);
    this.filas.set(id, guardada);
    void guardada.then(() => { if (this.filas.get(id) === guardada) this.filas.delete(id); });
    return atual;
  }

  /** Desliga o relógio da reconexão automática do número (se houver). */
  private pararRelogio(id: string) {
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
  }

  /** Para os testes: há reconexão agendada para o número? */
  reconexaoAgendada(id: string) {
    return this.timers.has(id);
  }

  private async gravar(id: string, dados: Parameters<typeof prisma.whatsappSessao.update>[0]["data"]) {
    await prisma.whatsappSessao.update({ where: { id }, data: dados }).catch((e) => this.log.error({ e, id }, "falha ao gravar estado"));
  }

  /**
   * Ao ligar o serviço: reconecta todas as sessões que têm login salvo, AOS POUCOS (decisão #154 — M5): pelo porteiro,
   * no máximo 2 por vez e 1,5 s entre uma abertura e a próxima. Ordem: número da plataforma, depois quem tem campanha em
   * andamento, depois os demais (e por último os que só conectam para sair do WhatsApp). Quem chama pode NÃO esperar
   * (o serviço sobe na hora e os números reconectam em segundo plano); a promessa resolve quando todos tiverem sido abertos.
   */
  async iniciarTodas() {
    const salvas = await prisma.whatsappSessao.findMany({ where: { creds: { not: null } }, select: { id: true, usuarioId: true, bloqueada: true } });
    const comCampanha = new Set((await prisma.campanha.findMany({ where: { status: "EM_ANDAMENTO" }, select: { usuarioId: true }, distinct: ["usuarioId"] })).map((c) => c.usuarioId));
    this.log.info({ total: salvas.length, porVez: this.porteiro.concorrencia, intervaloMs: this.porteiro.intervaloMs }, "reconectando sessões salvas, aos poucos");
    await Promise.all(salvas.map((s) => {
      const semDono = !s.usuarioId && s.id !== SESSAO_PLATAFORMA;
      return this.porteiro.executar(prioridadeDeAbertura({ id: s.id, usuarioId: s.usuarioId, bloqueada: s.bloqueada }, comCampanha), async () => {
        if (semDono) {
          // Número sem dono (usuário excluído — decisão #138): conecta só para sair e é apagado
          this.log.warn({ id: s.id }, "número sem dono: será desconectado e apagado");
          await this.sairDoWhatsapp(s.id, "apagar");
        } else if (s.bloqueada) {
          // Número que saiu do plano (decisão #140): não volta a funcionar; sai do WhatsApp e o registro fica
          this.log.warn({ id: s.id }, "número bloqueado com login salvo: será desconectado");
          await this.sairDoWhatsapp(s.id, "manter");
        } else {
          this.aposReinicio.add(s.id);
          await this.conectar(s.id);
        }
      }).catch((e) => this.log.error({ e, id: s.id }, "falha ao reconectar"));
    }));
  }

  /** Abre a conexão só para sair do WhatsApp (o FilaPro some de "Dispositivos conectados" do celular). */
  private sairDoWhatsapp(id: string, registro: "apagar" | "manter") {
    this.paraSair.set(id, registro);
    return this.emFila(id, async () => {
      if (this.conexoes.has(id)) return;
      await this.abrirSocket(id, 0);
    }).catch((e) => this.log.error({ e, id }, "falha ao abrir para sair"));
  }

  /** Termina a saída: desconecta (apaga o login) e, se for número sem dono, apaga o registro. */
  private encerrarSemDono(id: string) {
    const registro = this.paraSair.get(id) ?? "apagar";
    this.paraSair.delete(id);
    return this.desconectar(id)
      .then(() => (registro === "apagar" ? prisma.whatsappSessao.deleteMany({ where: { id } }) : undefined))
      .then(() => this.log.warn({ id, registro }, registro === "apagar" ? "número sem dono desconectado e apagado" : "número bloqueado desconectado (conversas mantidas)"))
      .catch((e) => this.log.error({ e, id }, "falha ao encerrar número"));
  }

  /** Inicia (ou retoma) a conexão. Sem login salvo, o WhatsApp gera o QR Code. */
  async conectar(id: string, usuarioId?: string) {
    return this.emFila(id, async () => {
      // Com reconexão agendada, "Conectar" vira "tentar agora": desliga o relógio e abre na hora (sem duplicar)
      this.pararRelogio(id);
      if (this.conexoes.has(id)) return; // já está conectando/conectada
      // Com login salvo é uma RECONEXÃO (decisão #139): a tela mostra "Reconectando…" e "Tentar agora",
      // nunca o "Cancelar" da primeira conexão (que apagaria o login)
      const antes = await prisma.whatsappSessao.findUnique({ where: { id }, select: { creds: true, quedaEm: true, bloqueada: true } });
      // Trava no próprio serviço (decisão #140): número bloqueado (saiu do plano) não conecta, venha o pedido de onde vier
      if (antes?.bloqueada) {
        this.log.warn({ id }, "conectar recusado: número bloqueado (saiu do plano)");
        return;
      }
      const reconexao = !!antes?.creds;
      await prisma.whatsappSessao.upsert({
        where: { id },
        create: { id, usuarioId: usuarioId ?? null, status: StatusWhatsapp.CONECTANDO },
        update: reconexao
          ? { status: StatusWhatsapp.RECONECTANDO, erro: null, qr: null, qrEm: null, quedaEm: antes?.quedaEm ?? new Date(), proximaTentativaEm: null }
          : { status: StatusWhatsapp.CONECTANDO, erro: null, qr: null, qrEm: null, quedaEm: null, tentativaReconexao: 0, proximaTentativaEm: null, avisoQuedaEm: null, avisoProblemaEm: null },
      });
      await this.abrirOuReagendar(id, 0);
    });
  }

  /** Abre a conexão; se falhar ANTES de existir o socket (banco fora do ar, login ilegível…), agenda nova tentativa (decisão #144 — M1). */
  private async abrirOuReagendar(id: string, tentativas: number) {
    try {
      await this.abrirSocket(id, tentativas);
    } catch (e) {
      await this.falhaAoAbrir(id, tentativas, e).catch((x) => this.log.error({ e: x, id }, "falha ao reagendar a reconexão"));
    }
  }

  /**
   * A abertura falhou (decisão #144 — M1): com login salvo, continua "Reconectando…" mostrando o motivo e tenta de novo
   * com o mesmo recuo (2 s … 5 min), sem limite e SEM apagar o login. Sem login (primeira conexão), avisa e para.
   */
  private async falhaAoAbrir(id: string, tentativas: number, e: unknown) {
    const motivo = motivoDaFalha(e);
    this.log.error({ e, id, tentativas }, "falha ao abrir a conexão");
    let s: { creds: string | null; quedaEm: Date | null; bloqueada: boolean } | null = null;
    let lido = true;
    try { s = await prisma.whatsappSessao.findUnique({ where: { id }, select: { creds: true, quedaEm: true, bloqueada: true } }); } catch { lido = false; }
    if (lido && (!s || s.bloqueada)) return; // registro apagado ou número fora do plano: nada a reconectar
    if (lido && !s!.creds) {
      await this.gravar(id, { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null, erro: "Não foi possível conectar agora. Tente de novo em instantes." });
      return;
    }
    // Só a 1ª falha da sequência vai para os Logs (e a recuperação): não enche a tela
    const falhas = (this.falhas.get(id) ?? 0) + 1;
    this.falhas.set(id, falhas);
    if (falhas === 1) void registrarLogSessao(id, `Falha ao reabrir o WhatsApp (${motivo.replace(/\.$/, "")}); tentando de novo sozinho`);
    const agora = new Date();
    const esperaMs = esperaDaTentativa(tentativas, this.opcoes.aleatorio); // com variação aleatória (decisão #154)
    await this.gravar(id, {
      status: StatusWhatsapp.RECONECTANDO, qr: null, qrEm: null, erro: motivo,
      quedaEm: s?.quedaEm ?? agora, tentativaReconexao: tentativas + 1, proximaTentativaEm: new Date(agora.getTime() + esperaMs),
    });
    this.agendarReabertura(id, esperaMs, tentativas + 1);
  }

  /** Relógio guardado: "Desconectar" cancela e "Conectar" antecipa (decisão #133). O nº de série confere que ninguém mexeu no número. */
  private agendarReabertura(id: string, esperaMs: number, proxima: number) {
    const serie = this.geracoes.get(id);
    this.pararRelogio(id);
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      const abrir = () => this.emFila(id, async () => {
        if (this.conexoes.has(id) || this.geracoes.get(id) !== serie) return; // o usuário já agiu (Conectar/Desconectar)
        await this.abrirOuReagendar(id, proxima);
      });
      // Tentativa automática depois de queda: espera a vez no porteiro (decisão #154). Espera 0 = reinício logo
      // depois de ler o QR (515): é o usuário na tela, abre na hora.
      void (esperaMs > 0 ? this.porteiro.executar(id === SESSAO_PLATAFORMA ? 0 : 2, abrir) : abrir()).catch((e) => this.log.error({ e, id }, "falha ao reconectar"));
    }, esperaMs));
  }

  private async abrirSocket(id: string, tentativas: number) {
    if (!this.versao && !this.opcoes.criarSocket) {
      // Versão atual do WhatsApp Web; se não conseguir buscar, usa a padrão do Baileys.
      this.versao = await fetchLatestBaileysVersion().then((r) => r.version).catch(() => undefined);
      this.log.info({ versao: this.versao ?? "padrão do Baileys" }, "versão do WhatsApp Web");
    }
    const { state, salvarCreds } = await (this.opcoes.usarAuth ?? usarAuthNoBanco)(id, this.chave);
    // Mensagens internas do Baileys: só avisos/erros, a não ser no modo de diagnóstico (debug).
    const logBaileys = this.log.child({ sessao: id }, { level: this.log.isLevelEnabled("debug") ? "debug" : "warn" });
    // Conexão que sobrou deste número (não deveria haver): fecha antes de abrir outra
    const sobra = this.conexoes.get(id);
    if (sobra) { sobra.encerrando = true; sobra.sock.end(undefined); }
    const geracao = (this.geracoes.get(id) ?? 0) + 1;
    this.geracoes.set(id, geracao);
    const sock = (this.opcoes.criarSocket ?? makeWASocket)({
      version: this.versao,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logBaileys) },
      logger: logBaileys,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false, // não aparece "online" para os contatos a cada reconexão
      syncFullHistory: false,
    });
    const conexao: Conexao = { sock, tentativas, encerrando: false, qrGerado: false, geracao };
    this.conexoes.set(id, conexao);
    /** Esta ainda é a conexão atual do número? Avisos de conexões antigas são ignorados (decisão #133). */
    const atual = () => this.conexoes.get(id) === conexao;

    // Guarda a última gravação para esperar por ela antes de reconectar
    // (senão a reconexão pode ler o login antigo do banco).
    let ultimaGravacao: Promise<void> = Promise.resolve();
    sock.ev.on("creds.update", () => {
      ultimaGravacao = ultimaGravacao.then(async () => {
        // Registro apagado com a conexão aberta (usuário excluído): encerra em vez de recriar (decisão #138)
        if (!(await salvarCreds()) && atual()) void this.encerrarSemDono(id);
      }).catch((e) => this.log.error({ e, id }, "falha ao salvar credenciais"));
    });

    // Respostas dos contatos (só conversas individuais, recebidas, com texto)
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" || !this.aoReceber) return;
      for (const msg of messages) {
        const k = msg.key;
        if (k.fromMe || !k.remoteJid || k.remoteJid.endsWith("@g.us") || k.remoteJid === "status@broadcast") continue;
        // No WhatsApp novo o contato pode vir como "LID"; o número real vem em remoteJidAlt.
        const lid = isLidUser(k.remoteJid);
        const jid = lid ? k.remoteJidAlt ?? "" : k.remoteJid;
        const telefone = numeroDoJid(jid);
        if (!telefone || !/^\d{8,15}$/.test(telefone)) {
          // Antes era descartada sem log (decisão #127): agora fica registrado para provar a causa
          this.log.warn({ id, lid, temAlt: !!k.remoteJidAlt }, "mensagem descartada: sem número de telefone (contato LID sem o número real)");
          continue;
        }
        // Abre os "envelopes" do WhatsApp (mensagem temporária, visualização única, editada…) antes de ler o texto
        const m = extractMessageContent(msg.message);
        const texto = m?.conversation ?? m?.extendedTextMessage?.text ?? m?.imageMessage?.caption ?? m?.videoMessage?.caption ?? m?.buttonsResponseMessage?.selectedDisplayText ?? m?.listResponseMessage?.title ?? "";
        // Tipo da mensagem (Conversas IA — decisão #92): imagem a IA lê; áudio ela pede para escrever
        const tipo = m?.imageMessage ? "imagem" : m?.audioMessage ? "audio" : m?.videoMessage ? "video" : m?.documentMessage ? "documento"
          : m?.conversation || m?.extendedTextMessage || m?.buttonsResponseMessage || m?.listResponseMessage ? "texto" : "outro";
        const tamanho = Number(m?.imageMessage?.fileLength ?? 0);
        const baixarImagem = tipo === "imagem" && tamanho <= 5 * 1024 * 1024
          ? async () => {
              const buf = await downloadMediaMessage(msg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage, logger: this.log as never });
              return { tipo: m?.imageMessage?.mimetype?.split(";")[0] || "image/jpeg", base64: buf.toString("base64") };
            }
          : undefined;
        this.log.info({ id, tipo, temTexto: !!texto, lid, tel: `${telefone.slice(0, 4)}…${telefone.slice(-4)}` }, "mensagem recebida de contato");
        await this.aoReceber(id, telefone, texto, { texto, tipo, baixarImagem, jid: lid ? k.remoteJid : undefined }).catch((e) => this.log.error({ e, id }, "falha ao registrar resposta"));
      }
    });

    sock.ev.on("connection.update", async (u) => {
      // Qualquer erro ao tratar o aviso não pode deixar o número parado (decisão #144 — M1):
      // se foi ao tratar uma QUEDA, agenda nova tentativa; nos outros avisos a conexão está viva e só registra.
      try {
        if (u.connection === "close") {
          // Só a conexão atual mexe no estado: o "close" de uma conexão antiga não derruba a nova
          if (!atual()) return;
          this.conexoes.delete(id);
          if (conexao.encerrando) return; // desconexão pedida pelo usuário: já tratada em desconectar()
          await this.aoFechar(id, conexao, u, !!state.creds.me?.id, () => ultimaGravacao);
          return;
        }
        if (!atual()) return;
        // Abriu só para sair e o login já não vale (pediu QR): não mostra QR, só encerra (decisões #138 e #140)
        if (u.qr && this.paraSair.has(id)) { void this.encerrarSemDono(id); return; }
        if (u.qr) {
          conexao.qrGerado = true;
          this.pareando.add(id);
          await this.gravar(id, { status: StatusWhatsapp.AGUARDANDO_QR, qr: u.qr, qrEm: new Date(), erro: null });
        }
        if (u.connection === "open") {
          // Número sem dono (decisão #138): conectou só para sair do WhatsApp — some de "Dispositivos conectados" do celular
          if (this.paraSair.has(id)) { void this.encerrarSemDono(id); return; }
          const tentativasAteVoltar = conexao.tentativas;
          // Pareamento novo (acabou de ler o QR): o número não pode estar em outro espaço (decisão #152 — M3)
          if (this.pareando.delete(id)) {
            const numeroNovo = numeroDoJid(sock.user?.id);
            const conflito = numeroNovo ? await reservarNumero(id, numeroNovo).catch((e) => { this.log.error({ e, id }, "falha ao conferir número repetido"); return null; }) : null;
            if (conflito) { await this.recusarNumeroRepetido(id, numeroNovo!, conflito); return; }
          }
          conexao.tentativas = 0;
          // Estado de antes de limpar as marcas: se avisou da queda, avisa que voltou (decisão #142)
          const antes = await prisma.whatsappSessao.findUnique({ where: { id }, select: { id: true, usuarioId: true, apelido: true, numero: true, quedaEm: true, avisoQuedaEm: true } });
          await this.gravar(id, { status: StatusWhatsapp.CONECTADO, qr: null, qrEm: null, erro: null, numero: numeroDoJid(sock.user?.id), conectadoEm: new Date(), quedaEm: null, tentativaReconexao: 0, proximaTentativaEm: null, avisoQuedaEm: null, avisoProblemaEm: null });
          // Aquecimento por CHIP (decisões #64 e #141): a idade é do telefone conectado, não do espaço.
          await this.conferirAquecimento(id, numeroDoJid(sock.user?.id));
          if (antes?.avisoQuedaEm) void this.aoVoltar?.({ ...antes, numero: numeroDoJid(sock.user?.id) ?? antes.numero }).catch((e) => this.log.error({ e, id }, "falha ao avisar que voltou"));
          void this.aoConectar?.(id).catch((e) => this.log.error({ e, id }, "falha ao atender quem esperava a reconexão"));
          // Linha dos Logs (decisão #153 — M4): reinício do serviço, volta de queda (uma linha com motivo, tempo e tentativas)
          // ou primeira conexão ("conectado")
          const falhou = this.falhas.get(id) ?? 0;
          this.falhas.delete(id);
          const numeroAgora = numeroDoJid(sock.user?.id) ?? "";
          const queda = this.ultimaQueda.get(id);
          this.ultimaQueda.delete(id);
          if (this.aposReinicio.delete(id)) void registrarLogSessao(id, `WhatsApp reconectado depois do reinício do serviço (+${numeroAgora})`);
          else if (queda) void registrarLogSessao(id, textoVolta({ voltouEm: new Date(), caiuEm: queda.em, motivo: descreverQueda(queda.codigo), tentativas: tentativasAteVoltar, falhasAoAbrir: falhou }));
          else void registrarLogSessao(id, `WhatsApp conectado (+${numeroAgora})`);
          this.log.info({ id }, "WhatsApp conectado");
        }
      } catch (e) {
        if (u.connection === "close" && !conexao.encerrando && !atual()) await this.falhaAoAbrir(id, conexao.tentativas, e).catch((x) => this.log.error({ e: x, id }, "falha ao reagendar a reconexão"));
        else this.log.error({ e, id }, "falha ao tratar aviso da conexão");
      }
    });
  }

  /** A conexão atual do número fechou sem ser pedido: encerra ou agenda a reconexão (com relógio guardado). */
  private async aoFechar(id: string, conexao: Conexao, u: Partial<{ lastDisconnect: { error?: unknown } }>, pareado: boolean, gravacoes: () => Promise<void>) {
    const codigo = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0;
    this.log.warn({ id, codigo }, "conexão fechada");

    const d = decidirQueda(codigo, pareado, conexao.qrGerado, conexao.tentativas, this.opcoes.aleatorio);
    // Número sem dono que nem chegou a conectar (ex.: já saiu pelo celular): só apaga (decisão #138)
    if (this.paraSair.has(id) && d.acao === "encerrar") { void this.encerrarSemDono(id); return; }
    if (d.acao === "encerrar") {
      // Avisa na hora só quem já estava conectado (decisão #142); QR expirado de quem ainda conectava não avisa
      const antes = pareado ? await prisma.whatsappSessao.findUnique({ where: { id }, select: { id: true, usuarioId: true, apelido: true, numero: true } }) : null;
      this.pareando.delete(id);
      this.ultimaQueda.delete(id);
      if (d.apagarLogin) await (this.opcoes.apagarAuth ?? apagarAuth)(id);
      await this.gravar(id, { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null, numero: null, erro: d.erro, quedaEm: null, tentativaReconexao: 0, proximaTentativaEm: null, avisoQuedaEm: null, avisoProblemaEm: null });
      void registrarLogSessao(id, `WhatsApp desconectado${d.erro ? `: ${d.erro}` : ""}`);
      if (antes) void this.aoDesconectarDeVez?.(antes, d.erro).catch((e) => this.log.error({ e, id }, "falha ao avisar a desconexão"));
      return;
    }
    await gravacoes();
    if (pareado && d.esperaMs > 0) {
      // Queda comum com login salvo: a tela mostra quando caiu, a tentativa e a próxima (decisão #139)
      const agora = new Date();
      if (conexao.tentativas === 0) this.ultimaQueda.set(id, { codigo, em: agora }); // para a linha dos Logs na volta (decisão #153)
      await this.gravar(id, {
        status: StatusWhatsapp.RECONECTANDO, qr: null, qrEm: null, erro: null,
        ...(conexao.tentativas === 0 ? { quedaEm: agora } : {}),
        tentativaReconexao: conexao.tentativas + 1, proximaTentativaEm: new Date(agora.getTime() + d.esperaMs),
      });
    } else {
      await this.gravar(id, { status: StatusWhatsapp.CONECTANDO, qr: null, qrEm: null });
    }
    this.agendarReabertura(id, d.esperaMs, conexao.tentativas + 1);
  }

  /**
   * O número que acabou de ser pareado já está conectado em outro espaço (decisão #152 — M3): recusa a conexão NOVA
   * (sai do celular e o login novo é apagado) e a que já existia continua intacta. Fica nos Logs; quando o número é de
   * outra conta, o dono dele também vê nos Logs que houve uma tentativa (sem dizer de quem).
   */
  private async recusarNumeroRepetido(id: string, numero: string, conflito: Conflito) {
    const eu = await prisma.whatsappSessao.findUnique({ where: { id }, select: { usuarioId: true } });
    const mesmoUsuario = !!eu?.usuarioId && eu.usuarioId === conflito.usuarioId;
    const onde = conflito.id === conflito.usuarioId ? "WhatsApp principal" : conflito.apelido ? `WhatsApp "${conflito.apelido}"` : "WhatsApp extra";
    const mensagem = mesmoUsuario
      ? `Este número já está conectado em outro dos seus WhatsApps (${onde}).`
      : "Este número já está em uso em outra conta do FilaPro Leads. Se ele é seu, fale com o suporte.";
    this.log.warn({ id, conflito: conflito.id, mesmoUsuario }, "número recusado: já conectado em outro espaço");
    await this.desconectar(id); // sai do celular, apaga o login novo e para a conexão
    await this.gravar(id, { erro: mensagem });
    void registrarLogSessao(id, `Número recusado (+${numero}): já está conectado em ${mesmoUsuario ? `outro dos seus WhatsApps (${onde})` : "outra conta"}`);
    if (!mesmoUsuario) void registrarLogSessao(conflito.id, `Tentativa de conectar este número (+${numero}) em outra conta foi recusada`);
  }

  /**
   * Chip diferente no mesmo espaço recomeça o aquecimento (decisão #141): número novo disparando no volume
   * cheio é a principal causa de bloqueio. O mesmo chip reconectado mantém a idade. Sem número guardado
   * para comparar (espaços de antes desta regra), recomeça por segurança (opção aprovada pelo dono).
   */
  private async conferirAquecimento(id: string, numero: string | null) {
    if (!numero) return;
    const s = await prisma.whatsappSessao.findUnique({ where: { id }, select: { primeiraConexaoEm: true, numeroAquecimento: true } });
    if (!s || (s.primeiraConexaoEm && s.numeroAquecimento === numero)) return;
    await prisma.whatsappSessao.update({ where: { id }, data: { primeiraConexaoEm: new Date(), numeroAquecimento: numero } });
    // Primeira conexão do espaço não precisa de aviso; troca de chip (ou sem como comparar) fica nos Logs
    if (s.primeiraConexaoEm) {
      this.log.info({ id }, "chip diferente: aquecimento recomeça");
      void registrarLogSessao(id, `Número novo conectado (+${numero}): aquecimento recomeça (20 envios/dia nos primeiros dias)`);
    }
  }

  /** Desconecta e apaga o login salvo (o aparelho some da lista do celular). */
  async desconectar(id: string) {
    return this.emFila(id, async () => {
      // Cancela a reconexão agendada e invalida o nº de série: nada reabre depois (sem QR "fantasma")
      this.pararRelogio(id);
      this.falhas.delete(id);
      this.pareando.delete(id);
      this.ultimaQueda.delete(id);
      this.aposReinicio.delete(id);
      this.geracoes.set(id, (this.geracoes.get(id) ?? 0) + 1);
      const c = this.conexoes.get(id);
      if (c) {
        c.encerrando = true;
        this.conexoes.delete(id);
        await c.sock.logout().catch(() => c.sock.end(undefined));
      }
      await (this.opcoes.apagarAuth ?? apagarAuth)(id);
      await prisma.whatsappSessao.updateMany({ where: { id }, data: { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null, numero: null, erro: null, quedaEm: null, tentativaReconexao: 0, proximaTentativaEm: null, avisoQuedaEm: null, avisoProblemaEm: null } });
      esquecerDono(id); // o próximo aviso deste número busca o dono de novo no banco
    });
  }

  /** Envia uma mensagem de texto. Usado pelos avisos do sistema (os disparos de campanha vêm na etapa 8). */
  async enviarTexto(id: string, para: string, texto: string): Promise<{ ok: boolean; mensagem: string }> {
    const c = this.conexoes.get(id);
    if (!c || !c.sock.user) return { ok: false, mensagem: "WhatsApp não conectado." };
    const jid = paraJid(para);
    if (!jid) return { ok: false, mensagem: "Número inválido." };
    const [existe] = (await c.sock.onWhatsApp(jid)) ?? [];
    if (!existe?.exists) return { ok: false, mensagem: "Este número não tem WhatsApp." };
    await c.sock.sendMessage(existe.jid, { text: texto });
    return { ok: true, mensagem: "Mensagem enviada." };
  }

  // ===== Remetente (usado pelo motor de disparos — etapa 8b) =====

  conectado(id: string) {
    return !!this.conexoes.get(id)?.sock.user;
  }

  async verificarNumero(id: string, telefone: string) {
    const c = this.conexoes.get(id);
    if (!c?.sock.user) throw new Error("WhatsApp não conectado");
    // O telefone do lead já está completo (só dígitos, com o código do país).
    if (!/^\d{8,15}$/.test(telefone)) return null;
    const jid = `${telefone}@s.whatsapp.net`;
    const [r] = (await c.sock.onWhatsApp(jid)) ?? [];
    return r?.exists ? r.jid : null;
  }

  async digitando(id: string, jid: string, ms: number) {
    const c = this.conexoes.get(id);
    if (!c?.sock.user) return;
    await c.sock.presenceSubscribe(jid).catch(() => undefined);
    await c.sock.sendPresenceUpdate("composing", jid).catch(() => undefined);
    await new Promise((r) => setTimeout(r, ms));
    await c.sock.sendPresenceUpdate("paused", jid).catch(() => undefined);
  }

  /** Envia texto, ou o anexo com o texto como legenda (decisão #67). Áudio não tem legenda: vai o áudio e depois o texto. */
  async enviar(id: string, jid: string, conteudo: Conteudo) {
    const c = this.conexoes.get(id);
    if (!c?.sock.user) throw new Error("WhatsApp não conectado");
    const a = conteudo.anexo;
    if (!a) {
      await c.sock.sendMessage(jid, { text: conteudo.texto });
      return;
    }
    const dados = await readFile(a.caminho);
    let msg: AnyMessageContent;
    if (a.tipo.startsWith("image/")) msg = { image: dados, caption: conteudo.texto, mimetype: a.tipo };
    else if (a.tipo.startsWith("video/")) msg = { video: dados, caption: conteudo.texto, mimetype: a.tipo };
    else if (a.tipo.startsWith("audio/")) msg = { audio: dados, mimetype: a.tipo };
    else msg = { document: dados, mimetype: a.tipo, fileName: a.nome, caption: conteudo.texto };
    await c.sock.sendMessage(jid, msg);
    if (a.tipo.startsWith("audio/") && conteudo.texto) await c.sock.sendMessage(jid, { text: conteudo.texto });
  }

  /** Fecha as conexões sem deslogar (desligamento do serviço; o login continua salvo). */
  encerrarTudo() {
    this.porteiro.parar();
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const c of this.conexoes.values()) {
      c.encerrando = true;
      c.sock.end(undefined);
    }
    this.conexoes.clear();
  }
}

/**
 * Prioridade de abertura ao ligar o serviço (decisão #154): 0 número da plataforma (os avisos do sistema voltam primeiro),
 * 1 quem tem campanha em andamento, 2 os demais, 3 os que só conectam para sair do WhatsApp (sem dono ou bloqueados).
 */
export function prioridadeDeAbertura(s: { id: string; usuarioId: string | null; bloqueada: boolean }, comCampanha: Set<string>): number {
  if (s.id === SESSAO_PLATAFORMA) return 0;
  if (!s.usuarioId || s.bloqueada) return 3;
  return comCampanha.has(s.usuarioId) ? 1 : 2;
}
