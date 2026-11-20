// Confere se a sessão atual ainda dá acesso ao sistema (pacote, empresa, status).
import "server-only";
import { Cargo, StatusUsuario } from "@filapro/db";
import type { obterSessao } from "./session";

type Sessao = NonNullable<Awaited<ReturnType<typeof obterSessao>>>;

export const MOTIVOS = {
  expirado: "Acesso expirado. Fale com o administrador.",
  inativa: "Empresa inativa. Fale com o administrador.",
  bloqueado: "Acesso bloqueado. Fale com o administrador.",
} as const;
export type Motivo = keyof typeof MOTIVOS;

/** Retorna o motivo do bloqueio, ou null se o acesso continua válido. */
export function motivoSemAcesso(sessao: Sessao): Motivo | null {
  const u = sessao.usuario;
  if (u.status === StatusUsuario.BLOQUEADO) return "bloqueado";
  if (u.cargo === Cargo.SUPERADMIN) return null;
  if (!u.empresa) return "bloqueado";
  if (u.empresa.expiraEm < new Date()) return "expirado";
  if (!u.empresa.ativa) return "inativa";
  return null;
}

/** Dias restantes do pacote (iguais para todos da empresa). Super Admin: null. */
export function diasRestantes(sessao: Sessao): number | null {
  const e = sessao.usuario.empresa;
  if (!e || sessao.usuario.cargo === Cargo.SUPERADMIN) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(e.expiraEm);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86400000);
}
