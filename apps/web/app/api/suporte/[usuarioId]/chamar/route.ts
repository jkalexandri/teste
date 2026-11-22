// POST: o Super Admin chama o cliente — o chat abre sozinho na tela dele (decisão #102).
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { chamarWorker } from "@/lib/worker";

export async function POST(_req: Request, { params }: { params: Promise<{ usuarioId: string }> }) {
  await exigirSuperAdmin();
  const { usuarioId } = await params;
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { cargo: true } });
  if (!u || u.cargo === Cargo.SUPERADMIN) return NextResponse.json({ ok: false, mensagem: "Cliente não encontrado." }, { status: 404 });
  const agora = new Date();
  await prisma.suporteConversa.upsert({ where: { usuarioId }, create: { usuarioId, chamadoEm: agora, ultimaMensagemEm: agora }, update: { chamadoEm: agora } });
  await chamarWorker(`/push/${usuarioId}/enviar`, { texto: "💬 O suporte do FilaPro Leads quer falar com você. Abra o sistema.", url: "/dashboard?suporte=1" }).catch(() => undefined);
  return NextResponse.json({ ok: true, mensagem: "Chamado enviado: o chat abre na tela do cliente." });
}
