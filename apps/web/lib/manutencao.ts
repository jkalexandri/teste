// Modo manutenção (decisão #103): estado lido do banco com cache curto (usado pelo middleware, layout e login).
import { createHash } from "node:crypto";
import { prisma, Cargo } from "@filapro/db";

export const MSG_MANUTENCAO = "Sistema em atualização. Volta em alguns minutos.";
let cache = { ligada: false, em: 0 };

/** Está em manutenção? Consulta o banco no máximo a cada 3 s; se o banco falhar (migração), mantém o último estado. */
export async function emManutencao(): Promise<boolean> {
  if (Date.now() - cache.em < 3000) return cache.ligada;
  try {
    const m = await prisma.manutencao.findUnique({ where: { id: "geral" } });
    cache = { ligada: !!m?.ligada, em: Date.now() };
  } catch {
    cache.em = Date.now();
  }
  return cache.ligada;
}

const saCache = new Map<string, { sa: boolean; em: number }>();
/** O token do cookie é de um Super Admin com sessão válida? (cache de 30 s por token) */
export async function tokenDeSuperAdmin(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const h = createHash("sha256").update(token).digest("hex");
  const c = saCache.get(h);
  if (c && Date.now() - c.em < 30_000) return c.sa;
  let sa = false;
  try {
    const s = await prisma.sessao.findUnique({ where: { tokenHash: h }, select: { expiraEm: true, usuario: { select: { cargo: true } } } });
    sa = !!s && s.expiraEm > new Date() && s.usuario.cargo === Cargo.SUPERADMIN;
  } catch { /* banco indisponível: trata como cliente */ }
  if (saCache.size > 500) saCache.clear();
  saCache.set(h, { sa, em: Date.now() });
  return sa;
}
