// Lançamentos (decisão #106): receitas e despesas com filtros, novo lançamento e ações por linha.
import { redirect } from "next/navigation";
import { prisma, Cargo, SituacaoLancamento, type Prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AbasFinanceiro from "@/components/financeiro/AbasFinanceiro";
import FormFin from "@/components/financeiro/FormFin";
import AcoesLancamento from "@/components/financeiro/AcoesLancamento";
import { obterSessao } from "@/lib/auth/session";
import { diaBR, reais, sincronizarFinanceiro } from "@/lib/financeiro";
import { periodo } from "@/lib/relatorios-financeiros";
import { criarLancamento } from "../actions";

export const dynamic = "force-dynamic";
const POR_PAGINA = 100;
const SITUACAO: Record<string, string> = { PENDENTE: "Pendente", PAGO: "Pago", CANCELADO: "Cancelado" };
const ORIGEM: Record<string, string> = { MANUAL: "Manual", PEDIDO: "Pedido", FIXA: "Despesa fixa", IA: "IA (automático)", ESTORNO: "Estorno", ASAAS: "Asaas (automático)" };
type Busca = { de?: string; ate?: string; tipo?: string; categoria?: string; conta?: string; situacao?: string; pagina?: string; busca?: string };

export default async function LancamentosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  await sincronizarFinanceiro();
  const p = await searchParams;
  const { de, ate, ini, fim } = periodo(p.de, p.ate);
  const where: Prisma.LancamentoWhereInput = {
    // Pagos pela data do pagamento; pendentes e cancelados pelo vencimento
    OR: [{ situacao: SituacaoLancamento.PAGO, pagoEm: { gte: ini, lte: fim } }, { situacao: { not: SituacaoLancamento.PAGO }, vencimento: { gte: ini, lte: fim } }],
    ...(p.tipo === "RECEITA" || p.tipo === "DESPESA" ? { tipo: p.tipo } : {}),
    ...(p.categoria ? { categoriaId: p.categoria } : {}),
    ...(p.conta ? { contaId: p.conta } : {}),
    ...(p.situacao && p.situacao in SITUACAO ? { situacao: p.situacao as SituacaoLancamento } : {}),
    ...(p.busca ? { descricao: { contains: p.busca, mode: "insensitive" } } : {}),
  };
  const pagina = Math.max(1, Number(p.pagina) || 1);
  const [total, lista, categorias, contas, somaR, somaD] = await Promise.all([
    prisma.lancamento.count({ where }),
    prisma.lancamento.findMany({ where, orderBy: [{ vencimento: "desc" }, { criadoEm: "desc" }], skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA, include: { categoria: true, conta: true } }),
    prisma.categoriaFinanceira.findMany({ where: { ativa: true }, orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { nome: "asc" }] }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.lancamento.aggregate({ _sum: { valor: true }, where: { AND: [where, { tipo: "RECEITA", situacao: { not: SituacaoLancamento.CANCELADO } }] } }),
    prisma.lancamento.aggregate({ _sum: { valor: true }, where: { AND: [where, { tipo: "DESPESA", situacao: { not: SituacaoLancamento.CANCELADO } }] } }),
  ]);
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v && k !== "pagina")), pagina: String(n) } as Record<string, string>)}`;
  const contasSimples = contas.map((c) => ({ id: c.id, nome: c.nome }));

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Administrativo • Financeiro" titulo="Lançamentos" descricao="Receitas e despesas. Os pagos aparecem pela data do pagamento; os pendentes, pelo vencimento." />
      <AbasFinanceiro atual="/financeiro/lancamentos" />

      <details className="card p-3 mt-3" data-testid="novo-lancamento">
        <summary className="cursor-pointer font-extrabold text-[13px]">+ Novo lançamento</summary>
        <FormFin acao={criarLancamento} className="grid gap-2 mt-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="label">Tipo<select name="tipo" className="input" defaultValue="DESPESA" aria-label="Tipo"><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option></select></label>
          <label className="label lg:col-span-2">Descrição<input name="descricao" className="input" required maxLength={200} aria-label="Descrição" /></label>
          <label className="label">Valor (R$)<input name="valor" className="input" required placeholder="0,00" inputMode="decimal" aria-label="Valor" /></label>
          <label className="label">Categoria<select name="categoriaId" className="input" aria-label="Categoria"><option value="">—</option>
            <optgroup label="Despesas">{categorias.filter((c) => c.tipo === "DESPESA").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
            <optgroup label="Receitas">{categorias.filter((c) => c.tipo === "RECEITA").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
          </select></label>
          <label className="label">Vencimento<input name="vencimento" type="date" className="input" required defaultValue={hoje} aria-label="Vencimento" /></label>
          <label className="label">Conta<select name="contaId" className="input" aria-label="Conta"><option value="">—</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <label className="label">Comprovante (opcional)<input name="comprovante" type="file" accept="application/pdf,image/jpeg,image/png" className="input !py-1" aria-label="Comprovante" /></label>
          <label className="flex items-center gap-2 text-[12px] font-bold"><input type="checkbox" name="pago" defaultChecked aria-label="Já foi pago" /> Já foi pago/recebido em</label>
          <label className="label">Data do pagamento<input name="pagoEm" type="date" className="input" defaultValue={hoje} aria-label="Data do pagamento" /></label>
          <label className="label lg:col-span-2">Observação<input name="observacao" className="input" maxLength={500} /></label>
          <div className="lg:col-span-4"><button className="btn-primary">Salvar lançamento</button></div>
        </FormFin>
      </details>

      <form method="get" className="card p-3 mt-3 flex flex-wrap items-end gap-2">
        <label className="label">De<input name="de" type="date" className="input !py-1.5 !w-auto" defaultValue={de} /></label>
        <label className="label">Até<input name="ate" type="date" className="input !py-1.5 !w-auto" defaultValue={ate} /></label>
        <label className="label">Tipo<select name="tipo" className="input !py-1.5 !w-auto" defaultValue={p.tipo ?? ""}><option value="">Todos</option><option value="RECEITA">Receitas</option><option value="DESPESA">Despesas</option></select></label>
        <label className="label">Categoria<select name="categoria" className="input !py-1.5 !w-auto" defaultValue={p.categoria ?? ""}><option value="">Todas</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.tipo === "RECEITA" ? "Receita" : "Despesa"}: {c.nome}</option>)}</select></label>
        <label className="label">Conta<select name="conta" className="input !py-1.5 !w-auto" defaultValue={p.conta ?? ""}><option value="">Todas</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label className="label">Situação<select name="situacao" className="input !py-1.5 !w-auto" defaultValue={p.situacao ?? ""}><option value="">Todas</option>{Object.entries(SITUACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="label">Buscar<input name="busca" className="input !py-1.5 !w-[160px]" defaultValue={p.busca ?? ""} /></label>
        <button className="btn-primary">Filtrar</button>
      </form>

      <div className="card p-3 mt-3">
        <p className="text-[12px] mb-2" data-testid="totais-lancamentos"><b>{total}</b> lançamento{total === 1 ? "" : "s"} • receitas <b style={{ color: "#16a34a" }}>{reais(somaR._sum.valor ?? 0)}</b> • despesas <b style={{ color: "#b42318" }}>{reais(somaD._sum.valor ?? 0)}</b>{paginas > 1 ? ` • página ${pagina} de ${paginas}` : ""}</p>
        {lista.length === 0 ? <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nenhum lançamento com estes filtros.</p> : (
          <div className="table-wrap">
            <table style={{ fontSize: 12, minWidth: 960 }} data-testid="tabela-lancamentos">
              <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead>
              <tbody>
                {lista.map((l) => (
                  <tr key={l.id} data-situacao={l.situacao} style={l.situacao === "CANCELADO" ? { opacity: 0.55 } : undefined}>
                    <td className="whitespace-nowrap">{diaBR(l.pagoEm ?? l.vencimento)}{l.situacao !== "PAGO" ? <><br /><small style={{ color: "var(--muted)" }}>vence {diaBR(l.vencimento)}</small></> : null}</td>
                    <td>{l.tipo === "RECEITA" ? "Receita" : "Despesa"}</td>
                    <td>{l.descricao}<br /><small style={{ color: "var(--muted)" }}>{ORIGEM[l.origem] ?? l.origem}{l.observacao ? ` • ${l.observacao}` : ""}</small></td>
                    <td>{l.categoria?.nome ?? "—"}</td>
                    <td>{l.conta?.nome ?? "—"}</td>
                    <td className="whitespace-nowrap font-bold" style={{ color: l.tipo === "RECEITA" ? (l.valor < 0 ? "#b42318" : "#16a34a") : "#b42318" }}>{l.tipo === "DESPESA" ? "− " : ""}{reais(l.valor)}</td>
                    <td>{SITUACAO[l.situacao]}</td>
                    <td><AcoesLancamento l={{ id: l.id, tipo: l.tipo, situacao: l.situacao, origem: l.origem, valor: l.valor, comprovante: !!l.comprovanteTipo }} contas={contasSimples} hoje={hoje} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && (
          <div className="flex gap-2 justify-end mt-2">
            {pagina > 1 && <a className="btn-ghost !py-1" href={link(pagina - 1)}>← Anterior</a>}
            {pagina < paginas && <a className="btn-ghost !py-1" href={link(pagina + 1)}>Próxima →</a>}
          </div>
        )}
      </div>
    </section>
  );
}
