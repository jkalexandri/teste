// Comprovante de um lançamento (decisão #106) — só o Super Admin.
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { lerArquivoDoWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await obterSessao();
  if (!s || s.usuario.cargo !== Cargo.SUPERADMIN) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  const { id } = await params;
  const l = await prisma.lancamento.findUnique({ where: { id } });
  if (!l?.comprovanteTipo) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const r = await lerArquivoDoWorker(`fin-${id}`);
  if (!r?.body) return NextResponse.json({ erro: "Arquivo indisponível no momento." }, { status: 503 });
  return new Response(r.body, { headers: { "content-type": l.comprovanteTipo, "content-disposition": `inline; filename="${encodeURIComponent(l.comprovanteNome ?? "comprovante")}"` } });
}
