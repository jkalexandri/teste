// Atendimento → Interessados (decisão #104): o Super Admin lê (zera as não lidas) e responde (assume a conversa).
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { mensagensDoInteressado, responderComoSuporte } from "@/lib/interessados";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirSuperAdmin();
  const { id } = await params;
  const it = await prisma.interessado.findUnique({ where: { id } });
  if (!it) return NextResponse.json({ ok: false }, { status: 404 });
  if (it.naoLidasSuporte) await prisma.interessado.update({ where: { id }, data: { naoLidasSuporte: 0 } });
  return NextResponse.json({ ok: true, mensagens: await mensagensDoInteressado(id, new URL(req.url).searchParams.get("desde")) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await exigirSuperAdmin();
  const { id } = await params;
  const form = await req.formData();
  const arquivo = form.get("arquivo");
  const r = await responderComoSuporte(id, s.usuario.id, String(form.get("texto") ?? ""), arquivo instanceof File && arquivo.size > 0 ? arquivo : null);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
