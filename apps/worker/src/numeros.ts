// Vários WhatsApps por usuário (etapa 10c — decisões #79 e #95).
// O número principal tem o id do próprio usuário; os extras têm ids próprios. Número "bloqueado" (saiu na renovação) não é usado.
import { prisma } from "@filapro/db";

const donos = new Map<string, string | null>();

/** Dono (usuário) de uma sessão. A sessão da plataforma não tem dono. */
export async function donoDaSessao(sessaoId: string): Promise<string | null> {
  if (donos.has(sessaoId)) return donos.get(sessaoId)!;
  const s = await prisma.whatsappSessao.findUnique({ where: { id: sessaoId }, select: { usuarioId: true } });
  const dono = s?.usuarioId ?? null;
  donos.set(sessaoId, dono);
  return dono;
}

/** Esquece o dono guardado (número desconectado ou usuário excluído — decisão #138). */
export function esquecerDono(sessaoId: string) {
  donos.delete(sessaoId);
}

/** Números do usuário que podem ser usados: o principal primeiro, depois os extras na ordem da tela. */
export async function numerosDoUsuario(usuarioId: string): Promise<string[]> {
  const ss = await prisma.whatsappSessao.findMany({ where: { usuarioId, bloqueada: false }, orderBy: [{ ordem: "asc" }], select: { id: true } });
  const ids = ss.map((s) => s.id).filter((id) => id !== usuarioId);
  return [usuarioId, ...ids];
}

/**
 * Por qual número falar com um lead: o `preferido` (o da conversa) se estiver conectado;
 * senão o principal; senão qualquer outro conectado (decisão #95, itens 6 e 7). null = nenhum conectado.
 */
export async function escolherNumero(conectado: (id: string) => boolean, usuarioId: string, preferido?: string | null) {
  const meus = await numerosDoUsuario(usuarioId);
  if (preferido && meus.includes(preferido) && conectado(preferido)) return preferido;
  return meus.find((id) => conectado(id)) ?? null;
}
