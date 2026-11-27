// Controle de tentativas de entrada e de recuperação (decisão #160 — S5 do Módulo 1).
// Estado no banco (tabela TentativaLogin): sobrevive a reinício do site e vale também para e-mail SEM conta
// (as respostas precisam ser iguais — decisão #159). Linhas velhas são apagadas pela rotina de 5 minutos.
import { prisma } from "@filapro/db";

/** 5 erros de senha do MESMO endereço, para o mesmo e-mail, em 15 minutos: bloqueia só aquele endereço (15 minutos). */
export const MAX_ERROS_PAR = 5;
/** 30 erros somados de TODOS os endereços para o mesmo e-mail, em 15 minutos: a conta entra em proteção (15 minutos). */
export const MAX_ERROS_CONTA = 30;
export const JANELA_MIN = 15;
export const BLOQUEIO_MINUTOS = 15;
/** Recuperação de senha: no máximo 3 pedidos por hora por e-mail, e nada de nova senha temporária se a anterior tem menos de 10 minutos. */
export const MAX_RECUPERACOES_HORA = 3;
export const INTERVALO_RECUPERACAO_MIN = 10;

const MIN = 60_000;
export const chavePar = (email: string, ip: string) => `par:${email}|${ip}`;
export const chaveConta = (email: string) => `conta:${email}`;

type Linha = { falhas: number; desde: Date; bloqueadoAte: Date | null };

/** Linhas guardadas para as chaves (as que não existem não aparecem). */
export async function lerLinhas(chaves: string[]) {
  const linhas = await prisma.tentativaLogin.findMany({ where: { chave: { in: chaves } } });
  return new Map<string, Linha>(linhas.map((l) => [l.chave, l]));
}

/** Minutos que faltam para o bloqueio acabar (0 = não está bloqueado). */
export function minutosRestantes(l: Linha | undefined | null, agora: Date) {
  return l?.bloqueadoAte && l.bloqueadoAte > agora ? Math.ceil((l.bloqueadoAte.getTime() - agora.getTime()) / MIN) : 0;
}

/**
 * Conta 1 erro (a janela de 15 minutos recomeça depois da primeira falha). Devolve true se este erro causou o bloqueio.
 * A contagem é ATÔMICA no banco: tentativas em paralelo (várias de uma vez) não conseguem "furar" o limite lendo o mesmo valor.
 */
export async function registrarErro(chave: string, limite: number, agora: Date) {
  const corte = new Date(agora.getTime() - JANELA_MIN * MIN);
  const r = await prisma.$queryRaw<{ falhas: number }[]>`
    INSERT INTO "TentativaLogin" ("chave", "falhas", "desde", "atualizadoEm") VALUES (${chave}, 1, ${agora}, ${agora})
    ON CONFLICT ("chave") DO UPDATE SET
      "falhas" = CASE WHEN "TentativaLogin"."desde" < ${corte} THEN 1 ELSE "TentativaLogin"."falhas" + 1 END,
      "desde" = CASE WHEN "TentativaLogin"."desde" < ${corte} THEN ${agora} ELSE "TentativaLogin"."desde" END,
      "atualizadoEm" = ${agora}
    RETURNING "falhas"`;
  if (Number(r[0]?.falhas ?? 1) < limite) return false;
  await prisma.tentativaLogin.update({ where: { chave }, data: { falhas: 0, bloqueadoAte: new Date(agora.getTime() + BLOQUEIO_MINUTOS * MIN) } });
  return true;
}

/** Apaga as linhas (entrou com sucesso, ou com a senha temporária do e-mail durante um bloqueio). */
export async function limpar(chaves: string[]) {
  await prisma.tentativaLogin.deleteMany({ where: { chave: { in: chaves } } });
}

/** Reserva uma "vaga" de tempo na chave (true = conseguiu; false = ainda está dentro do intervalo). Atômico no banco. */
async function reservarIntervalo(chave: string, minutos: number, agora: Date) {
  const fim = new Date(agora.getTime() + minutos * MIN);
  const r = await prisma.$queryRaw<{ chave: string }[]>`
    INSERT INTO "TentativaLogin" ("chave", "falhas", "desde", "bloqueadoAte", "atualizadoEm") VALUES (${chave}, 0, ${agora}, ${fim}, ${agora})
    ON CONFLICT ("chave") DO UPDATE SET "bloqueadoAte" = ${fim}, "desde" = ${agora}, "atualizadoEm" = ${agora}
    WHERE "TentativaLogin"."bloqueadoAte" IS NULL OR "TentativaLogin"."bloqueadoAte" < ${agora}
    RETURNING "chave"`;
  return r.length > 0;
}

/**
 * Pedido de recuperação: true se pode gerar e enviar uma senha temporária agora.
 * Regras (atômicas, mesmo com pedidos simultâneos): intervalo de 10 minutos entre senhas e no máximo 3 por hora por e-mail.
 */
export async function podePedirRecuperacao(email: string, agora = new Date()) {
  if (!(await reservarIntervalo(`recint:${email}`, INTERVALO_RECUPERACAO_MIN, agora))) return false;
  const corte = new Date(agora.getTime() - 60 * MIN);
  const r = await prisma.$queryRaw<{ falhas: number }[]>`
    INSERT INTO "TentativaLogin" ("chave", "falhas", "desde", "atualizadoEm") VALUES (${`rec:${email}`}, 1, ${agora}, ${agora})
    ON CONFLICT ("chave") DO UPDATE SET
      "falhas" = CASE WHEN "TentativaLogin"."desde" < ${corte} THEN 1 ELSE "TentativaLogin"."falhas" + 1 END,
      "desde" = CASE WHEN "TentativaLogin"."desde" < ${corte} THEN ${agora} ELSE "TentativaLogin"."desde" END,
      "atualizadoEm" = ${agora}
    RETURNING "falhas"`;
  return Number(r[0]?.falhas ?? 1) <= MAX_RECUPERACOES_HORA;
}

/** O dono provou que tem a caixa de e-mail (entrou/trocou a senha pela temporária): libera novos pedidos de recuperação. */
export async function limparRecuperacao(email: string) {
  await limpar([`recint:${email}`, `rec:${email}`]);
}

/** Aviso ao dono quando a conta entra em proteção: no máximo 1 por hora por conta (true = pode enviar agora). Atômico. */
export async function podeAvisarDono(email: string, agora = new Date()) {
  return reservarIntervalo(`aviso:${email}`, 60, agora);
}

/** Limpeza das linhas velhas (rotina de 5 minutos). */
export async function limparTentativasVelhas(agora = new Date()) {
  const r = await prisma.tentativaLogin.deleteMany({ where: { atualizadoEm: { lt: new Date(agora.getTime() - 24 * 60 * MIN) }, OR: [{ bloqueadoAte: null }, { bloqueadoAte: { lt: agora } }] } });
  return r.count;
}

// ===== Verificação em duas etapas (decisão #161 — S6 do Módulo 1) =====
/** 10 códigos de 6 dígitos errados em 15 minutos, somando todas as entradas: congela a verificação por código (15 minutos). */
export const MAX_ERROS_CODIGO = 10;
export const chaveDois = (usuarioId: string) => `dois:${usuarioId}`;

/** Minutos que faltam para o código de 6 dígitos voltar a valer (0 = não está congelado). */
export async function minutosCongelado(usuarioId: string, agora = new Date()) {
  const l = await prisma.tentativaLogin.findUnique({ where: { chave: chaveDois(usuarioId) } });
  return minutosRestantes(l, agora);
}

/** Conta 1 código errado; true se este erro congelou a verificação por código. */
export async function erroDeCodigo(usuarioId: string, agora = new Date()) {
  return registrarErro(chaveDois(usuarioId), MAX_ERROS_CODIGO, agora);
}

export async function limparErrosDeCodigo(usuarioId: string) {
  await limpar([chaveDois(usuarioId)]);
}
