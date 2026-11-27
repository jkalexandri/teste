// POST /api/comunicados/<id> — o usuário clicou OK na mensagem do Super Admin (decisão #102).
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { sessaoDaRota } from "@/lib/auth/rota";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoDaRota();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  const { id } = await params;
  await prisma.comunicadoDestino.updateMany({ where: { comunicadoId: id, usuarioId: s.usuario.id, lidoEm: null }, data: { lidoEm: new Date() } });
  return NextResponse.json({ ok: true });
}
