// Chat para interessados (decisão #104): a IA responde o visitante da tela de Planos em nome do FilaPro Leads,
// usando a ficha do Empresa | IA do Super Admin e os planos visíveis. Se não souber, pausa e avisa o Super Admin.
import type { Logger } from "pino";
import { prisma, Cargo } from "@filapro/db";
import { responderConversa, MENSAGENS_RECENTES, type MensagemConversa } from "@filapro/ia/src/conversa.ts";
import { ErroIA } from "@filapro/ia/src/tipos.ts";
import { emManutencao } from "./manutencao.js";
import { pontoLigado } from "./ia-plataforma.js";

export const MOTIVO_INTERESSADO_NAO_SEI = "A IA não soube responder";

type Opcoes = {
  /** Espera antes de responder (junta mensagens seguidas) */
  esperaMs?: () => number;
  /** Avisa o Super Admin (WhatsApp de avisos e celular) */
  avisarSuporte?: (texto: string) => Promise<void>;
};

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export class AtendenteInteressados {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private log: Logger, private op: Opcoes = {}) {}

  /** Nova mensagem do visitante: responde em alguns segundos (várias seguidas viram uma resposta só). */
  agendar(id: string) {
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      void (async () => {
        if (await emManutencao()) { this.agendar(id); return; }
        await this.responder(id);
      })().catch((e) => this.log.error({ e, id }, "falha ao responder interessado"));
    }, this.op.esperaMs ? this.op.esperaMs() : 3000));
  }

  pendentes() { return this.timers.size; }

  /**
   * O Super Admin religou o ponto Visitante (decisão #149): a IA responde quem escreveu e ficou esperando
   * (conversas ativas nas últimas 48 h cujo último recado é do visitante).
   */
  async religou() {
    if (!(await pontoLigado("VISITANTE"))) return;
    const desde = new Date(Date.now() - 48 * 3600_000);
    const its = await prisma.interessado.findMany({ where: { iaPausada: false, ultimaMensagemEm: { gte: desde } }, select: { id: true, mensagens: { orderBy: { criadoEm: "desc" }, take: 1, select: { autor: true } } } });
    for (const i of its) if (i.mensagens[0]?.autor === "VISITANTE") this.agendar(i.id);
  }

  async responder(id: string) {
    // Ponto Visitante desligado pelo Super Admin (decisão #149): só o Super Admin responde; ao religar, a IA retoma quem esperou
    if (!(await pontoLigado("VISITANTE"))) return;
    const it = await prisma.interessado.findUnique({ where: { id } });
    if (!it || it.iaPausada) return;
    const recentes = (await prisma.interessadoMensagem.findMany({ where: { interessadoId: id }, orderBy: { criadoEm: "desc" }, take: MENSAGENS_RECENTES })).reverse();
    if (recentes.at(-1)?.autor !== "VISITANTE") return; // já respondido
    const sa = await prisma.usuario.findFirst({ where: { cargo: Cargo.SUPERADMIN }, orderBy: { criadoEm: "asc" }, select: { id: true } });
    const ficha = sa ? await prisma.fichaEmpresa.findUnique({ where: { superAdminId: sa.id } }) : null;
    const planos = await prisma.plano.findMany({ where: { visivel: true }, orderBy: { ordem: "asc" } });
    const textoPlanos = planos.map((p) => `- ${p.nome}: ${p.personalizado || p.precoAtual == null ? "sob consulta" : reais(p.precoAtual)}${p.prazoDias ? ` por ${p.prazoDias} dias` : ""}${p.recursos?.length ? ` — ${p.recursos.join("; ")}` : ""}`).join("\n");
    const fichaTexto = [
      "Empresa: FilaPro Leads (sistema de prospecção pelo WhatsApp com IA e proteção contra bloqueio).",
      ficha?.resumo?.trim() ?? "",
      textoPlanos ? `Planos à venda:\n${textoPlanos}` : "",
    ].filter(Boolean).join("\n\n");
    const paraIA = (m: { autor: string; texto: string }): MensagemConversa => ({ autor: m.autor === "VISITANTE" ? "LEAD" : "IA", texto: m.texto || "(arquivo)" });
    let r;
    try {
      r = await responderConversa(
        { ficha: fichaTexto, comoQualificar: ficha?.comoQualificar ?? "", resumo: "", nomeLead: it.nome, recentes: recentes.map(paraIA), visitanteSite: true },
        { empresaId: null, usuarioId: sa?.id ?? null },
      );
    } catch (e) {
      this.log.warn({ id, msg: e instanceof ErroIA ? e.message : String(e) }, "IA não respondeu o interessado");
      return;
    }
    // Pode ter sido assumida enquanto a IA pensava
    const agora = await prisma.interessado.findUnique({ where: { id }, select: { iaPausada: true } });
    if (!agora || agora.iaPausada) return;
    await prisma.interessadoMensagem.create({ data: { interessadoId: id, autor: "IA", texto: r.resposta } });
    await prisma.interessado.update({
      where: { id },
      data: {
        ultimaMensagemEm: new Date(), naoLidasVisitante: { increment: 1 }, temperatura: r.temperatura,
        ...(r.naoSei ? { iaPausada: true, iaPausaMotivo: MOTIVO_INTERESSADO_NAO_SEI } : {}),
      },
    });
    if (r.naoSei) await this.op.avisarSuporte?.(`💬 Interessado ${it.nome} (+${it.whatsapp}) perguntou algo que a IA não soube responder. A IA pausou: responda em Atendimento → Interessados.`).catch(() => undefined);
  }
}
