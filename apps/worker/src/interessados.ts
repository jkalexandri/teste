// Chat para interessados (decisão #104): a IA responde o visitante da tela de Planos em nome do FilaPro Leads,
// usando a ficha do Empresa | IA do Super Admin e os planos visíveis. Se não souber, pausa e avisa o Super Admin.
import type { Logger } from "pino";
import { prisma, Cargo } from "@filapro/db";
import { responderConversa, MENSAGENS_RECENTES, type MensagemConversa } from "@filapro/ia/src/conversa.ts";
import { ErroIA } from "@filapro/ia/src/tipos.ts";
import { emManutencao } from "./manutencao.js";
import { lerMaterialComercial, textoDosPlanos, type PlanoParaTexto } from "./comercial.js";
import { pontoLigado } from "./ia-plataforma.js";

export const MOTIVO_INTERESSADO_NAO_SEI = "A IA não soube responder";

type Opcoes = {
  /** Espera antes de responder (junta mensagens seguidas) */
  esperaMs?: () => number;
  /** Avisa o Super Admin (WhatsApp de avisos e celular) */
  avisarSuporte?: (texto: string) => Promise<void>;
  /** A IA que responde (nos testes, uma que registra o que recebeu) */
  ia?: typeof responderConversa;
  /** Material comercial (nos testes, fixo) */
  lerMaterial?: () => Promise<string>;
};

/** Limite dos testes do Super Admin (cada teste usa IA) */
export const LIMITE_TESTES_VISITANTE_HORA = 10;


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

  /**
   * Tudo o que a IA do Fale conosco sabe (decisão #178): ficha da empresa, planos com preço e PROMOÇÃO exatamente como cadastrados,
   * material comercial (arquivo do projeto) e o script de atendimento do Super Admin.
   */
  async conhecimento(superAdminId: string | null) {
    let ficha = superAdminId ? await prisma.fichaEmpresa.findUnique({ where: { superAdminId } }) : null;
    // O script pode ter sido salvo por outro Super Admin (cada um tem a própria ficha): se a ficha usada não tem script, vale o do primeiro Super Admin que tenha
    let orientacoes = ficha?.orientacoesVisitante ?? "";
    if (!orientacoes.trim()) {
      const outra = await prisma.fichaEmpresa.findFirst({ where: { superAdminId: { not: null }, orientacoesVisitante: { not: "" } }, orderBy: { id: "asc" }, select: { orientacoesVisitante: true } }).catch(() => null);
      if (outra?.orientacoesVisitante.trim()) orientacoes = outra.orientacoesVisitante;
    }
    const planos = await prisma.plano.findMany({ where: { visivel: true }, orderBy: { ordem: "asc" } });
    const textoPlanos = textoDosPlanos(planos as PlanoParaTexto[]);
    const ficha_ = [
      "Empresa: FilaPro Leads (sistema de prospecção pelo WhatsApp com IA e proteção contra bloqueio).",
      ficha?.resumo?.trim() ?? "",
      textoPlanos ? `Planos à venda (valores, promoções e condições valem EXATAMENTE como estão aqui):\n${textoPlanos}` : "",
    ].filter(Boolean).join("\n\n");
    const comercial = await (this.op.lerMaterial ?? lerMaterialComercial)().catch(() => "");
    const promocoes = (planos as PlanoParaTexto[]).filter((p) => p.precoAntigo != null && p.precoAtual != null && p.precoAntigo > p.precoAtual && !p.gratis && !p.personalizado).length;
    return {
      ficha: ficha_, comoQualificar: ficha?.comoQualificar ?? "", comercial, orientacoesVisitante: orientacoes,
      usando: { script: orientacoes.trim().length, material: comercial.length, planos: planos.length, promocoes },
    };
  }

  private testes = new Map<string, number[]>();

  /** Teste do Super Admin: o que a IA do Fale conosco responderia a esta mensagem (usa o script SALVO). Não cria conversa nem avisa ninguém. */
  async testar(superAdminId: string, pergunta: string): Promise<{ ok: true; resposta: string; vaiParaAtendente: boolean; temperatura: string; usando: { script: number; material: number; planos: number; promocoes: number } } | { ok: false; mensagem: string }> {
    const texto = pergunta.trim().slice(0, 1000);
    if (!texto) return { ok: false, mensagem: "Escreva uma pergunta." };
    const agora = Date.now();
    const usados = (this.testes.get(superAdminId) ?? []).filter((t) => agora - t < 3_600_000);
    if (usados.length >= LIMITE_TESTES_VISITANTE_HORA) {
      const min = Math.ceil((3_600_000 - (agora - usados[0]!)) / 60_000);
      return { ok: false, mensagem: `Limite de ${LIMITE_TESTES_VISITANTE_HORA} testes por hora. Tente de novo em ${min} min.` };
    }
    this.testes.set(superAdminId, [...usados, agora]);
    try {
      const k = await this.conhecimento(superAdminId);
      const r = await (this.op.ia ?? responderConversa)(
        { ficha: k.ficha, comoQualificar: k.comoQualificar, comercial: k.comercial, orientacoesVisitante: k.orientacoesVisitante, resumo: "", nomeLead: "Visitante", recentes: [{ autor: "LEAD", texto }], visitanteSite: true },
        { empresaId: null, usuarioId: superAdminId },
      );
      return { ok: true, resposta: r.resposta, vaiParaAtendente: r.naoSei, temperatura: r.temperatura, usando: k.usando };
    } catch (e) {
      this.log.warn({ msg: e instanceof ErroIA ? e.message : String(e) }, "IA não respondeu o teste do Fale conosco");
      return { ok: false, mensagem: e instanceof ErroIA ? e.message : "A IA não respondeu agora. Tente de novo." };
    }
  }

  async responder(id: string) {
    // Ponto Visitante desligado pelo Super Admin (decisão #149): só o Super Admin responde; ao religar, a IA retoma quem esperou
    if (!(await pontoLigado("VISITANTE"))) return;
    const it = await prisma.interessado.findUnique({ where: { id } });
    if (!it || it.iaPausada) return;
    const recentes = (await prisma.interessadoMensagem.findMany({ where: { interessadoId: id }, orderBy: { criadoEm: "desc" }, take: MENSAGENS_RECENTES })).reverse();
    if (recentes.at(-1)?.autor !== "VISITANTE") return; // já respondido
    const sa = await prisma.usuario.findFirst({ where: { cargo: Cargo.SUPERADMIN }, orderBy: { criadoEm: "asc" }, select: { id: true } });
    const base = await this.conhecimento(sa?.id ?? null);
    const paraIA = (m: { autor: string; texto: string }): MensagemConversa => ({ autor: m.autor === "VISITANTE" ? "LEAD" : "IA", texto: m.texto || "(arquivo)" });
    let r;
    try {
      r = await (this.op.ia ?? responderConversa)(
        { ficha: base.ficha, comoQualificar: base.comoQualificar, comercial: base.comercial, orientacoesVisitante: base.orientacoesVisitante, resumo: "", nomeLead: it.nome, recentes: recentes.map(paraIA), visitanteSite: true },
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
