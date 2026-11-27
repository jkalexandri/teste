"use server";

// Segurança (decisões #105 e #166): ativar, desativar e gerar novos códigos de recuperação — para todos os perfis.
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { exigirUsuario } from "@/lib/auth/exigir";
import { consumirPassoTotp, guardarSegredo, passoDoCodigo, lerSegredo, novoSegredo, novosCodigosRecuperacao, urlOtpauth } from "@/lib/auth/dois-fatores";
import { registrarLog } from "@/lib/logs";

type R = { ok: boolean; mensagem: string; qr?: string; segredo?: string; codigos?: string[] };

/** Passo 1: gera o segredo (ainda não ativo) e o QR Code para o app autenticador. */
export async function iniciarAtivacao(): Promise<R> {
  const s = await exigirUsuario();
  if (s.usuario.doisFatoresAtivo) return { ok: false, mensagem: "A verificação já está ativa." };
  const segredo = novoSegredo();
  await prisma.usuario.update({ where: { id: s.usuario.id }, data: { doisFatoresSegredo: guardarSegredo(segredo), doisFatoresUltimoPasso: null } }); // segredo novo: o controle de passo recomeça (decisão #161)
  const qr = await QRCode.toDataURL(urlOtpauth(segredo, s.usuario.email), { margin: 1, width: 220 });
  return { ok: true, mensagem: "Leia o QR Code no app autenticador.", qr, segredo: segredo.replace(/(.{4})/g, "$1 ").trim() };
}

/** Passo 2: confere o primeiro código, ativa e mostra os códigos de recuperação (uma vez só). */
export async function confirmarAtivacao(codigo: string): Promise<R> {
  const s = await exigirUsuario();
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: s.usuario.id } });
  if (!u.doisFatoresSegredo) return { ok: false, mensagem: "Comece de novo: clique em Ativar." };
  const passo = passoDoCodigo(lerSegredo(u.doisFatoresSegredo), codigo);
  // Cada código vale uma vez (decisão #161): o da ativação também não pode ser reaproveitado na entrada
  if (passo === null || !(await consumirPassoTotp(u.id, passo))) return { ok: false, mensagem: "Código incorreto. Confira a hora do celular e tente de novo." };
  const { codigos, hashes } = novosCodigosRecuperacao();
  await prisma.usuario.update({ where: { id: u.id }, data: { doisFatoresAtivo: true, doisFatoresCodigos: hashes } });
  await registrarLog(s.usuario, "SENHA", "Verificação em duas etapas ativada");
  revalidatePath("/seguranca");
  return { ok: true, mensagem: "Verificação em duas etapas ativada.", codigos };
}

/** Confere o código atual do app (para desativar ou gerar novos códigos). */
async function conferirAtual(codigo: string) {
  const s = await exigirUsuario();
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: s.usuario.id } });
  const passo = u.doisFatoresSegredo && u.doisFatoresAtivo ? passoDoCodigo(lerSegredo(u.doisFatoresSegredo), codigo) : null;
  const ok = passo !== null && (await consumirPassoTotp(u.id, passo)); // cada código vale uma vez (decisão #161)
  return { s, u, ok };
}

export async function desativar(codigo: string): Promise<R> {
  const { s, u, ok } = await conferirAtual(codigo);
  if (!ok) return { ok: false, mensagem: "Código incorreto." };
  await prisma.usuario.update({ where: { id: u.id }, data: { doisFatoresAtivo: false, doisFatoresSegredo: null, doisFatoresCodigos: [], doisFatoresUltimoPasso: null } });
  await registrarLog(s.usuario, "SENHA", "Verificação em duas etapas desativada");
  revalidatePath("/seguranca");
  return { ok: true, mensagem: "Verificação em duas etapas desativada." };
}

export async function novosCodigos(codigo: string): Promise<R> {
  const { s, u, ok } = await conferirAtual(codigo);
  if (!ok) return { ok: false, mensagem: "Código incorreto." };
  const { codigos, hashes } = novosCodigosRecuperacao();
  await prisma.usuario.update({ where: { id: u.id }, data: { doisFatoresCodigos: hashes } });
  await registrarLog(s.usuario, "SENHA", "Novos códigos de recuperação gerados");
  revalidatePath("/seguranca");
  return { ok: true, mensagem: "Novos códigos gerados. Os antigos deixaram de valer.", codigos };
}
