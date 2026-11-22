// Saldo de disparos da conta (decisão #102): planos por quantidade de envio e teste grátis.
// Conta só mensagem de campanha ENVIADA no período atual (desde a compra/última renovação).
import type { PrismaClient } from "@prisma/client";

/** Motivo usado ao pausar campanhas por falta de saldo (ao comprar pacote ou renovar, elas voltam sozinhas). */
export const MOTIVO_SEM_SALDO = "Disparos do período acabaram";

export type Saldo = { limite: number; extras: number; usados: number; restantes: number };

/** null = conta sem limite de disparos (plano só por prazo). */
export async function saldoDisparos(
  db: Pick<PrismaClient, "envio">,
  empresa: { id: string; limiteDisparos: number | null; disparosExtras: number; inicioPeriodo: Date } | null,
): Promise<Saldo | null> {
  if (!empresa || empresa.limiteDisparos == null) return null;
  const usados = await db.envio.count({ where: { campanha: { empresaId: empresa.id }, status: "ENVIADO", enviadoEm: { gte: empresa.inicioPeriodo } } });
  const total = empresa.limiteDisparos + empresa.disparosExtras;
  return { limite: empresa.limiteDisparos, extras: empresa.disparosExtras, usados, restantes: Math.max(0, total - usados) };
}
