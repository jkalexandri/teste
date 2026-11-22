// Anexo enviado pelo Super Admin a um interessado (decisão #104): o visitante dono da conversa ou o Super Admin.
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { interessadoAtual } from "@/lib/interessados";
import { lerArquivoDoWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.interessadoMensagem.findUnique({ where: { id } });
  if (!m || !m.arquivoTipo) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const s = await obterSessao();
  const sa = s?.usuario.cargo === Cargo.SUPERADMIN;
  if (!sa && (await interessadoAtual())?.id !== m.interessadoId) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const r = await lerArquivoDoWorker(`int-${id}`);
  if (!r?.body) return NextResponse.json({ erro: "Arquivo indisponível no momento." }, { status: 503 });
  return new Response(r.body, { headers: { "content-type": m.arquivoTipo, "content-disposition": `inline; filename="${encodeURIComponent(m.arquivoNome ?? "arquivo")}"` } });
}
