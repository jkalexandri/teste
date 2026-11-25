// Configurações financeiras (decisão #106): alíquota do imposto previsto, categorias e contas bancárias.
import { redirect } from "next/navigation";
import { prisma, Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AbasFinanceiro from "@/components/financeiro/AbasFinanceiro";
import FormFin from "@/components/financeiro/FormFin";
import BotaoFin from "@/components/financeiro/BotaoFin";
import { obterSessao } from "@/lib/auth/session";
import { garantirCategorias } from "@/lib/financeiro";
import { alternarCategoria, alternarConta, salvarAliquota, salvarCategoria, salvarConta } from "../actions";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function ConfigFinanceiroPage() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  await garantirCategorias();
  const [cfg, categorias, contas] = await Promise.all([
    prisma.configVenda.findUnique({ where: { id: "config" } }),
    prisma.categoriaFinanceira.findMany({ orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { nome: "asc" }] }),
    prisma.contaBancaria.findMany({ orderBy: { nome: "asc" } }),
  ]);
  const lista = (tipo: "RECEITA" | "DESPESA") => (
    <ul className="text-[12px] mt-1 grid gap-1">
      {categorias.filter((c) => c.tipo === tipo).map((c) => (
        <li key={c.id} className="flex items-center justify-between gap-2" style={{ opacity: c.ativa ? 1 : 0.55 }}>
          <span>{c.nome}{c.padrao ? <small style={{ color: "var(--muted)" }}> • padrão</small> : null}</span>
          <BotaoFin acao={alternarCategoria} id={c.id} rotulo={c.ativa ? "Esconder" : "Reativar"} />
        </li>
      ))}
    </ul>
  );

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Administrativo • Financeiro" titulo="Configurações financeiras" descricao="Imposto previsto, categorias de receita e despesa e contas bancárias." />
      <AbasFinanceiro atual="/financeiro/configuracoes" />
      <div className="card p-3 mt-3">
        <h3 className="font-extrabold text-[13px]">Imposto previsto</h3>
        <p className="text-[12px]" style={{ color: "var(--muted)" }}>Porcentagem sobre o faturamento <b>recebido</b> no mês (ex.: a alíquota do Simples Nacional). Em branco: não calcula.</p>
        <FormFin acao={salvarAliquota} limpar={false} className="flex gap-2 items-end mt-2">
          <label className="label">Alíquota (%)<input name="aliquota" className="input !w-[120px]" inputMode="decimal" defaultValue={cfg?.aliquotaImposto != null ? String(cfg.aliquotaImposto).replace(".", ",") : ""} aria-label="Alíquota (%)" /></label>
          <button className="btn-primary">Salvar</button>
        </FormFin>
      </div>
      <div className="grid gap-3 mt-3 lg:grid-cols-3">
        <div className="card p-3"><h3 className="font-extrabold text-[13px]">Categorias de despesa</h3>{lista("DESPESA")}</div>
        <div className="card p-3"><h3 className="font-extrabold text-[13px]">Categorias de receita</h3>{lista("RECEITA")}
          <h3 className="font-extrabold text-[13px] mt-4">Nova categoria</h3>
          <FormFin acao={salvarCategoria} className="grid gap-2 mt-1">
            <select name="tipo" className="input" aria-label="Tipo da categoria"><option value="DESPESA">Despesa</option><option value="RECEITA">Receita</option></select>
            <input name="nome" className="input" placeholder="Nome" required maxLength={60} aria-label="Nome da categoria" />
            <button className="btn-primary">Criar categoria</button>
          </FormFin>
        </div>
        <div className="card p-3"><h3 className="font-extrabold text-[13px]">Contas bancárias</h3>
          <ul className="text-[12px] mt-1 grid gap-1">
            {contas.length === 0 && <li style={{ color: "var(--muted)" }}>Nenhuma conta (é opcional).</li>}
            {contas.map((c) => <li key={c.id} className="flex items-center justify-between gap-2" style={{ opacity: c.ativa ? 1 : 0.55 }}><span>{c.nome}</span><BotaoFin acao={alternarConta} id={c.id} rotulo={c.ativa ? "Esconder" : "Reativar"} /></li>)}
          </ul>
          <FormFin acao={salvarConta} className="grid gap-2 mt-2">
            <input name="nome" className="input" placeholder="Ex.: Banco, Cartão de crédito" required maxLength={60} aria-label="Nome da conta" />
            <button className="btn-primary">Adicionar conta</button>
          </FormFin>
        </div>
      </div>
    </section>
  );
}
