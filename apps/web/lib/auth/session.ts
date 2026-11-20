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

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function criarSessao(usuarioId: string, precisaTrocar: boolean) {
  const token = randomBytes(32).toString("base64url");
  await prisma.sessao.create({
    data: {
      tokenHash: hashToken(token),
      usuarioId,
      precisaTrocar,
      expiraEm: new Date(Date.now() + SESSAO_MAX_HORAS * 3600 * 1000),
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
  if (!sessao || sessao.expiraEm < new Date()) return null;
  return sessao;
});

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await prisma.sessao.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(COOKIE_SESSAO);
}

export async function atualizarSessaoTrocaFeita() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await prisma.sessao.updateMany({ where: { tokenHash: hashToken(token) }, data: { precisaTrocar: false } });
}
