// Atendimentos anteriores de um cliente (decisão #177): só leitura, só Super Admin. O chat principal mostra apenas o atendimento atual.
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { atendimentosAnteriores } from "@/lib/suporte";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ usuarioId: string }> }) {
  await exigirSuperAdmin();
  const { usuarioId } = await params;
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { cargo: true } });
  if (!u || u.cargo === Cargo.SUPERADMIN) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, atendimentos: await atendimentosAnteriores(usuarioId) });
}
