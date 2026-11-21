// Códigos legíveis (decisão #63). Nunca se repetem no sistema: um contador por tipo,
// incrementado de forma atômica no banco (seguro com vários cadastros ao mesmo tempo).
import type { Prisma, PrismaClient } from "@prisma/client";

type Cliente = PrismaClient | Prisma.TransactionClient;

export const TIPOS_CODIGO = {
  superadmin: "S",
  empresa: "E",
  individual: "",
  usuario_empresa: "EU",
  lead_individual: "L",
  lead_empresa: "EL",
} as const;
export type TipoCodigo = keyof typeof TIPOS_CODIGO;

/** Prefixo + número com no mínimo 5 dígitos (cresce sozinho: 100000, 1000000…). */
export function formatarCodigo(tipo: TipoCodigo, n: number) {
  return TIPOS_CODIGO[tipo] + String(n).padStart(5, "0");
}

/** Reserva `quantidade` códigos seguidos e devolve todos (para importações em lote). */
export async function reservarCodigos(db: Cliente, tipo: TipoCodigo, quantidade = 1): Promise<string[]> {
  if (quantidade <= 0) return [];
  const [linha] = await db.$queryRaw<{ valor: number }[]>`
    INSERT INTO "Contador" (tipo, valor) VALUES (${tipo}, ${quantidade})
    ON CONFLICT (tipo) DO UPDATE SET valor = "Contador".valor + ${quantidade}
    RETURNING valor`;
  const fim = Number(linha!.valor);
  return Array.from({ length: quantidade }, (_, i) => formatarCodigo(tipo, fim - quantidade + 1 + i));
}

export async function proximoCodigo(db: Cliente, tipo: TipoCodigo): Promise<string> {
  return (await reservarCodigos(db, tipo, 1))[0]!;
}
