// Sessões de login (lado do servidor).
// - Cookie de sessão (sem data de validade): some ao fechar o navegador (decisão #10).
// - No banco guardamos só o hash do token.
// - Limite de segurança no servidor: a sessão também expira após SESSAO_MAX_HORAS,
//   mesmo que o navegador continue aberto.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@filapro/db";

export const COOKIE_SESSAO = "filapro_sessao";
export const SESSAO_MAX_HORAS = 24;
/** Sessão de primeiro acesso (senha temporária ainda não trocada): vale só 30 minutos (decisão #157). */
export const SESSAO_PRIMEIRO_ACESSO_MIN = 30;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function criarSessao(usuarioId: string, precisaTrocar: boolean, pendente2fa = false) {
  const token = randomBytes(32).toString("base64url");
  await prisma.sessao.create({
    data: {
      tokenHash: hashToken(token),
      usuarioId,
      precisaTrocar,
      pendente2fa,
      // Aguardando o código da verificação em duas etapas: vale só 10 minutos; primeiro acesso: 30 minutos
      expiraEm: new Date(Date.now() + (pendente2fa ? 10 * 60 * 1000 : precisaTrocar ? SESSAO_PRIMEIRO_ACESSO_MIN * 60 * 1000 : SESSAO_MAX_HORAS * 3600 * 1000)),
    },
  });
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // sem maxAge/expires: cookie de sessão
  });
}

/** Retorna a sessão válida atual com o usuário e a empresa, ou null. */
export const obterSessao = cache(async function obterSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: { include: { empresa: true } } },
  });
  // Falta o código da verificação em duas etapas (decisão #105): ainda não está logado
  if (!sessao || sessao.expiraEm < new Date() || sessao.pendente2fa) return null;
  return sessao;
});

/** Sessão que acertou a senha e espera o código da verificação em duas etapas (decisão #105). */
export async function obterSessaoPendente2fa() {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  if (!token) return null;
  const sessao = await prisma.sessao.findUnique({ where: { tokenHash: hashToken(token) }, include: { usuario: true } });
  if (!sessao || !sessao.pendente2fa || sessao.expiraEm < new Date()) return null;
  return sessao;
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await prisma.sessao.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(COOKIE_SESSAO);
}

/**
 * Senha definida no primeiro acesso (decisão #157): apaga TODAS as sessões da conta (inclusive a atual)
 * e abre uma nova, com token novo. Um token que tenha vazado antes da troca deixa de valer.
 */
export async function renovarSessoesAposNovaSenha(usuarioId: string) {
  await prisma.sessao.deleteMany({ where: { usuarioId } });
  await criarSessao(usuarioId, false);
}
