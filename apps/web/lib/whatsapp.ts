// Regras de acesso e leitura do estado das conexões do WhatsApp.
// Usuário: conecta o PRÓPRIO WhatsApp (sessão = id do usuário).
// Super Admin: conecta o número da plataforma (decisão #51).
// Admin da Empresa: não usa WhatsApp.
import "server-only";
import QRCode from "qrcode";
import { prisma, Cargo, StatusWhatsapp } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";

export const SESSAO_PLATAFORMA = "plataforma";
/** "proprio" = número principal; "plataforma" = número da plataforma; outro = id de um número extra do usuário (etapa 10c). */
export type AlvoWhatsapp = string;

/** QR do WhatsApp vale ~20 s; depois disso não mostramos mais o antigo. */
const QR_VALIDO_MS = 60_000;

export type EstadoWhatsapp = {
  status: StatusWhatsapp;
  numero: string | null;
  qrImagem: string | null;
  erro: string | null;
  conectadoEm: string | null;
};

/** Descobre qual sessão quem está logado pode controlar. null = sem permissão. */
export async function sessaoDoAlvo(alvo: AlvoWhatsapp): Promise<{ sessaoId: string; usuarioId?: string } | null> {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) return null;
  if (alvo === "plataforma") return s.usuario.cargo === Cargo.SUPERADMIN ? { sessaoId: SESSAO_PLATAFORMA } : null;
  // Usuário e Super Admin (decisão #62) conectam o próprio WhatsApp; o Admin da Empresa não.
  if (s.usuario.cargo !== Cargo.USUARIO && s.usuario.cargo !== Cargo.SUPERADMIN) return null;
  if (alvo === "proprio") return { sessaoId: s.usuario.id, usuarioId: s.usuario.id };
  // Número extra (etapa 10c): precisa ser do usuário e não estar bloqueado (decisão #95, item 9)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(alvo)) return null;
  const extra = await prisma.whatsappSessao.findUnique({ where: { id: alvo } });
  return extra && extra.usuarioId === s.usuario.id && !extra.bloqueada ? { sessaoId: extra.id, usuarioId: s.usuario.id } : null;
}

export async function lerEstado(sessaoId: string): Promise<EstadoWhatsapp> {
  const w = await prisma.whatsappSessao.findUnique({ where: { id: sessaoId } });
  if (!w) return { status: StatusWhatsapp.DESCONECTADO, numero: null, qrImagem: null, erro: null, conectadoEm: null };
  const qrNovo = w.qr && w.qrEm && Date.now() - w.qrEm.getTime() < QR_VALIDO_MS;
  return {
    status: w.status,
    numero: w.numero,
    qrImagem: qrNovo ? await QRCode.toDataURL(w.qr!, { margin: 1, width: 264 }) : null,
    erro: w.erro,
    conectadoEm: w.conectadoEm?.toISOString() ?? null,
  };
}

