// GET /api/arquivos/:id — mostra um anexo (prévia da campanha / tela Arquivos).
// Só o dono do arquivo (ou o Super Admin) pode ver. O arquivo vem da VPS (decisão #67).
import { NextResponse } from "next/server";
import { prisma, Cargo } from "@filapro/db";
import { sessaoDaRota } from "@/lib/auth/rota";
import { lerArquivoDoWorker } from "@/lib/worker";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await sessaoDaRota();
  if (!s || s.precisaTrocar) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  const a = await prisma.arquivo.findUnique({ where: { id }, include: { usuario: { select: { empresaId: true } } } });
  // Dono, Super Admin, ou Admin da mesma empresa (vê as conversas dos usuários — decisão #92)
  const adminDaEmpresa = s.usuario.cargo === Cargo.ADMIN_EMPRESA && !!s.usuario.empresaId && a?.usuario.empresaId === s.usuario.empresaId;
  if (!a || (a.usuarioId !== s.usuario.id && s.usuario.cargo !== Cargo.SUPERADMIN && !adminDaEmpresa)) return NextResponse.json({ erro: "Não encontrado." }, { status: 404 });
  const r = await lerArquivoDoWorker(id);
  if (!r?.body) return NextResponse.json({ erro: "Arquivo indisponível no momento." }, { status: 503 });
  return new Response(r.body, {
    headers: {
      "content-type": a.tipo,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "cache-control": "private, max-age=300",
    },
  });
}
