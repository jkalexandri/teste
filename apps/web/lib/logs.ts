// Registro de ações para a tela Logs (decisão #99). Nunca interrompe a ação principal se falhar.
import "server-only";
import { headers } from "next/headers";
import { prisma } from "@filapro/db";

export const TIPOS_LOG = {
  ENTRADA: "Entradas",
  SENHA: "Senha errada / bloqueio",
  USUARIOS: "Usuários",
  LEADS: "Leads",
  CAMPANHAS: "Campanhas",
  WHATSAPP: "WhatsApp",
} as const;
export type TipoLog = keyof typeof TIPOS_LOG;
export const DIAS_LOG = 90;

type Quem = { id: string; nome: string; email: string; empresaId: string | null };

export async function registrarLog(quem: Quem | null, tipo: TipoLog, texto: string, empresaId?: string | null) {
  try {
    const h = await headers().catch(() => null);
    const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip") || null;
    await prisma.log.create({
      data: {
        empresaId: empresaId !== undefined ? empresaId : quem?.empresaId ?? null,
        usuarioId: quem?.id ?? null,
        quem: quem ? `${quem.nome} (${quem.email})` : "",
        tipo, texto: texto.slice(0, 500), ip,
      },
    });
  } catch (e) {
    console.warn("[logs] não registrado", e);
  }
}

/** Registra uma ação de quem está logado (usado nas ações das telas). */
export async function logDaSessao(tipo: TipoLog, texto: string, empresaId?: string | null) {
  const { obterSessao } = await import("@/lib/auth/session");
  const s = await obterSessao().catch(() => null);
  if (!s) return;
  await registrarLog(s.usuario, tipo, texto, empresaId);
}
