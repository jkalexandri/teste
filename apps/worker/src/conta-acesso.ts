// Conta sem acesso (decisão #158 — S2c da auditoria do Módulo 1).
// Mesma regra do site (apps/web/lib/auth/acesso.ts: motivoSemAcesso): usuário bloqueado, empresa inativa ou plano vencido.
// Super Admin nunca é barrado. O serviço usa isto para NÃO enviar campanhas, NÃO responder com IA e NÃO mandar avisos
// de contas barradas. O WhatsApp continua conectado (ao renovar, volta sem ler o QR Code de novo).
import { Cargo } from "@filapro/db";

export type ContaParaChecar = {
  cargo: Cargo | string;
  status: string;
  empresa: { ativa: boolean; expiraEm: Date } | null;
};

export type MotivoConta = "bloqueado" | "expirado" | "inativa";

/** Motivo de a conta estar barrada, ou null se tem acesso. */
export function motivoContaSemAcesso(u: ContaParaChecar, agora: Date = new Date()): MotivoConta | null {
  if (u.status === "BLOQUEADO") return "bloqueado";
  if (u.cargo === Cargo.SUPERADMIN) return null;
  if (!u.empresa) return "bloqueado";
  if (u.empresa.expiraEm < agora) return "expirado";
  if (!u.empresa.ativa) return "inativa";
  return null;
}

/** Motivo gravado na campanha pausada por conta sem acesso (a campanha volta sozinha quando o acesso voltar). */
export const MOTIVO_CONTA = "Pausada automaticamente: conta sem acesso (plano vencido, empresa inativa ou usuário bloqueado). Volta sozinha quando o acesso voltar.";
/** Erro gravado no lead de anúncio recebido com a conta sem acesso. */
export const ERRO_CONTA_SEM_ACESSO = "Conta sem acesso (plano vencido, empresa inativa ou usuário bloqueado): a IA não respondeu.";
