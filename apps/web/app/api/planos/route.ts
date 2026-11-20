// GET /api/planos — planos visíveis no popup do login (público).
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [planos, config] = await Promise.all([
    prisma.plano.findMany({ where: { visivel: true }, orderBy: { ordem: "asc" } }),
    prisma.configVenda.findUnique({ where: { id: "config" } }),
  ]);
  return NextResponse.json({
    planos: planos.map(({ criadoEm, atualizadoEm, ...p }) => p),
    contatoPersonalizado: config?.contatoPersonalizado || "",
  });
}
