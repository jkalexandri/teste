// Chave geral da IA no suporte dos clientes (decisão #146) — só o Super Admin. Começa desligada.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";

export async function POST(req: Request) {
  await exigirSuperAdmin();
  const { ligada } = (await req.json().catch(() => ({}))) as { ligada?: boolean };
  if (typeof ligada !== "boolean") return NextResponse.json({ ok: false, mensagem: "Pedido inválido." }, { status: 400 });
  await prisma.configVenda.upsert({ where: { id: "config" }, update: { iaSuporteLigada: ligada }, create: { id: "config", iaSuporteLigada: ligada } });
  return NextResponse.json({ ok: true, mensagem: ligada ? "IA ligada no suporte dos clientes." : "IA desligada no suporte dos clientes." });
}
