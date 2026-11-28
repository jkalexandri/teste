// GET /api/sobre — texto do "Sobre" do login (público; decisão #189). Vazio = o login usa o texto padrão.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = await prisma.configVenda.findUnique({ where: { id: "config" }, select: { sobreTexto: true } });
  return NextResponse.json({ texto: c?.sobreTexto ?? "" });
}
