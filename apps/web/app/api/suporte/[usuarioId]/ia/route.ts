// Assumir a conversa do suporte (a IA para) ou devolver para a IA (decisão #146) — só o Super Admin.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { chamarWorker } from "@/lib/worker";

export async function POST(req: Request, { params }: { params: Promise<{ usuarioId: string }> }) {
  await exigirSuperAdmin();
  const { usuarioId } = await params;
  const { pausar } = (await req.json().catch(() => ({}))) as { pausar?: boolean };
  const c = await prisma.suporteConversa.update({ where: { usuarioId }, data: pausar ? { iaPausada: true, iaPausaMotivo: "Assumida pelo Super Admin" } : { iaPausada: false, iaPausaMotivo: null } }).catch(() => null);
  if (!c) return NextResponse.json({ ok: false, mensagem: "Conversa não encontrada." }, { status: 404 });
  // Devolveu: se a última mensagem é do cliente, a IA responde
  if (!pausar) await chamarWorker(`/suporte/${usuarioId}/responder`, {}).catch(() => undefined);
  return NextResponse.json({ ok: true, mensagem: pausar ? "Conversa assumida: a IA parou." : "A IA voltou a responder." });
}
