// Contas a pagar e a receber (decisão #106, item 5): pendentes por vencimento — vencidas, próximos 7 dias e depois.
import { redirect } from "next/navigation";
import { prisma, Cargo, SituacaoLancamento } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import AbasFinanceiro from "@/components/financeiro/AbasFinanceiro";
import AcoesLancamento from "@/components/financeiro/AcoesLancamento";
import { obterSessao } from "@/lib/auth/session";
import { diaBR, reais, sincronizarFinanceiro } from "@/lib/financeiro";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

export default async function ContasPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const s = await obterSessao();
  if (!s) redirect("/login");
  if (s.usuario.cargo !== Cargo.SUPERADMIN) redirect("/dashboard");
  await sincronizarFinanceiro();
  const p = await searchParams;
  const tipo = p.tipo === "RECEITA" || p.tipo === "DESPESA" ? p.tipo : undefined;
  const [pendentes, contas] = await Promise.all([
    prisma.lancamento.findMany({ where: { situacao: SituacaoLancamento.PENDENTE, ...(tipo ? { tipo } : {}) }, orderBy: { vencimento: "asc" }, include: { categoria: true }, take: 500 }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  const hojeTxt = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const hoje0 = new Date(`${hojeTxt}T00:00:00-03:00`);
  const em7 = new Date(hoje0.getTime() + 8 * 86400_000);
  const grupos = [
    { titulo: "Vencidas", cor: "#b42318", itens: pendentes.filter((x) => x.vencimento < hoje0) },
    { titulo: "Próximos 7 dias", cor: "#b45309", itens: pendentes.filter((x) => x.vencimento >= hoje0 && x.vencimento < em7) },
    { titulo: "Depois", cor: "var(--muted)", itens: pendentes.filter((x) => x.vencimento >= em7) },
  ];
  const soma = (t: string) => pendentes.filter((x) => x.tipo === t).reduce((a, x) => a + x.valor, 0);

  return (
    <section className="flex-1 flex flex-col">
      <Cabecalho rotulo="Administrativo • Financeiro" titulo="Contas a pagar e receber" descricao="Tudo o que está pendente, por vencimento. Você recebe aviso no WhatsApp e no celular das vencidas e das que vencem em até 3 dias." />
      <AbasFinanceiro atual="/financeiro/contas" />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {[["", "Todas"], ["DESPESA", "A pagar"], ["RECEITA", "A receber"]].map(([v, r]) => (
          <a key={v} href={v ? `?tipo=${v}` : "?"} className={(tipo ?? "") === v ? "btn-primary !py-1.5" : "btn-ghost !py-1.5"}>{r}</a>
        ))}
        <span className="text-[12px] ml-auto" data-testid="totais-contas">A pagar: <b style={{ color: "#b42318" }}>{reais(soma("DESPESA"))}</b> • A receber: <b style={{ color: "#16a34a" }}>{reais(soma("RECEITA"))}</b></span>
      </div>
      {grupos.map((g) => (
        <div key={g.titulo} className="card p-3 mt-3" data-testid={`grupo-${g.titulo}`}>
          <h3 className="font-extrabold text-[13px]" style={{ color: g.cor }}>{g.titulo} ({g.itens.length})</h3>
          {g.itens.length === 0 ? <p className="text-[12px]" style={{ color: "var(--muted)" }}>Nada aqui.</p> : (
            <div className="table-wrap mt-1">
              <table style={{ fontSize: 12, minWidth: 820 }}>
                <thead><tr><th>Vencimento</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Ações</th></tr></thead>
                <tbody>
                  {g.itens.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">{diaBR(l.vencimento)}</td>
                      <td>{l.tipo === "RECEITA" ? "A receber" : "A pagar"}</td>
                      <td>{l.descricao}</td>
                      <td>{l.categoria?.nome ?? "—"}</td>
                      <td className="font-bold whitespace-nowrap">{reais(l.valor)}</td>
                      <td><AcoesLancamento l={{ id: l.id, tipo: l.tipo, situacao: l.situacao, origem: l.origem, valor: l.valor, comprovante: !!l.comprovanteTipo }} contas={contas} hoje={hojeTxt} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
