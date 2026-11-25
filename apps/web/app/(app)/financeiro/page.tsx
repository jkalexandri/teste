// Painel financeiro (decisão #106): resultado do mês e do anterior, 12 meses, contas vencendo e receita recorrente.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Cargo } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AbasFinanceiro from "@/components/financeiro/AbasFinanceiro";
import { obterSessao } from "@/lib/auth/session";
import { contasVencendo, diaBR, mesAtual, nomeMes, proximoMes, reais, receitaRecorrente, resumoDoMes, sincronizarFinanceiro } from "@/lib/financeiro";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

function Cartao({ rotulo, valor, cor, teste }: { rotulo: string; valor: string; cor?: string; teste?: string }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{rotulo}</p>
      <p className="text-[18px] font-extrabold" style={{ color: cor }} data-testid={teste}>{valor}</p>
    </div>
  );
}

export default async function PainelFinanceiro() {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  const sync = await sincronizarFinanceiro();
  const mes = mesAtual();
  const meses = Array.from({ length: 12 }, (_, i) => proximoMes(mes, i - 11));
  const [atual, anterior, serie, venc, rec] = await Promise.all([
    resumoDoMes(mes), resumoDoMes(proximoMes(mes, -1)), Promise.all(meses.map((m) => resumoDoMes(m))), contasVencendo(7), receitaRecorrente(),
  ]);
  const maior = Math.max(1, ...serie.flatMap((x) => [x.receitas, x.despesas]));
  const cor = (v: number) => (v < 0 ? "#b42318" : "#16a34a");

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Administrativo • Financeiro" titulo="Painel financeiro" descricao="Faturamento e despesas da plataforma (regime de caixa: pelo dia do pagamento). Receitas dos pedidos entram sozinhas." />
      <AbasFinanceiro atual="/financeiro" />
      {sync.semCotacao && <p className="card p-3 mt-3 text-[12px]" style={{ background: "#fff4e5", color: "#7a4a00" }}>A despesa com IA do mês passado não foi lançada: falta a <b>cotação do dólar</b> no menu Inteligência Artificial.</p>}

      <h2 className="font-extrabold text-[15px] mt-4">{nomeMes(mes).replace(/^./, (c) => c.toUpperCase())}</h2>
      <div className="grid gap-2 mt-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="resumo-mes">
        <Cartao rotulo="Receitas" valor={reais(atual.receitas)} cor="#16a34a" teste="fin-receitas" />
        <Cartao rotulo="Despesas" valor={reais(atual.despesas)} cor="#b42318" teste="fin-despesas" />
        <Cartao rotulo="Lucro (caixa)" valor={reais(atual.lucroCaixa)} cor={cor(atual.lucroCaixa)} teste="fin-lucro" />
        <Cartao rotulo={`Imposto previsto (${atual.aliquota.toLocaleString("pt-BR")}%)`} valor={reais(atual.imposto)} teste="fin-imposto" />
        <Cartao rotulo="A receber no mês" valor={reais(atual.aReceber)} />
        <Cartao rotulo="A pagar no mês" valor={reais(atual.aPagar)} />
      </div>
      <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>
        Mês anterior: receitas {reais(anterior.receitas)} • despesas {reais(anterior.despesas)} • lucro <b style={{ color: cor(anterior.lucroCaixa) }}>{reais(anterior.lucroCaixa)}</b>
      </p>

      <div className="grid gap-3 mt-3 lg:grid-cols-[1fr_360px]">
        <div className="card p-3">
          <h3 className="font-extrabold text-[13px]">Últimos 12 meses</h3>
          <p className="text-[11px]" style={{ color: "var(--muted)" }}><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1" style={{ background: "#16a34a" }} />Receitas <span className="inline-block w-2.5 h-2.5 rounded-sm mx-1" style={{ background: "#e5484d" }} />Despesas</p>
          <div className="flex items-end gap-1.5 h-[170px] mt-2" data-testid="grafico-12-meses" role="img" aria-label="Receitas e despesas dos últimos 12 meses">
            {serie.map((x) => (
              <div key={x.mes} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${nomeMes(x.mes)}: receitas ${reais(x.receitas)}, despesas ${reais(x.despesas)}, lucro ${reais(x.lucroCaixa)}`}>
                <div className="flex items-end gap-[2px] h-[140px] w-full justify-center">
                  <div className="w-1/2 max-w-[14px] rounded-t" style={{ height: `${(Math.max(0, x.receitas) / maior) * 100}%`, background: "#16a34a" }} />
                  <div className="w-1/2 max-w-[14px] rounded-t" style={{ height: `${(x.despesas / maior) * 100}%`, background: "#e5484d" }} />
                </div>
                <span className="text-[9px]" style={{ color: "var(--muted)" }}>{x.mes.slice(5)}/{x.mes.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-3">
          <h3 className="font-extrabold text-[13px]">Clientes e receita recorrente</h3>
          <dl className="grid grid-cols-2 gap-2 mt-2 text-[12px]">
            <div><dt style={{ color: "var(--muted)" }}>Receita recorrente mensal</dt><dd className="font-extrabold text-[15px]" data-testid="fin-mrr">{reais(rec.mrr)}</dd></div>
            <div><dt style={{ color: "var(--muted)" }}>Ticket médio mensal</dt><dd className="font-extrabold text-[15px]">{reais(rec.ticket)}</dd></div>
            <div><dt style={{ color: "var(--muted)" }}>Clientes ativos</dt><dd className="font-extrabold text-[15px]">{rec.ativos}</dd></div>
            <div><dt style={{ color: "var(--muted)" }}>Pagantes</dt><dd className="font-extrabold text-[15px]">{rec.pagantes}</dd></div>
          </dl>
          <Link href="/financeiro/relatorios?tipo=renovacoes" className="text-[12px] underline mt-2 inline-block">Previsão de renovações</Link>
        </div>
      </div>

      <div className="card p-3 mt-3">
        <div className="flex items-center justify-between"><h3 className="font-extrabold text-[13px]">Contas vencidas e dos próximos 7 dias</h3><Link href="/financeiro/contas" className="text-[12px] underline">Ver todas</Link></div>
        {venc.vencidas.length + venc.proximas.length === 0 ? <p className="text-[12px] mt-1" style={{ color: "var(--muted)" }}>Nenhuma conta pendente nesse período.</p> : (
          <ul className="text-[12px] mt-1 divide-y" style={{ borderColor: "var(--border)" }} data-testid="contas-vencendo">
            {[...venc.vencidas, ...venc.proximas].slice(0, 10).map((x) => (
              <li key={x.id} className="py-1 flex justify-between gap-2">
                <span><b style={{ color: x.vencimento < new Date() ? "#b42318" : undefined }}>{diaBR(x.vencimento)}</b> • {x.tipo === "RECEITA" ? "Receber" : "Pagar"} • {x.descricao}</span>
                <b>{reais(x.valor)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
