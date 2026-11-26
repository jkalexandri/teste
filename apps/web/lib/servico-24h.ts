// Sinal de vida do serviço 24/7 (decisão #151 — M2 da auditoria do Módulo 4).
// O serviço confirma a cada 20 s, no banco, que está no ar (apps/worker/src/instancia.ts, decisão #133). Quem lê o estado
// do WhatsApp só do banco veria "Conectado" mesmo com o serviço parado: aqui sabemos se ele está mesmo no ar.
import "server-only";
import { prisma } from "@filapro/db";

/** Mesmo registro de apps/worker/src/instancia.ts */
export const REGISTRO_SERVICO = "servico24h";
/** Na tela: sem sinal há mais de 90 s = fora do ar (o sinal vem a cada 20 s; uma pausa curta não pode piscar "fora do ar") */
export const LIMITE_TELA_MS = 90_000;
/** No aviso por e-mail: sem sinal há mais de 3 min */
export const LIMITE_ALERTA_MS = 3 * 60_000;

export type SinalServico = { noAr: boolean; ultimoSinalEm: Date | null };

/** O serviço está no ar? Sem registro (desligado normalmente) ou sem sinal há mais que `limiteMs` = fora do ar. */
export async function sinalDoServico(limiteMs = LIMITE_TELA_MS, agora = new Date()): Promise<SinalServico> {
  const r = await prisma.servicoInstancia.findUnique({ where: { id: REGISTRO_SERVICO } });
  if (!r) return { noAr: false, ultimoSinalEm: null };
  return { noAr: agora.getTime() - r.vistoEm.getTime() <= limiteMs, ultimoSinalEm: r.vistoEm };
}
