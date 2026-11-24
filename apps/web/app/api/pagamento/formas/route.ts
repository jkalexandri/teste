// GET /api/pagamento/formas — formas de pagamento ligadas (público, usado na compra e na renovação — decisão #115).
// Não expõe nada da configuração: só se o Asaas está ligado e a taxa de juros do parcelamento.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await prisma.configVenda.findUnique({ where: { id: "config" }, select: { asaasChave: true, jurosParcelaMes: true } });
  return NextResponse.json({ asaas: !!c?.asaasChave, jurosMes: c?.asaasChave ? c.jurosParcelaMes ?? null : null });
}
