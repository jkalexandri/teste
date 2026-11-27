// Link de uso único para definir a senha (decisão #164 — S9 do Módulo 1), no lugar da senha temporária por e-mail.
// - Código de 256 bits aleatórios; no banco fica só o hash (SHA-256). Vale 30 minutos e uma vez.
// - O código vai no FRAGMENTO do endereço (#t=…): não vai para logs do servidor nem para o cabeçalho Referer.
// - Abrir o link não o consome (antivírus e leitores de e-mail "pré-abrem" links): só enviar a senha nova consome.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@filapro/db";

export const VALIDADE_LINK_MIN = 30;
/** Link de acesso novo (conta nova, usuário criado, redefinição pelo Admin): vale 7 dias, como valia a senha temporária (decisão #165). */
export const VALIDADE_LINK_ACESSO_MIN = 7 * 24 * 60;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br";
const hashDoToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** O código tem 43 caracteres (32 bytes em base64url). */
export const tokenValido = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);

/** Código novo + o que vai para o banco (hash e validade). Usado ao CRIAR a conta, junto com o usuário. */
export function novoLink(minutos: number) {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashDoToken(token), expira: new Date(Date.now() + minutos * 60_000) };
}

/** Gera um link novo para o usuário (o anterior deixa de valer). Devolve o código em texto — só vai para o e-mail. */
export async function criarLinkSenha(usuarioId: string, minutos = VALIDADE_LINK_MIN) {
  const l = novoLink(minutos);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { linkSenhaHash: l.hash, linkSenhaExpiraEm: l.expira } });
  return l.token;
}

/**
 * Redefinir o acesso (botões "Resetar senha" do Admin e "Reenviar acesso" do Super Admin — decisão #165):
 * a senha atual DEIXA DE VALER, as sessões e as notificações do celular são encerradas, e a pessoa recebe um link de 7 dias.
 * Quem tinha a conta comprometida perde o acesso na hora.
 */
export async function redefinirAcesso(usuarioId: string) {
  const l = novoLink(VALIDADE_LINK_ACESSO_MIN);
  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash: null, senhaTempHash: null, senhaTempExpiraEm: null, linkSenhaHash: l.hash, linkSenhaExpiraEm: l.expira, tentativasFalhas: 0, bloqueadoAte: null },
    }),
    prisma.sessao.deleteMany({ where: { usuarioId } }),
    prisma.pushInscricao.deleteMany({ where: { usuarioId } }),
  ]);
  return l.token;
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
