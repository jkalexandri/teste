// Gerenciador das conexões do WhatsApp (uma por usuário + a da plataforma).
// Mantém cada conexão viva, guarda o estado no banco (as telas leem de lá)
// e reconecta sozinho em caso de queda.
import makeWASocket, { Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, type WASocket } from "@whiskeysockets/baileys";
import type { Logger } from "pino";
import { prisma, StatusWhatsapp } from "@filapro/db";
import { apagarAuth, usarAuthNoBanco } from "./auth-banco.js";
import { numeroDoJid, paraJid } from "./numero.js";
import { decidirQueda } from "./queda.js";

/** Id fixo da sessão do número da plataforma (decisão #51). */
export const SESSAO_PLATAFORMA = "plataforma";

type Conexao = { sock: WASocket; tentativas: number; encerrando: boolean; qrGerado: boolean };

export class GerenciadorSessoes {
  private conexoes = new Map<string, Conexao>();
  private versao: [number, number, number] | undefined;

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
    }
    const { state, salvarCreds } = await usarAuthNoBanco(id, this.chave);
    const logBaileys = this.log.child({ sessao: id }, { level: "warn" });
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

    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        conexao.qrGerado = true;
        await this.gravar(id, { status: StatusWhatsapp.AGUARDANDO_QR, qr: u.qr, qrEm: new Date(), erro: null });
      }
      if (u.connection === "open") {
        conexao.tentativas = 0;
        await this.gravar(id, { status: StatusWhatsapp.CONECTADO, qr: null, qrEm: null, erro: null, numero: numeroDoJid(sock.user?.id), conectadoEm: new Date() });
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

  /** Fecha as conexões sem deslogar (desligamento do serviço; o login continua salvo). */
  encerrarTudo() {
    for (const c of this.conexoes.values()) {
      c.encerrando = true;
      c.sock.end(undefined);
    }
    this.conexoes.clear();
  }
}
