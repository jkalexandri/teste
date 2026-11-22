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
import type { Conteudo, Remetente } from "./disparos.js";

/** Id fixo da sessão do número da plataforma (decisão #51). */
export const SESSAO_PLATAFORMA = "plataforma";

type Conexao = { sock: WASocket; tentativas: number; encerrando: boolean; qrGerado: boolean };

/** Mensagem recebida, com o tipo e (para imagens) como baixar a imagem — Conversas IA. */
export type MensagemRecebida = { texto: string; tipo: string; baixarImagem?: () => Promise<{ tipo: string; base64: string } | null> };

export class GerenciadorSessoes implements Remetente {
  private conexoes = new Map<string, Conexao>();
  private versao: [number, number, number] | undefined;
  /** Chamado a cada mensagem recebida de um contato (respostas dos leads — etapa 8b). */
  aoReceber: ((sessaoId: string, telefone: string, texto: string, extra: MensagemRecebida) => Promise<void>) | null = null;
  /** WhatsApp conectou (etapa 10b): atende quem ficou esperando enquanto estava desconectado. */
  aoConectar: ((sessaoId: string) => Promise<void>) | null = null;

  constructor(private chave: Buffer, private log: Logger) {}

  private async gravar(id: string, dados: Parameters<typeof prisma.whatsappSessao.update>[0]["data"]) {
    await prisma.whatsappSessao.update({ where: { id }, data: dados }).catch((e) => this.log.error({ e, id }, "falha ao gravar estado"));
  }

  /** Ao ligar o serviço: reconecta todas as sessões que têm login salvo. */
  async iniciarTodas() {
    const salvas = await prisma.whatsappSessao.findMany({ where: { creds: { not: null } }, select: { id: true } });
    this.log.info({ total: salvas.length }, "reconectando sessões salvas");
    for (const s of salvas) await this.conectar(s.id).catch((e) => this.log.error({ e, id: s.id }, "falha ao reconectar"));
  }

  /** Inicia (ou retoma) a conexão. Sem login salvo, o WhatsApp gera o QR Code. */
  async conectar(id: string, usuarioId?: string) {
    if (this.conexoes.has(id)) return; // já está conectando/conectada
    await prisma.whatsappSessao.upsert({
      where: { id },
      create: { id, usuarioId: usuarioId ?? null, status: StatusWhatsapp.CONECTANDO },
      update: { status: StatusWhatsapp.CONECTANDO, erro: null, qr: null, qrEm: null },
    });
    await this.abrirSocket(id, 0);
  }

  private async abrirSocket(id: string, tentativas: number) {
    if (!this.versao) {
      // Versão atual do WhatsApp Web; se não conseguir buscar, usa a padrão do Baileys.
      this.versao = await fetchLatestBaileysVersion().then((r) => r.version).catch(() => undefined);
      this.log.info({ versao: this.versao ?? "padrão do Baileys" }, "versão do WhatsApp Web");
    }
    const { state, salvarCreds } = await usarAuthNoBanco(id, this.chave);
    // Mensagens internas do Baileys: só avisos/erros, a não ser no modo de diagnóstico (debug).
    const logBaileys = this.log.child({ sessao: id }, { level: this.log.isLevelEnabled("debug") ? "debug" : "warn" });
    const sock = makeWASocket({
      version: this.versao,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logBaileys) },
      logger: logBaileys,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false, // não aparece "online" para os contatos a cada reconexão
      syncFullHistory: false,
    });
    const conexao: Conexao = { sock, tentativas, encerrando: false, qrGerado: false };
    this.conexoes.set(id, conexao);

    // Guarda a última gravação para esperar por ela antes de reconectar
    // (senão a reconexão pode ler o login antigo do banco).
    let ultimaGravacao: Promise<void> = Promise.resolve();
    sock.ev.on("creds.update", () => {
      ultimaGravacao = ultimaGravacao.then(salvarCreds).catch((e) => this.log.error({ e, id }, "falha ao salvar credenciais"));
    });

    // Respostas dos contatos (só conversas individuais, recebidas, com texto)
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" || !this.aoReceber) return;
      for (const msg of messages) {
        const k = msg.key;
        if (k.fromMe || !k.remoteJid || k.remoteJid.endsWith("@g.us") || k.remoteJid === "status@broadcast") continue;
        // No WhatsApp novo o contato pode vir como "LID"; o número real vem em remoteJidAlt.
        const jid = isLidUser(k.remoteJid) ? k.remoteJidAlt ?? "" : k.remoteJid;
        const telefone = numeroDoJid(jid);
        if (!telefone || !/^\d{8,15}$/.test(telefone)) continue;
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
        this.log.info({ id, tipo, temTexto: !!texto }, "mensagem recebida de contato");
        await this.aoReceber(id, telefone, texto, { texto, tipo, baixarImagem }).catch((e) => this.log.error({ e, id }, "falha ao registrar resposta"));
      }
    });

    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        conexao.qrGerado = true;
        await this.gravar(id, { status: StatusWhatsapp.AGUARDANDO_QR, qr: u.qr, qrEm: new Date(), erro: null });
      }
      if (u.connection === "open") {
        conexao.tentativas = 0;
        await this.gravar(id, { status: StatusWhatsapp.CONECTADO, qr: null, qrEm: null, erro: null, numero: numeroDoJid(sock.user?.id), conectadoEm: new Date() });
        // Primeira conexão deste número: base do aquecimento (decisão #64)
        await prisma.whatsappSessao.updateMany({ where: { id, primeiraConexaoEm: null }, data: { primeiraConexaoEm: new Date() } });
        void this.aoConectar?.(id).catch((e) => this.log.error({ e, id }, "falha ao atender quem esperava a reconexão"));
        this.log.info({ id }, "WhatsApp conectado");
      }
      if (u.connection === "close") {
        this.conexoes.delete(id);
        if (conexao.encerrando) return; // desconexão pedida pelo usuário: já tratada em desconectar()
        const codigo = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode ?? 0;
        this.log.warn({ id, codigo }, "conexão fechada");

        const d = decidirQueda(codigo, !!state.creds.me?.id, conexao.qrGerado, conexao.tentativas);
        if (d.acao === "encerrar") {
          if (d.apagarLogin) await apagarAuth(id);
          await this.gravar(id, { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null, numero: null, erro: d.erro });
          return;
        }
        await ultimaGravacao;
        await this.gravar(id, { status: StatusWhatsapp.CONECTANDO, qr: null, qrEm: null });
        setTimeout(() => void this.abrirSocket(id, conexao.tentativas + 1).catch((e) => this.log.error({ e, id }, "falha ao reconectar")), d.esperaMs);
      }
    });
  }

  /** Desconecta e apaga o login salvo (o aparelho some da lista do celular). */
  async desconectar(id: string) {
    const c = this.conexoes.get(id);
    if (c) {
      c.encerrando = true;
      await c.sock.logout().catch(() => c.sock.end(undefined));
      this.conexoes.delete(id);
    }
    await apagarAuth(id);
    await prisma.whatsappSessao.updateMany({ where: { id }, data: { status: StatusWhatsapp.DESCONECTADO, qr: null, qrEm: null, numero: null, erro: null } });
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
    for (const c of this.conexoes.values()) {
      c.encerrando = true;
      c.sock.end(undefined);
    }
    this.conexoes.clear();
  }
}
