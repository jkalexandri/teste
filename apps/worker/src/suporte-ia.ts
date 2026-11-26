// IA no suporte dos clientes (decisão #146): responde quem escreve pelo botão Suporte, em nome do FilaPro Leads.
// Usa a ficha do Empresa | IA do Super Admin, o manual do perfil de quem pergunta e os dados da PRÓPRIA conta dele.
// Passa para o atendente (pausa a IA e avisa o Super Admin) quando: a IA não sabe, o assunto é sensível (pagamento, cobrança,
// cancelamento, conta bloqueada, reclamação), o cliente pede uma pessoa, manda arquivo, chega ao limite do dia ou a IA falha.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "pino";
import { prisma, Cargo, StatusWhatsapp } from "@filapro/db";
import { responderSuporte, MENSAGENS_RECENTES, type MensagemSuporte } from "@filapro/ia/src/conversa.ts";
import { ErroIA } from "@filapro/ia/src/tipos.ts";
import { emManutencao } from "./manutencao.js";
import { inicioDoDia } from "./fila-plataforma.js";
import { enviarPush } from "./push.js";

/** Quantas respostas da IA por conversa por dia (dia de Brasília); depois pausa e chama o atendente */
export const LIMITE_RESPOSTAS_DIA = 20;
export const MOTIVO_NAO_SEI = "A IA não soube responder";
export const MOTIVO_HUMANO = "O cliente pediu um atendente";
export const MOTIVO_SENSIVEL = "Assunto que fica com o atendente (pagamento, cobrança, cancelamento, bloqueio ou reclamação)";
export const MOTIVO_ARQUIVO = "O cliente enviou um arquivo";
export const MOTIVO_LIMITE = `Limite de ${LIMITE_RESPOSTAS_DIA} respostas da IA no dia`;
export const MOTIVO_ERRO = "A IA não conseguiu responder (erro)";
export const MOTIVO_ASSUMIDA = "Assumida pelo Super Admin";

const PASSANDO = "Certo! Vou chamar um atendente para te ajudar com isso. Você será respondido por aqui assim que possível.";
const PASSANDO_ARQUIVO = "Recebi o seu arquivo! Vou chamar um atendente para ver com você. Você será respondido por aqui assim que possível.";

/** Sem acentos e em minúsculas, para as regras de assunto */
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PEDE_HUMANO = /atendente|humano|pessoa de verdade|pessoa real|falar com (alguem|uma pessoa|o suporte)/;
const SENSIVEL = /pagamento|pagar|paguei|pago\b|cobranc|cobrar|boleto|fatura|cartao|estorno|reembolso|devolucao|devolver|cancel|bloquead|bloqueio|reclama|procon|golpe|fraude|processo/;

/** Decide, só pelo texto do cliente, se a conversa já vai direto para o atendente (sem gastar IA). */
export function assuntoDoAtendente(texto: string): string | null {
  const t = normalizar(texto);
  if (PEDE_HUMANO.test(t)) return MOTIVO_HUMANO;
  if (SENSIVEL.test(t)) return MOTIVO_SENSIVEL;
  return null;
}

/** Máximo de caracteres das orientações do suporte (igual ao da tela Empresa | IA) */
export const MAX_ORIENTACOES = 6000;
/** Testes da tela Empresa | IA por hora (cada um usa IA) */
export const LIMITE_TESTES_HORA = 10;

/** Monta o conhecimento da IA (bloco fixo, em cache): ficha, orientações do Super Admin e manual do perfil. */
export function montarConhecimento(d: { ficha?: string | null; orientacoes?: string | null; manual?: string | null; cargo: Cargo }) {
  return [
    "Empresa: FilaPro Leads (sistema de prospecção pelo WhatsApp com IA e proteção contra bloqueio).",
    d.ficha?.trim() ? `Ficha da empresa:\n${d.ficha.trim()}` : "",
    d.orientacoes?.trim() ? `Orientações do atendimento (definidas pelo dono do FilaPro Leads; valem mais que o manual se houver conflito, mas nunca mais que as regras de segurança):\n${d.orientacoes.trim().slice(0, MAX_ORIENTACOES)}` : "",
    d.manual ? `Manual de uso do FilaPro Leads para este perfil (${d.cargo === Cargo.ADMIN_EMPRESA ? "Admin da Empresa" : "Usuário"}):\n${d.manual}` : "",
  ].filter(Boolean).join("\n\n");
}

type Opcoes = {
  /** Espera antes de responder (junta mensagens seguidas) */
  esperaMs?: () => number;
  /** Avisa o Super Admin (WhatsApp de avisos e celular) */
  avisarSuporte?: (texto: string, url: string) => Promise<void>;
  /** Texto do manual do perfil (nos testes, fixo) */
  lerManual?: (cargo: Cargo) => Promise<string>;
  agora?: () => Date;
  /** A IA que responde (nos testes, uma que registra o que recebeu) */
  ia?: typeof responderSuporte;
};

const PASTA_MANUAIS = process.env.PASTA_MANUAIS || fileURLToPath(new URL("../../../docs/manuais/", import.meta.url));

async function manualDoPerfil(cargo: Cargo) {
  const arq = cargo === Cargo.ADMIN_EMPRESA ? "admin-empresa.md" : "usuario.md";
  return (await readFile(join(PASTA_MANUAIS, arq), "utf8")).slice(0, 30_000);
}

export class AtendenteSuporte {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Conversas com resposta em andamento: uma por vez, para duas respostas não se atropelarem */
  private ocupados = new Set<string>();
  /** Até que mensagem do cliente (hora) cada conversa já foi respondida. Sem isso, a mensagem que chega ENQUANTO a IA pensa
   *  ficaria "antes" da resposta e nunca seria respondida. */
  private vistas = new Map<string, number>();
  constructor(private log: Logger, private op: Opcoes = {}) {}

  private agora() { return this.op.agora?.() ?? new Date(); }

  /** Nova mensagem do cliente: responde em alguns segundos (várias seguidas viram uma resposta só). */
  agendar(usuarioId: string) {
    clearTimeout(this.timers.get(usuarioId));
    this.timers.set(usuarioId, setTimeout(() => {
      this.timers.delete(usuarioId);
      void (async () => {
        if (this.ocupados.has(usuarioId)) { this.agendar(usuarioId); return; } // ainda respondendo a anterior
        this.ocupados.add(usuarioId);
        try {
          if (await emManutencao()) { this.agendar(usuarioId); return; }
          await this.responder(usuarioId);
        } finally {
          this.ocupados.delete(usuarioId);
        }
      })().catch((e) => this.log.error({ e, usuarioId }, "falha ao responder o suporte"));
    }, this.op.esperaMs ? this.op.esperaMs() : 3000));
  }

  pendentes() { return this.timers.size + this.ocupados.size; }

  /**
   * O Super Admin religou o ponto Suporte (decisão #149): a IA responde quem escreveu e ficou esperando
   * (conversas ativas nas últimas 48 h, não pausadas, cujo último recado é do cliente).
   */
  async religou() {
    const cfg = await prisma.configVenda.findUnique({ where: { id: "config" }, select: { iaSuporteLigada: true } });
    if (!cfg?.iaSuporteLigada) return;
    const desde = new Date(this.agora().getTime() - 48 * 3600_000);
    const cs = await prisma.suporteConversa.findMany({ where: { iaPausada: false, ultimaMensagemEm: { gte: desde } }, select: { usuarioId: true, mensagens: { orderBy: { criadoEm: "desc" }, take: 1, select: { autor: true } } } });
    for (const c of cs) if (c.mensagens[0]?.autor === "CLIENTE") this.agendar(c.usuarioId);
  }

  async responder(usuarioId: string) {
    const cfg = await prisma.configVenda.findUnique({ where: { id: "config" }, select: { iaSuporteLigada: true } });
    if (!cfg?.iaSuporteLigada) return;
    const conversa = await prisma.suporteConversa.findUnique({ where: { usuarioId } });
    if (!conversa || conversa.iaPausada) return;
    const recentes = (await prisma.suporteMensagem.findMany({ where: { conversaId: conversa.id }, orderBy: { criadoEm: "desc" }, take: MENSAGENS_RECENTES })).reverse();
    if (recentes.at(-1)?.autor === "SUPORTE") return; // o Super Admin respondeu
    const cliente = await prisma.usuario.findUnique({ where: { id: usuarioId }, include: { empresa: true } });
    if (!cliente || cliente.cargo === Cargo.SUPERADMIN) return;

    // O que o cliente escreveu desde a última resposta (várias mensagens seguidas valem como uma)
    const visto = this.vistas.get(conversa.id);
    let naoRespondidas: typeof recentes = [];
    if (visto) naoRespondidas = recentes.filter((m) => m.autor === "CLIENTE" && m.criadoEm.getTime() > visto);
    else for (const m of [...recentes].reverse()) { if (m.autor !== "CLIENTE") break; naoRespondidas.unshift(m); }
    if (!naoRespondidas.length) return; // já respondido
    this.vistas.set(conversa.id, Math.max(...naoRespondidas.map((m) => m.criadoEm.getTime())));
    const textoCliente = naoRespondidas.map((m) => m.texto).join("\n");

    // Regras que não dependem da IA (e não gastam IA): arquivo, pedido de atendente, assunto sensível, limite do dia
    if (naoRespondidas.some((m) => m.arquivoNome || m.tipo !== "texto")) return this.passar(conversa.id, cliente, MOTIVO_ARQUIVO, PASSANDO_ARQUIVO, textoCliente);
    const assunto = assuntoDoAtendente(textoCliente);
    if (assunto) return this.passar(conversa.id, cliente, assunto, PASSANDO, textoCliente);
    const hoje = await prisma.suporteMensagem.count({ where: { conversaId: conversa.id, autor: "IA", criadoEm: { gte: inicioDoDia(this.agora()) } } });
    if (hoje >= LIMITE_RESPOSTAS_DIA) return this.passar(conversa.id, cliente, MOTIVO_LIMITE, PASSANDO, textoCliente);

    // Conhecimento: ficha do Super Admin + manual do perfil; dados só da PRÓPRIA conta do cliente
    const sa = await prisma.usuario.findFirst({ where: { cargo: Cargo.SUPERADMIN }, orderBy: { criadoEm: "asc" }, select: { id: true } });
    const ficha = sa ? await prisma.fichaEmpresa.findUnique({ where: { superAdminId: sa.id } }) : null;
    const manual = await (this.op.lerManual ?? manualDoPerfil)(cliente.cargo).catch((e) => { this.log.warn({ e }, "manual não lido: a IA responde sem ele"); return ""; });
    const conhecimento = montarConhecimento({ ficha: ficha?.resumo, orientacoes: ficha?.orientacoesSuporte, manual, cargo: cliente.cargo });
    const dadosConta = await this.dadosDaConta(cliente);
    const paraIA = (m: { autor: string; texto: string; tipo: string }): MensagemSuporte => ({ autor: m.autor as MensagemSuporte["autor"], texto: m.texto || "(arquivo)", tipo: m.tipo });
    let r;
    try {
      r = await (this.op.ia ?? responderSuporte)({ conhecimento, dadosConta, nomeCliente: cliente.nome, recentes: recentes.map(paraIA) }, { empresaId: null, usuarioId: sa?.id ?? null });
    } catch (e) {
      this.log.warn({ usuarioId, msg: e instanceof ErroIA ? e.message : String(e) }, "IA não respondeu o suporte");
      return this.passar(conversa.id, cliente, MOTIVO_ERRO, PASSANDO, textoCliente);
    }
    // Pode ter sido assumida (ou desligada) enquanto a IA pensava
    const agora = await prisma.suporteConversa.findUnique({ where: { id: conversa.id }, select: { iaPausada: true } });
    const ligada = await prisma.configVenda.findUnique({ where: { id: "config" }, select: { iaSuporteLigada: true } });
    if (!agora || agora.iaPausada || !ligada?.iaSuporteLigada) return;
    await this.gravarResposta(conversa.id, cliente.id, r.resposta, r.chamarHumano ? MOTIVO_NAO_SEI : null);
    if (r.chamarHumano) await this.avisar(cliente, MOTIVO_NAO_SEI, textoCliente);
  }

  /** Grava a mensagem da IA, avisa o cliente (celular) e, se pediu, pausa a IA da conversa. */
  private async gravarResposta(conversaId: string, clienteId: string, texto: string, pausarMotivo: string | null) {
    await prisma.suporteMensagem.create({ data: { conversaId, autor: "IA", autorId: "ia", texto, tipo: "texto" } });
    await prisma.suporteConversa.update({
      where: { id: conversaId },
      data: { ultimaMensagemEm: this.agora(), naoLidasCliente: { increment: 1 }, ...(pausarMotivo ? { iaPausada: true, iaPausaMotivo: pausarMotivo } : {}) },
    });
    await enviarPush(clienteId, `💬 Suporte FilaPro Leads: ${texto.slice(0, 120)}`, "/dashboard?suporte=1").catch(() => undefined);
  }

  /** Passa para o atendente sem usar a IA: mensagem fixa ao cliente, IA pausada e aviso imediato ao Super Admin. */
  private async passar(conversaId: string, cliente: { id: string; nome: string; email: string }, motivo: string, textoAoCliente: string, textoCliente: string) {
    await this.gravarResposta(conversaId, cliente.id, textoAoCliente, motivo);
    await this.avisar(cliente, motivo, textoCliente);
  }

  private async avisar(cliente: { nome: string; email: string }, motivo: string, textoCliente: string) {
    await this.op.avisarSuporte?.(`💬 Suporte: ${cliente.nome} (${cliente.email}) precisa de você — ${motivo.toLowerCase()}. "${textoCliente.slice(0, 100)}". A IA pausou: responda em Atendimento.`, "/atendimento").catch(() => undefined);
  }

  private testes = new Map<string, number[]>();

  /**
   * Teste da tela Empresa | IA (decisão #148): o Super Admin escreve como se fosse o cliente e vê o que a IA responderia.
   * Não cria conversa nem avisa ninguém; usa o texto SALVO das orientações. Assunto sensível não gasta IA.
   * Limite de 10 testes por hora (cada um usa IA).
   */
  async testar(superAdminId: string, pergunta: string): Promise<{ ok: true; resposta: string; vaiParaAtendente: boolean; motivo: string } | { ok: false; mensagem: string }> {
    const texto = pergunta.trim().slice(0, 1000);
    if (!texto) return { ok: false, mensagem: "Escreva uma pergunta." };
    const agora = this.agora().getTime();
    const usados = (this.testes.get(superAdminId) ?? []).filter((t) => agora - t < 3_600_000);
    if (usados.length >= LIMITE_TESTES_HORA) {
      const min = Math.ceil((3_600_000 - (agora - usados[0]!)) / 60_000);
      return { ok: false, mensagem: `Limite de ${LIMITE_TESTES_HORA} testes por hora. Tente de novo em ${min} min.` };
    }
    const assunto = assuntoDoAtendente(texto);
    if (assunto) return { ok: true, resposta: PASSANDO, vaiParaAtendente: true, motivo: assunto };
    this.testes.set(superAdminId, [...usados, agora]);
    const ficha = await prisma.fichaEmpresa.findUnique({ where: { superAdminId } });
    const manual = await (this.op.lerManual ?? manualDoPerfil)(Cargo.USUARIO).catch(() => "");
    try {
      const r = await (this.op.ia ?? responderSuporte)(
        { conhecimento: montarConhecimento({ ficha: ficha?.resumo, orientacoes: ficha?.orientacoesSuporte, manual, cargo: Cargo.USUARIO }), dadosConta: "Perfil: Usuário (cliente de exemplo, só para teste)", nomeCliente: "Cliente de teste", recentes: [{ autor: "CLIENTE", texto }] },
        { empresaId: null, usuarioId: superAdminId },
      );
      return { ok: true, resposta: r.resposta, vaiParaAtendente: r.chamarHumano, motivo: r.chamarHumano ? MOTIVO_NAO_SEI : "" };
    } catch (e) {
      this.log.warn({ msg: e instanceof ErroIA ? e.message : String(e) }, "IA não respondeu o teste do suporte");
      return { ok: false, mensagem: e instanceof ErroIA ? e.message : "A IA não respondeu agora. Tente de novo." };
    }
  }

  /** Só o que o PRÓPRIO cliente já vê no sistema: plano, vencimento e situação do WhatsApp principal. */
  private async dadosDaConta(c: { id: string; cargo: Cargo; empresaId: string | null; empresa: { nome: string; modulo: string; planoId: string | null; expiraEm: Date } | null }) {
    const linhas: string[] = [`Perfil: ${c.cargo === Cargo.ADMIN_EMPRESA ? "Admin da Empresa" : "Usuário"}`];
    if (c.empresa) {
      const plano = c.empresa.planoId ? await prisma.plano.findUnique({ where: { id: c.empresa.planoId }, select: { nome: true } }) : null;
      linhas.push(`Conta: ${c.empresa.nome} (${c.empresa.modulo === "EMPRESARIAL" ? "Empresarial" : "Individual"})`);
      if (plano) linhas.push(`Plano: ${plano.nome}`);
      linhas.push(`Vencimento do plano: ${c.empresa.expiraEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
    }
    if (c.cargo === Cargo.USUARIO) {
      const w = await prisma.whatsappSessao.findUnique({ where: { id: c.id }, select: { status: true } });
      const nomes: Record<string, string> = { [StatusWhatsapp.CONECTADO]: "conectado", [StatusWhatsapp.RECONECTANDO]: "reconectando", [StatusWhatsapp.AGUARDANDO_QR]: "aguardando a leitura do QR Code", [StatusWhatsapp.CONECTANDO]: "conectando", [StatusWhatsapp.DESCONECTADO]: "desconectado" };
      linhas.push(`WhatsApp principal: ${w ? nomes[w.status] ?? w.status : "ainda não conectado"}`);
    }
    return linhas.join("\n");
  }
}
