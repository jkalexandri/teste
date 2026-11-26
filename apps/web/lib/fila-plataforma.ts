// Leitura da fila de saída do número da plataforma para a tela Número da plataforma (decisão #143).
// Os valores do limite e da validade são os mesmos de apps/worker/src/fila-plataforma.ts.
import "server-only";
import { prisma } from "@filapro/db";

export const LIMITE_DIARIO_PLATAFORMA = 200;
export const VALIDADE_HORAS = 6;
const DIA_MS = 24 * 60 * 60_000;
const FUSO_MS = 3 * 60 * 60_000; // Brasília = UTC-3 o ano todo

export async function lerFilaPlataforma() {
  const inicio = new Date(Math.floor((Date.now() - FUSO_MS) / DIA_MS) * DIA_MS + FUSO_MS);
  const [enviadasHoje, naFila, expiradasHoje] = await Promise.all([
    prisma.mensagemPlataforma.count({ where: { situacao: "ENVIADA", enviadaEm: { gte: inicio } } }),
    prisma.mensagemPlataforma.count({ where: { situacao: "PENDENTE" } }),
    prisma.mensagemPlataforma.count({ where: { situacao: "EXPIRADA", criadoEm: { gte: inicio } } }),
  ]);
  return { enviadasHoje, naFila, expiradasHoje, limite: LIMITE_DIARIO_PLATAFORMA };
}
