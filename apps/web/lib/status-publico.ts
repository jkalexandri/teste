// Pílula de status do login (decisão #109): estado real do sistema, da fila de envios e o uptime medido.
// Cores: verde = tudo no ar; amarelo = em atualização; vermelho = serviço 24/7 sem responder.
import "server-only";
import { prisma } from "@filapro/db";
import { emManutencao } from "@/lib/manutencao";

type Cor = "verde" | "amarelo" | "vermelho";
/** cor = estado geral; corFila = situação do motor de envios (bolinha própria — decisão #110) */
export type StatusPublico = { cor: Cor; sistema: string; fila: string; corFila: Cor; uptime: string | null };
let cache: { em: number; v: StatusPublico } | null = null;

async function saudeDoServico(): Promise<{ ok: boolean; disparos: boolean }> {
  if (!process.env.WORKER_URL) return { ok: false, disparos: false };
  try {
    const r = await fetch(new URL("/saude", process.env.WORKER_URL), { cache: "no-store", signal: AbortSignal.timeout(3_000) });
    if (!r.ok) return { ok: false, disparos: false };
    const j = (await r.json().catch(() => ({}))) as { disparos?: boolean };
    return { ok: true, disparos: j.disparos !== false };
  } catch {
    return { ok: false, disparos: false };
  }
}

/** Uptime dos últimos 30 dias (ou desde o início da medição). Null com menos de 1 hora medida. */
async function uptime(): Promise<string | null> {
  const agora = Date.now();
  const desde = new Date(agora - 30 * 86400_000);
  const [primeira, soma] = await Promise.all([
    prisma.disponibilidade.findFirst({ where: { hora: { gte: desde } }, orderBy: { hora: "asc" }, select: { hora: true } }),
    prisma.disponibilidade.aggregate({ _sum: { minutos: true }, where: { hora: { gte: desde } } }),
  ]);
  if (!primeira) return null;
  const esperados = Math.floor((agora - primeira.hora.getTime()) / 60_000);
  if (esperados < 60) return null;
  const pct = Math.min(100, ((soma._sum.minutos ?? 0) / esperados) * 100);
  return `${pct >= 99.95 ? "100" : pct.toFixed(1)}%`;
}

export async function statusPublico(): Promise<StatusPublico> {
  if (cache && Date.now() - cache.em < 30_000) return cache.v;
  const [manut, saude, up] = await Promise.all([emManutencao(), saudeDoServico(), uptime().catch(() => null)]);
  const v: StatusPublico = manut
    ? { cor: "amarelo", sistema: "Em atualização", fila: "Em manutenção", corFila: "amarelo", uptime: up }
    : !saude.ok
      ? { cor: "vermelho", sistema: "Instabilidade", fila: "Fila parada", corFila: "vermelho", uptime: up }
      : { cor: "verde", sistema: "Sistema Online", fila: saude.disparos ? "Fila Ativa" : "Fila pausada", corFila: saude.disparos ? "verde" : "amarelo", uptime: up };
  cache = { em: Date.now(), v };
  return v;
}
