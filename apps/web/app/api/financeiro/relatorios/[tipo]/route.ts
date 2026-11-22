// GET /api/financeiro/relatorios/<tipo>?de=&ate= — Excel do relatório financeiro (decisão #106). Só o Super Admin.
import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { Cargo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { gerarRelatorioFin, TIPOS_FIN, type TipoFin } from "@/lib/relatorios-financeiros";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const s = await obterSessao();
  if (!s || s.precisaTrocar || s.usuario.cargo !== Cargo.SUPERADMIN) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
  if (!(tipo in TIPOS_FIN)) return NextResponse.json({ erro: "Relatório inválido." }, { status: 404 });
  const u = new URL(req.url).searchParams;
  const r = await gerarRelatorioFin(tipo as TipoFin, u.get("de") ?? undefined, u.get("ate") ?? undefined);
  const negrito = (v: string | number) => ({ value: v, fontWeight: "bold" as const });
  const linhas = [
    [negrito(r.titulo)],
    [{ value: `Emitido por ${s.usuario.nome} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` }],
    [],
    ...r.resumo.map(([k, v]) => [negrito(k), { value: v }]),
    [],
    r.colunas.map(negrito),
    ...r.linhas.map((l) => l.map((v, j) => (typeof v === "number" ? { value: v, type: Number, ...(r.moeda.includes(j) ? { format: "#,##0.00" } : {}) } : { value: v }))),
  ];
  const buf = await writeXlsxFile(linhas as never, { columns: r.colunas.map((_, j) => ({ width: j === 0 || r.colunas[j] === "Descrição" ? 34 : 18 })) } as never).toBuffer();
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="financeiro-${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx"` },
  });
}
