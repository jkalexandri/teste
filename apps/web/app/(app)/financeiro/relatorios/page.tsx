// Relatórios financeiros (decisão #106, item 8): com Baixar Excel e Imprimir no padrão aprovado (decisão #97).
import { redirect } from "next/navigation";
import { Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AbasFinanceiro from "@/components/financeiro/AbasFinanceiro";
import { AutoImprimir } from "@/components/relatorios/BarraRelatorio";
import { obterSessao } from "@/lib/auth/session";
import { sincronizarFinanceiro } from "@/lib/financeiro";
import { gerarRelatorioFin, periodo, TIPOS_FIN, type TipoFin } from "@/lib/relatorios-financeiros";

export const dynamic = "force-dynamic";
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function RelatoriosFinanceirosPage({ searchParams }: { searchParams: Promise<{ tipo?: string; de?: string; ate?: string; imprimir?: string }> }) {
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  await sincronizarFinanceiro();
  const p = await searchParams;
  const tipo: TipoFin = p.tipo && p.tipo in TIPOS_FIN ? (p.tipo as TipoFin) : "resultado";
  const { de, ate } = periodo(p.de, p.ate);
  const r = await gerarRelatorioFin(tipo, de, ate);
  const celula = (v: string | number, j: number) => (r.moeda.includes(j) && typeof v === "number" ? brl(v) : typeof v === "number" ? v.toLocaleString("pt-BR") : v);
  const total = (l: (string | number)[]) => l.some((v) => String(v).startsWith("Total"));
  const q = new URLSearchParams({ tipo, de, ate }).toString();

  if (p.imprimir === "1") {
    const emitidoEm = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    return (
      <section className="impressao">
        <AutoImprimir />
        <table className="folha">
          <thead><tr><td>
            <div className="impressao-cabecalho" data-testid="cabecalho-impressao">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/api/logos/filapro-leads-vazada.svg" alt="FilaPro Leads" className="impressao-logo" />
              <div className="impressao-info"><b>{r.titulo}</b><span>Emitido por <strong>{s.usuario.nome}</strong></span><span>em {emitidoEm}</span></div>
            </div>
            <div className="impressao-linha" />
          </td></tr></thead>
          <tbody><tr><td>
            <div className="impressao-resumo">{r.resumo.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>
            <table className="impressao-tabela" data-testid="tabela-relatorio">
              <thead><tr>{r.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{r.linhas.map((l, i) => <tr key={i} className={total(l) ? "total" : undefined}>{l.map((v, j) => <td key={j}>{celula(v, j)}</td>)}</tr>)}</tbody>
            </table>
          </td></tr></tbody>
        </table>
      </section>
    );
  }

  return (
    <section className="flex-1 flex flex-col relatorio">
      <Cabecalho rotulo="Administrativo • Financeiro" titulo="Relatórios financeiros" descricao="Escolha o relatório e o período. Baixe em Excel ou imprima (Salvar como PDF)." />
      <AbasFinanceiro atual="/financeiro/relatorios" />
      <form method="get" className="card p-3 mt-3 flex flex-wrap items-end gap-2 nao-imprimir">
        <label className="label">Relatório<select name="tipo" className="input !py-1.5 !w-auto" defaultValue={tipo} aria-label="Relatório">{Object.entries(TIPOS_FIN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {r.periodo && <><label className="label">De<input name="de" type="date" className="input !py-1.5 !w-auto" defaultValue={de} /></label><label className="label">Até<input name="ate" type="date" className="input !py-1.5 !w-auto" defaultValue={ate} /></label></>}
        <button className="btn-primary">Ver</button>
        <a className="btn-ghost" href={`/api/financeiro/relatorios/${tipo}?${q}`} data-testid="baixar-excel">Baixar Excel</a>
        <a className="btn-ghost" href={`?${q}&imprimir=1`} target="_blank" rel="noreferrer">Imprimir</a>
      </form>
      <div className="card p-4 mt-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="resumo">
        {r.resumo.map(([k, v]) => <div key={k}><p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{k}</p><p className="text-[15px] font-extrabold">{v}</p></div>)}
      </div>
      <div className="card p-3 mt-3">
        <h2 className="font-extrabold text-[14px] mb-2">{r.titulo}</h2>
        {r.linhas.length === 0 ? <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nada neste período.</p> : (
          <div className="table-wrap">
            <table style={{ fontSize: 12 }} data-testid="tabela-relatorio">
              <thead><tr>{r.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{r.linhas.map((l, i) => <tr key={i} style={total(l) ? { fontWeight: 800 } : undefined}>{l.map((v, j) => <td key={j} className={r.moeda.includes(j) ? "whitespace-nowrap" : undefined}>{celula(v, j)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
