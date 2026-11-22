// Despesas fixas mensais (decisão #106, item 4): lançadas sozinhas todo mês como pendentes.
import { redirect } from "next/navigation";
import { prisma, Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AbasFinanceiro from "@/components/financeiro/AbasFinanceiro";
import FormFin from "@/components/financeiro/FormFin";
import BotaoFin from "@/components/financeiro/BotaoFin";
import { obterSessao } from "@/lib/auth/session";
import { reais, sincronizarFinanceiro } from "@/lib/financeiro";
import { alternarFixa, salvarFixa } from "../actions";

export const dynamic = "force-dynamic";

export default async function FixasPage() {
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  await sincronizarFinanceiro();
  const [fixas, categorias, contas] = await Promise.all([
    prisma.despesaFixa.findMany({ orderBy: [{ ativa: "desc" }, { diaVencimento: "asc" }], include: { categoria: true, conta: true } }),
    prisma.categoriaFinanceira.findMany({ where: { tipo: "DESPESA", ativa: true }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
  ]);
  const total = fixas.filter((f) => f.ativa).reduce((a, f) => a + f.valor, 0);
  const campos = (f?: (typeof fixas)[number]) => (
    <>
      {f && <input type="hidden" name="id" value={f.id} />}
      <label className="label">Descrição<input name="descricao" className="input" required maxLength={200} defaultValue={f?.descricao} aria-label="Descrição da despesa fixa" /></label>
      <label className="label">Valor (R$)<input name="valor" className="input" required inputMode="decimal" defaultValue={f ? (f.valor / 100).toFixed(2).replace(".", ",") : ""} aria-label="Valor mensal" /></label>
      <label className="label">Dia do vencimento<input name="dia" type="number" min={1} max={31} className="input" required defaultValue={f?.diaVencimento ?? 10} aria-label="Dia do vencimento" /></label>
      <label className="label">Categoria<select name="categoriaId" className="input" defaultValue={f?.categoriaId ?? ""}><option value="">—</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label className="label">Conta<select name="contaId" className="input" defaultValue={f?.contaId ?? ""}><option value="">—</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
    </>
  );

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Administrativo • Financeiro" titulo="Despesas fixas" descricao="Despesas que se repetem todo mês (ex.: VPS, domínio, chips). O sistema lança sozinho a do mês como pendente; você confirma o pagamento." />
      <AbasFinanceiro atual="/financeiro/fixas" />
      <div className="card p-3 mt-3">
        <h3 className="font-extrabold text-[13px]">Nova despesa fixa</h3>
        <FormFin acao={salvarFixa} className="grid gap-2 mt-2 sm:grid-cols-2 lg:grid-cols-6 items-end">
          {campos()}
          <button className="btn-primary">Adicionar</button>
        </FormFin>
      </div>
      <div className="card p-3 mt-3">
        <p className="text-[12px] mb-2">Total mensal das ativas: <b data-testid="total-fixas">{reais(total)}</b></p>
        {fixas.length === 0 ? <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nenhuma despesa fixa ainda.</p> : (
          <div className="grid gap-2" data-testid="lista-fixas">
            {fixas.map((f) => (
              <details key={f.id} className="rounded-lg p-2" style={{ border: "1px solid var(--border)", opacity: f.ativa ? 1 : 0.6 }}>
                <summary className="cursor-pointer text-[13px] flex flex-wrap gap-2 items-center">
                  <b>{f.descricao}</b> <span>{reais(f.valor)}</span> <span style={{ color: "var(--muted)" }}>• vence todo dia {f.diaVencimento}{f.categoria ? ` • ${f.categoria.nome}` : ""}{f.conta ? ` • ${f.conta.nome}` : ""}{f.ativa ? "" : " • pausada"}</span>
                </summary>
                <FormFin acao={salvarFixa} limpar={false} className="grid gap-2 mt-2 sm:grid-cols-2 lg:grid-cols-6 items-end">
                  {campos(f)}
                  <div className="flex gap-1"><button className="btn-primary">Salvar</button><BotaoFin acao={alternarFixa} id={f.id} rotulo={f.ativa ? "Pausar" : "Reativar"} /></div>
                </FormFin>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
