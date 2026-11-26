// Atendimento por IA em 4 pontos (decisão #149): Leads, Campanhas, Suporte e Visitante não cliente.
// Estado de cada ponto para o Dashboard, o menu Inteligência Artificial e o verificador de avisos do serviço 24/7.
//   VERDE    ligado e funcionando
//   VERMELHO desligado pelo Super Admin
//   AMARELO  ligado, mas com atenção: manutenção, falta a chave da IA ou falhas recentes
import { prisma } from "@filapro/db";
import { configDaTarefa } from "./index";
import type { Tarefa } from "./tipos";

export const PONTOS_IA = ["LEADS", "CAMPANHAS", "SUPORTE", "VISITANTE"] as const;
export type PontoIA = (typeof PONTOS_IA)[number];
export type CorIA = "VERDE" | "AMARELO" | "VERMELHO";
/** Por que está amarelo: manutenção não gera aviso (acontece a cada atualização); chave e falhas geram. */
export type MotivoIA = "MANUTENCAO" | "CHAVE" | "FALHAS" | null;

export const ROTULO_PONTO: Record<PontoIA, string> = { LEADS: "Leads", CAMPANHAS: "Campanhas", SUPORTE: "Suporte", VISITANTE: "Visitante não Cliente" };
/** Qual tarefa de IA cada ponto usa. Leads, Suporte e Visitante usam a MESMA ("conversar"): falham juntos. */
export const TAREFA_PONTO: Record<PontoIA, Tarefa> = { LEADS: "conversar", CAMPANHAS: "gerar_mensagens", SUPORTE: "conversar", VISITANTE: "conversar" };
/** Coluna de ConfigVenda que liga/desliga cada ponto */
export const CAMPO_PONTO = { LEADS: "iaLeadsLigada", CAMPANHAS: "iaCampanhasLigada", SUPORTE: "iaSuporteLigada", VISITANTE: "iaVisitanteLigada" } as const;

/** Falhas recentes: pelo menos 3 nos últimos 15 minutos E a última chamada também falhou (uma falha isolada não acende o amarelo). */
export const JANELA_FALHAS_MS = 15 * 60_000;
export const MIN_FALHAS = 3;

export type StatusPonto = { ponto: PontoIA; rotulo: string; ligado: boolean; cor: CorIA; motivo: MotivoIA; texto: string };

export async function statusAtendimentoIA(agora = new Date(), producao = process.env.NEXT_PUBLIC_APP_ENV === "production"): Promise<StatusPonto[]> {
  const [venda, manutencao] = await Promise.all([
    prisma.configVenda.findUnique({ where: { id: "config" } }),
    prisma.manutencao.findUnique({ where: { id: "geral" } }).catch(() => null),
  ]);
  const tarefas = [...new Set(Object.values(TAREFA_PONTO))];
  // Por tarefa: falta chave? falhas recentes?
  const porTarefa = new Map<Tarefa, { semChave: boolean; falhas: number }>();
  for (const t of tarefas) {
    const cfg = await configDaTarefa(t);
    const semChave = (cfg.provedor === "anthropic" && !cfg.chave) || (cfg.provedor === "simulado" && producao);
    const recentes = await prisma.usoIA.findMany({ where: { tarefa: t, criadoEm: { gte: new Date(agora.getTime() - JANELA_FALHAS_MS), lte: agora } }, orderBy: { criadoEm: "desc" }, select: { ok: true } });
    const falhas = recentes.filter((r) => !r.ok).length;
    porTarefa.set(t, { semChave, falhas: recentes[0] && !recentes[0].ok ? falhas : 0 });
  }
  return PONTOS_IA.map((ponto) => {
    const ligado = !!venda?.[CAMPO_PONTO[ponto]];
    const base = { ponto, rotulo: ROTULO_PONTO[ponto], ligado };
    if (!ligado) return { ...base, cor: "VERMELHO" as const, motivo: null, texto: "Desligado" };
    const t = porTarefa.get(TAREFA_PONTO[ponto])!;
    if (t.semChave) return { ...base, cor: "AMARELO" as const, motivo: "CHAVE" as const, texto: "Atenção: falta a chave da IA" };
    if (t.falhas >= MIN_FALHAS) return { ...base, cor: "AMARELO" as const, motivo: "FALHAS" as const, texto: `Atenção: ${t.falhas} falhas da IA nos últimos 15 min` };
    if (manutencao?.ligada) return { ...base, cor: "AMARELO" as const, motivo: "MANUTENCAO" as const, texto: "Atenção: sistema em manutenção" };
    return { ...base, cor: "VERDE" as const, motivo: null, texto: "Ligado" };
  });
}

/** A cor que vale para AVISO: manutenção conta como verde (não avisa a cada atualização do sistema). */
export const corDeAviso = (s: Pick<StatusPonto, "cor" | "motivo">): CorIA => (s.cor === "AMARELO" && s.motivo === "MANUTENCAO" ? "VERDE" : s.cor);
