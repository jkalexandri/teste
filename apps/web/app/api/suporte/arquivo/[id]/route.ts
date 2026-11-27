// Anexo de uma mensagem do suporte (decisão #102): o cliente dono da conversa ou o Super Admin.
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { sessaoDaRota } from "@/lib/auth/rota";
import { lerArquivoDoWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await sessaoDaRota();
  if (!s) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  const { id } = await params;
  const m = await prisma.suporteMensagem.findUnique({ where: { id }, include: { conversa: true } });
  if (!m || !m.arquivoTipo || (s.usuario.cargo !== Cargo.SUPERADMIN && m.conversa.usuarioId !== s.usuario.id)) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const r = await lerArquivoDoWorker(`sup-${id}`);
  if (!r?.body) return NextResponse.json({ erro: "Arquivo indisponível no momento." }, { status: 503 });
  return new Response(r.body, { headers: { "content-type": m.arquivoTipo, "content-disposition": `inline; filename="${encodeURIComponent(m.arquivoNome ?? "arquivo")}"` } });
}
