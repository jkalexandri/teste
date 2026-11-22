// Assumir (a IA para) ou devolver a conversa para a IA (decisão #104) — só o Super Admin.
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { chamarWorker } from "@/lib/worker";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirSuperAdmin();
  const { id } = await params;
  const { pausar } = (await req.json().catch(() => ({}))) as { pausar?: boolean };
  const it = await prisma.interessado.update({ where: { id }, data: pausar ? { iaPausada: true, iaPausaMotivo: "Assumida pelo Super Admin" } : { iaPausada: false, iaPausaMotivo: null } }).catch(() => null);
  if (!it) return NextResponse.json({ ok: false, mensagem: "Conversa não encontrada." }, { status: 404 });
  // Devolveu: se a última mensagem é do visitante, a IA responde
  if (!pausar) await chamarWorker(`/interessados/${id}/responder`, {}).catch(() => undefined);
  return NextResponse.json({ ok: true, mensagem: pausar ? "Conversa assumida: a IA parou." : "A IA voltou a responder." });
}
