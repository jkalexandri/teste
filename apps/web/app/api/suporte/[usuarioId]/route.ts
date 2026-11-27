// Atendimento do Super Admin (decisão #102). GET: mensagens com o cliente (zera as não lidas do suporte). POST: responder.
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { gravarMensagem, mensagensDaConversa } from "@/lib/suporte";
import { chamarWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

async function clienteValido(id: string) {
  const u = await prisma.usuario.findUnique({ where: { id }, select: { id: true, cargo: true } });
  return u && u.cargo !== Cargo.SUPERADMIN ? u : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ usuarioId: string }> }) {
  await exigirSuperAdmin();
  const { usuarioId } = await params;
  if (!(await clienteValido(usuarioId))) return NextResponse.json({ ok: false }, { status: 404 });
  const r = await mensagensDaConversa(usuarioId, new URL(req.url).searchParams.get("desde"));
  if (r.conversa?.naoLidasSuporte) await prisma.suporteConversa.update({ where: { id: r.conversa.id }, data: { naoLidasSuporte: 0 } });
  return NextResponse.json({ ok: true, mensagens: r.mensagens, atendimento: r.atendimento, encerrada: r.encerrada });
}

export async function POST(req: Request, { params }: { params: Promise<{ usuarioId: string }> }) {
  const s = await exigirSuperAdmin();
  const { usuarioId } = await params;
  if (!(await clienteValido(usuarioId))) return NextResponse.json({ ok: false, mensagem: "Cliente não encontrado." }, { status: 404 });
  const form = await req.formData();
  const arquivo = form.get("arquivo");
  const texto = String(form.get("texto") ?? "");
  const r = await gravarMensagem(usuarioId, "SUPORTE", s.usuario.id, texto, arquivo instanceof File && arquivo.size > 0 ? arquivo : null);
  // Notificação no celular do cliente (se ele ativou)
  if (r.ok) await chamarWorker(`/push/${usuarioId}/enviar`, { texto: `💬 Suporte FilaPro Leads: ${texto.slice(0, 120) || "(arquivo)"}`, url: "/dashboard?suporte=1" }).catch(() => undefined);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
