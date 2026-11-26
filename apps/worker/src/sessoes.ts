// Gerenciador das conexões do WhatsApp (uma por usuário + a da plataforma).
// Mantém cada conexão viva, guarda o estado no banco (as telas leem de lá)
// e reconecta sozinho em caso de queda.
import { readFile } from "node:fs/promises";
import makeWASocket, { Browsers, downloadMediaMessage, extractMessageContent, fetchLatestBaileysVersion, isLidUser, makeCacheableSignalKeyStore, type AnyMessageContent, type WASocket } from "@whiskeysockets/baileys";
import type { Logger } from "pino";
import { prisma, StatusWhatsapp } from "@filapro/db";
import { apagarAuth, usarAuthNoBanco } from "./auth-banco.js";
import { numeroDoJid, paraJid } from "./numero.js";
import { decidirQueda } from "./queda.js";
import { esquecerDono } from "./numeros.js";
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
  /** Números sem dono encontrados ao ligar: conectam só para sair (logout) e são apagados (decisão #138) */
  private orfas = new Set<string>();
  private versao: [number, number, number] | undefined;
  /** Chamado a cada mensagem recebida de um contato (respostas dos leads — etapa 8b). */
  aoReceber: ((sessaoId: string, telefone: string, texto: string, extra: MensagemRecebida) => Promise<void>) | null = null;
  /** WhatsApp conectou (etapa 10b): atende quem ficou esperando enquanto estava desconectado. */
  aoConectar: ((sessaoId: string) => Promise<void>) | null = null;

  constructor(private chave: Buffer, private log: Logger, private opcoes: OpcoesSessoes = {}) {
    this.versao = opcoes.versao;
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

  /** Ao ligar o serviço: reconecta todas as sessões que têm login salvo. */
  async iniciarTodas() {
    const salvas = await prisma.whatsappSessao.findMany({ where: { creds: { not: null } }, select: { id: true, usuarioId: true } });
    this.log.info({ total: salvas.length }, "reconectando sessões salvas");
    for (const s of salvas) {
      // Número sem dono (usuário excluído — decisão #138): não volta a funcionar; conecta só para sair e é apagado
      if (!s.usuarioId && s.id !== SESSAO_PLATAFORMA) {
        this.orfas.add(s.id);
        this.log.warn({ id: s.id }, "número sem dono: será desconectado e apagado");
      }
      await this.conectar(s.id).catch((e) => this.log.error({ e, id: s.id }, "falha ao reconectar"));
    }
  }

  /** O registro do número sumiu (usuário excluído) ou ele não tem dono: sai do WhatsApp e apaga tudo. */
  private encerrarSemDono(id: string) {
    this.orfas.delete(id);
    return this.desconectar(id)
      .then(() => prisma.whatsappSessao.deleteMany({ where: { id } }))
      .then(() => this.log.warn({ id }, "número sem dono desconectado e apagado"))
      .catch((e) => this.log.error({ e, id }, "falha ao encerrar número sem dono"));
  }

  /** Inicia (ou retoma) a conexão. Sem login salvo, o WhatsApp gera o QR Code. */
  async conectar(id: string, usuarioId?: string) {
    return this.emFila(id, async () => {
      // Com reconexão agendada, "Conectar" vira "tentar agora": desliga o relógio e abre na hora (sem duplicar)
      this.pararRelogio(id);
      if (this.conexoes.has(id)) return; // já está conectando/conectada
      await prisma.whatsappSessao.upsert({
        where: { id },
        create: { id, usuarioId: usuarioId ?? null, status: StatusWhatsapp.CONECTANDO },
        update: { status: StatusWhatsapp.CONECTANDO, erro: null, qr: null, qrEm: null },
      });
      await this.abrirSocket(id, 0);
    });
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
      if (u.connection === "close") {
        // Só a conexão atual mexe no estado: o "close" de uma conexão antiga não derruba a nova
        if (!atual()) return;
        this.conexoes.delete(id);
        if (conexao.encerrando) return; // desconexão pedida pelo usuário: já tratada em desconectar()
        await this.aoFechar(id, conexao, u, !!state.creds.me?.id, () => ultimaGravacao);
        return;
      }
      if (!atual()) return;
      if (u.qr) {
        conexao.qrGerado = true;
        await this.gravar(id, { status: StatusWhatsapp.AGUARDANDO_QR, qr: u.qr, qrEm: new Date(), erro: null });
      }
      if (u.connection === "open") {
        // Número sem dono (decisão #138): conectou só para sair do WhatsApp — some de "Dispositivos conectados" do celular
        if (this.orfas.has(id)) { void this.encerrarSemDono(id); return; }
        conexao.tentativas = 0;
        await this.gravar(id, { status: StatusWhatsapp.CONECTADO, qr: null, qrEm: null, erro: null, numero: numeroDoJid(sock.user?.id), conectadoEm: new Date() });
        // Primeira conexão deste número: base do aquecimento (decisão #64)
        await prisma.whatsappSessao.updateMany({ where: { id, primeiraConexaoEm: null }, data: { primeiraConexaoEm: new Date() } });
        void this.aoConectar?.(id).catch((e) => this.log.error({ e, id }, "falha ao atender quem esperava a reconexão"));
        void registrarLogSessao(id, `WhatsApp conectado (+${numeroDoJid(sock.user?.id) ?? ""})`);
        this.log.info({ id }, "WhatsApp conectado");
      }
    });
  }

  /** A conexão atual do número fechou sem ser pedido: encerra ou agenda a reconexão (com relógio guardado). */
  private async aoFechar(id: string, conexao: Conexao, u: Partial<{ lastDisconnect: { error?: unknown } }>, pareado: boolean, gravacoes: () => Promise<void>) {
    const codigo = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0;
    this.log.warn({ id, codigo }, "conexão fechada");

    const d = decidirQueda(codigo, pareado, conexao.qrGerado, conexao.tentativas);
    // Número sem dono que nem chegou a conectar (ex.: já saiu pelo celular): só apaga (decisão #138)
    if (this.orfas.has(id) && d.acao === "encerrar") { void this.encerrarSemDono(id); return; }
    if (d.acao === "encerrar") {
      if (d.apagarLogin) await (this.opcoes.apagarAuth ?? apagarAuth)(id);
      await this.gravar(id, { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null, numero: null, erro: d.erro });
      void registrarLogSessao(id, `WhatsApp desconectado${d.erro ? `: ${d.erro}` : ""}`);
      return;
    }
    await gravacoes();
    await this.gravar(id, { status: StatusWhatsapp.CONECTANDO, qr: null, qrEm: null });
    // Relógio guardado: "Desconectar" cancela e "Conectar" antecipa (decisão #133).
    // O nº de série confere que ninguém mexeu no número enquanto o relógio corria.
    const serie = this.geracoes.get(id);
    this.pararRelogio(id);
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      void this.emFila(id, async () => {
        if (this.conexoes.has(id) || this.geracoes.get(id) !== serie) return;
        await this.abrirSocket(id, conexao.tentativas + 1);
      }).catch((e) => this.log.error({ e, id }, "falha ao reconectar"));
    }, d.esperaMs));
  }

  /** Desconecta e apaga o login salvo (o aparelho some da lista do celular). */
  async desconectar(id: string) {
    return this.emFila(id, async () => {
      // Cancela a reconexão agendada e invalida o nº de série: nada reabre depois (sem QR "fantasma")
      this.pararRelogio(id);
      this.geracoes.set(id, (this.geracoes.get(id) ?? 0) + 1);
      const c = this.conexoes.get(id);
      if (c) {
        c.encerrando = true;
        this.conexoes.delete(id);
        await c.sock.logout().catch(() => c.sock.end(undefined));
      }
      await (this.opcoes.apagarAuth ?? apagarAuth)(id);
      await prisma.whatsappSessao.updateMany({ where: { id }, data: { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null, numero: null, erro: null } });
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
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const c of this.conexoes.values()) {
      c.encerrando = true;
      c.sock.end(undefined);
    }
    this.conexoes.clear();
  }
}

/** Tela Logs (decisão #99): conexões e quedas do WhatsApp, na conta do dono do número. */
async function registrarLogSessao(sessaoId: string, texto: string) {
  try {
    const s = await prisma.whatsappSessao.findUnique({ where: { id: sessaoId }, include: { usuario: { select: { id: true, nome: true, email: true, empresaId: true } } } });
    const u = s?.usuario;
    await prisma.log.create({
      data: { empresaId: u?.empresaId ?? null, usuarioId: u?.id ?? null, quem: u ? `${u.nome} (${u.email})` : "Número da plataforma", tipo: "WHATSAPP", texto: sessaoId === "plataforma" ? `Número da plataforma: ${texto}` : texto },
    });
  } catch { /* o log nunca interrompe a conexão */ }
}
