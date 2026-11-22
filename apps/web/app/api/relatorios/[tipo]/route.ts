// GET /api/relatorios/<tipo>?conta=…&filtros… — Excel do relatório (etapa 11 — decisão #96). Só o Super Admin.
import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { gerarRelatorio, TIPOS, type Parametros, type TipoRelatorio } from "@/lib/relatorios";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const s = await obterSessao();
  if (!s || s.precisaTrocar || s.usuario.cargo !== Cargo.SUPERADMIN) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  if (!(tipo in TIPOS)) return NextResponse.json({ erro: "Relatório inválido." }, { status: 404 });
  const p = Object.fromEntries(new URL(req.url).searchParams) as Parametros;
  const r = await gerarRelatorio(tipo as TipoRelatorio, p, s.usuario.id, true);
  if (!r) return NextResponse.json({ erro: "Escolha a conta do relatório." }, { status: 400 });

  const negrito = (v: string | number) => ({ value: v, fontWeight: "bold" as const });
  const linhas = [
    [negrito(r.titulo)],
    [{ value: `Emitido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` }],
    [],
    ...(r.resumo ? [...r.resumo.map(([k, v]) => [negrito(k), { value: v }]), []] : []),
    r.tabela.colunas.map(negrito),
    ...r.tabela.linhas.map((l) => l.map((v) => ({ value: v, ...(typeof v === "number" ? { type: Number } : {}) }))),
  ];
  const buf = await writeXlsxFile(linhas as never, { columns: r.tabela.colunas.map(() => ({ width: 20 })) } as never).toBuffer();
  const nome = `${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${nome}"` },
  });
}
