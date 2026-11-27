// Link de uso único para definir a senha (decisão #164 — S9 do Módulo 1), no lugar da senha temporária por e-mail.
// - Código de 256 bits aleatórios; no banco fica só o hash (SHA-256). Vale 30 minutos e uma vez.
// - O código vai no FRAGMENTO do endereço (#t=…): não vai para logs do servidor nem para o cabeçalho Referer.
// - Abrir o link não o consome (antivírus e leitores de e-mail "pré-abrem" links): só enviar a senha nova consome.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@filapro/db";

export const VALIDADE_LINK_MIN = 30;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br";
const hashDoToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** O código tem 43 caracteres (32 bytes em base64url). */
export const tokenValido = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

/** Gera um link novo para o usuário (o anterior deixa de valer). Devolve o código em texto — só vai para o e-mail. */
export async function criarLinkSenha(usuarioId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { linkSenhaHash: hashDoToken(token), linkSenhaExpiraEm: new Date(Date.now() + VALIDADE_LINK_MIN * 60_000) },
  });
  return token;
}

export const urlDoLink = (token: string) => `${SITE}/definir-senha#t=${token}`;

/**
 * Define a senha pelo link e o consome, num comando ATÔMICO (dois pedidos com o mesmo link: só um passa).
 * Também apaga a senha temporária e os bloqueios por tentativas antigos da conta. Devolve a conta, ou null se o link não vale.
 */
export async function definirSenhaPorLink(token: string, senhaHash: string, agora = new Date()) {
  const r = await prisma.$queryRaw<{ id: string; nome: string; email: string; empresaId: string | null }[]>`
    UPDATE "Usuario" SET "senhaHash" = ${senhaHash}, "linkSenhaHash" = NULL, "linkSenhaExpiraEm" = NULL,
      "senhaTempHash" = NULL, "senhaTempExpiraEm" = NULL, "tentativasFalhas" = 0, "bloqueadoAte" = NULL
    WHERE "linkSenhaHash" = ${hashDoToken(token)} AND "linkSenhaExpiraEm" > ${agora} AND "status" = 'ATIVO'
    RETURNING "id", "nome", "email", "empresaId"`;
  return r[0] ?? null;
}
