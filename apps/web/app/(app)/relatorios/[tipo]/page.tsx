// Relatórios do Super Admin (etapa 11 — especificação seção 6 e decisão #96).
// Empresarial, Individual, Leads Empresarial, Lead Individual e Campanhas; com Baixar Excel e Imprimir.
import { notFound, redirect } from "next/navigation";
import { Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import BarraRelatorio, { AutoImprimir } from "@/components/relatorios/BarraRelatorio";
import { obterSessao } from "@/lib/auth/session";
import { contasDoRelatorio, gerarRelatorio, TIPOS, type Parametros, type TipoRelatorio } from "@/lib/relatorios";

export const dynamic = "force-dynamic";

const ROTULO_CONTA: Record<TipoRelatorio, string> = {
  empresarial: "Empresa", individual: "Usuário individual", "leads-empresarial": "Empresa", "lead-individual": "Usuário individual", campanhas: "Conta",
};

export default async function RelatorioPage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<Parametros & { imprimir?: string }> }) {
  const { tipo } = await params;
  if (!(tipo in TIPOS)) notFound();
  const s = await obterSessao();
  if (!s || s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  const t = tipo as TipoRelatorio;
  const p = await searchParams;
  const imprimir = p.imprimir === "1";
  const [contas, r] = await Promise.all([contasDoRelatorio(t, s.usuario.id), gerarRelatorio(t, p, s.usuario.id, imprimir)]);
  const leads = t === "leads-empresarial" || t === "lead-individual";
  const ir = (pagina: number) => {
    const q = new URLSearchParams(Object.entries(p).filter(([k, v]) => v && k !== "pagina" && k !== "imprimir") as [string, string][]);
    q.set("pagina", String(pagina));
    return `?${q.toString()}`;
  };

  return (
    <section className="flex-1 flex flex-col relatorio">
      {imprimir && <AutoImprimir />}
      <Cabecalho rotulo="Administrativo • Relatório" titulo={r?.titulo ?? TIPOS[t]} descricao={imprimir ? `Emitido em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : undefined} />
      {!imprimir && (
        <BarraRelatorio tipo={t} contas={contas} rotuloConta={ROTULO_CONTA[t]} filtrosLeads={leads} filtroPeriodo={leads || t === "campanhas"} usuarios={r?.usuarios} temResultado={!!r} />
      )}
      {!r ? (
        <div className="card p-4 mt-3 text-[13px]" style={{ color: "var(--muted)" }}>Escolha {ROTULO_CONTA[t] === "Empresa" ? "a empresa" : "o usuário"} para ver o relatório.</div>
      ) : (
        <>
          {r.resumo && (
            <div className="card p-4 mt-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-3" data-testid="resumo">
              {r.resumo.map(([k, v]) => (
                <div key={k}><p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{k}</p><p className="text-[14px] font-bold [overflow-wrap:anywhere]">{v}</p></div>
              ))}
            </div>
          )}
          <div className="card p-3 mt-3">
            {r.total !== undefined && (
              <p className="text-[12px] mb-2" data-testid="total">
                <b>{r.total.toLocaleString("pt-BR")}</b> {t === "campanhas" ? (r.total === 1 ? "campanha" : "campanhas") : r.total === 1 ? "lead" : "leads"}
                {!imprimir && r.paginas! > 1 && ` • página ${r.pagina} de ${r.paginas}`}
              </p>
            )}
            {r.tabela.linhas.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nada encontrado com estes filtros.</p>
            ) : (
              <div className="table-wrap">
                <table style={{ fontSize: 12 }} data-testid="tabela-relatorio">
                  <thead><tr>{r.tabela.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {r.tabela.linhas.map((l, i) => (
                      <tr key={i} style={String(l[1]).startsWith("Total") ? { fontWeight: 800 } : undefined}>
                        {l.map((v, j) => <td key={j} style={{ whiteSpace: j === 0 ? "nowrap" : undefined }}>{typeof v === "number" ? v.toLocaleString("pt-BR") : v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!imprimir && r.paginas !== undefined && r.paginas > 1 && (
              <div className="flex gap-2 justify-end mt-2 nao-imprimir">
                {r.pagina! > 1 && <a className="btn-ghost !py-1" href={ir(r.pagina! - 1)}>← Anterior</a>}
                {r.pagina! < r.paginas && <a className="btn-ghost !py-1" href={ir(r.pagina! + 1)}>Próxima →</a>}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
