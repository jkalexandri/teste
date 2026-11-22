// Conversas IA (etapa 10 — decisão #92): quem vê e quem responde.
// Usuário (com a permissão "conversas"): as dele, responde. Admin da Empresa: as de todos da empresa, só leitura.
// Super Admin: vê todas e responde só nas dele.
import "server-only";
import { Cargo, type Prisma } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";

export const TEMPERATURA = {
  QUENTE: { rotulo: "Quente", fundo: "#ffeef0", cor: "#b42318" },
  MORNO: { rotulo: "Morno", fundo: "#fff7e0", cor: "#8a5a00" },
  FRIO: { rotulo: "Frio", fundo: "#eef2ff", cor: "#3730a3" },
} as const;

export async function atorConversas() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  const u = s.usuario;
  if (u.cargo === Cargo.USUARIO && !u.permissoes.includes("conversas")) throw new Error("Acesso negado.");
  if (u.cargo === Cargo.ADMIN_EMPRESA && !u.empresaId) throw new Error("Acesso negado.");
  const escopo: Prisma.LeadWhereInput =
    u.cargo === Cargo.SUPERADMIN ? {} : u.cargo === Cargo.ADMIN_EMPRESA ? { empresaId: u.empresaId! } : { usuarioId: u.id };
  return {
    u,
    escopo,
    /** Admin não envia mensagens (regra já aprovada) */
    temIA: u.cargo !== Cargo.ADMIN_EMPRESA,
    /** Pode responder e mudar esta conversa: só o dono do lead */
    podeResponder: (lead: { usuarioId: string }) => u.cargo !== Cargo.ADMIN_EMPRESA && lead.usuarioId === u.id,
  };
}
