// Super Admin → Despesas com IA (decisão #77): gráfico (hoje por hora, 7 dias, mês atual, período escolhido),
// totais em dólar e reais, ranking das 30 empresas e 20 individuais que mais consomem. Atualiza a cada 15 s.
import { prisma, Modulo, Prisma } from "@filapro/db";
import Cabecalho from "@/components/app/Cabecalho";
import Grafico, { type Barra } from "./Grafico";
import Atualizador from "./Atualizador";
import { protegerTela } from "@/lib/auth/tela";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "Últimos 7 dias" },
  { id: "mes", rotulo: "Mês atual" },
  { id: "periodo", rotulo: "Escolher período" },
] as const;

/** "AAAA-MM-DD" de hoje em São Paulo */
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const inicioSP = (dia: string) => new Date(`${dia}T00:00:00-03:00`);
const somaDias = (dia: string, n: number) => new Date(inicioSP(dia).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export default async function DespesasIAPage({ searchParams }: { searchParams: Promise<{ periodo?: string; de?: string; ate?: string }> }) {
  await protegerTela(); // trava da tela antes de qualquer dado (decisão #130)
  const f = await searchParams;
  const periodo = PERIODOS.some((p) => p.id === f.periodo) ? f.periodo! : "hoje";
  const hoje = hojeSP();
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  let de = hoje, ate = hoje, porHora = false;
  if (periodo === "hoje") porHora = true;
  else if (periodo === "7d") de = somaDias(hoje, -6);
  else if (periodo === "mes") de = hoje.slice(0, 8) + "01";
  else { de = valida(f.de) ?? somaDias(hoje, -29); ate = valida(f.ate) ?? hoje; if (ate < de) [de, ate] = [ate, de]; }
  const inicio = inicioSP(de), fim = inicioSP(somaDias(ate, 1));

  const unidade = porHora ? Prisma.sql`'hour'` : Prisma.sql`'day'`;
  const [serie, totais, porConta, superAdmin, venda] = await Promise.all([
    prisma.$queryRaw<{ b: Date; custo: number; chamadas: bigint }[]>`
      SELECT date_trunc(${unidade}, ("criadoEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo') AS b,
             sum("custoUsd")::float AS custo, count(*) AS chamadas
      FROM "UsoIA" WHERE "criadoEm" >= ${inicio} AND "criadoEm" < ${fim} GROUP BY 1 ORDER BY 1`,
    prisma.usoIA.aggregate({ where: { criadoEm: { gte: inicio, lt: fim } }, _sum: { custoUsd: true, entrada: true, saida: true, cacheLeitura: true }, _count: { _all: true } }),
    prisma.usoIA.groupBy({ by: ["empresaId"], where: { criadoEm: { gte: inicio, lt: fim }, empresaId: { not: null } }, _sum: { custoUsd: true }, _count: { _all: true } }),
    prisma.usoIA.aggregate({ where: { criadoEm: { gte: inicio, lt: fim }, empresaId: null }, _sum: { custoUsd: true }, _count: { _all: true } }),
    prisma.configVenda.findUnique({ where: { id: "config" } }),
  ]);
  const falhas = await prisma.usoIA.count({ where: { criadoEm: { gte: inicio, lt: fim }, ok: false } });
  const cot = venda?.cotacaoDolar ?? null;

  // Barras: todos os horários/dias do período, mesmo os sem gasto
  const mapa = new Map(serie.map((s) => [porHora ? s.b.toISOString().slice(11, 13) : s.b.toISOString().slice(0, 10), s]));
  const barras: Barra[] = [];
  if (porHora) for (let h = 0; h < 24; h++) { const k = String(h).padStart(2, "0"); const s = mapa.get(k); barras.push({ rotulo: `${k}h`, valor: s?.custo ?? 0, chamadas: Number(s?.chamadas ?? 0) }); }
  else for (let d = de; d <= ate; d = somaDias(d, 1)) { const s = mapa.get(d); barras.push({ rotulo: `${d.slice(8, 10)}/${d.slice(5, 7)}`, valor: s?.custo ?? 0, chamadas: Number(s?.chamadas ?? 0) }); }

  const contas = await prisma.empresa.findMany({ where: { id: { in: porConta.map((c) => c.empresaId!) } }, select: { id: true, nome: true, codigo: true, modulo: true } });
  const ranking = (modulo: Modulo, n: number) =>
    porConta
      .map((c) => ({ ...c, conta: contas.find((x) => x.id === c.empresaId) }))
      .filter((c) => c.conta?.modulo === modulo)
      .sort((a, b) => (b._sum.custoUsd ?? 0) - (a._sum.custoUsd ?? 0))
      .slice(0, n);
  const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`;
  const brl = (v: number) => (cot ? `R$ ${(v * cot).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
  const total = totais._sum.custoUsd ?? 0;

  const Tabela = ({ titulo, linhas, rotuloConta }: { titulo: string; linhas: ReturnType<typeof ranking>; rotuloConta: string }) => (
    <div className="card p-3">
      <h2 className="font-display font-bold text-[14px]">{titulo}</h2>
      {linhas.length === 0 ? <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>Nenhum gasto no período.</p> : (
        <div className="table-wrap mt-2"><table style={{ fontSize: 12 }}>
          <thead><tr><th>#</th><th>{rotuloConta}</th><th>Chamadas</th><th>Dólar</th><th>Reais</th></tr></thead>
          <tbody>{linhas.map((l, i) => (
            <tr key={l.empresaId} data-conta={l.conta?.nome}>
              <td>{i + 1}</td><td className="font-bold">{l.conta?.codigo} • {l.conta?.nome}</td><td>{l._count._all}</td>
              <td>{usd(l._sum.custoUsd ?? 0)}</td><td>{brl(l._sum.custoUsd ?? 0)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );

  return (
    <section className="flex-1 flex flex-col">
      <Atualizador segundos={15} />
      <Cabecalho rotulo="Super Admin • Administrativo" titulo="Despesas com IA" descricao="Gasto real com a IA (calculado a cada chamada). A tela se atualiza sozinha a cada 15 segundos." />
      <form className="flex flex-wrap gap-1.5 mt-3 items-end" action="/despesas-ia">
        {PERIODOS.map((p) => (
          <a key={p.id} href={p.id === "periodo" ? `/despesas-ia?periodo=periodo&de=${de}&ate=${ate}` : `/despesas-ia?periodo=${p.id}`}
            className="px-3 py-1.5 rounded-full text-[12px] font-bold border"
            style={periodo === p.id ? { background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" } : { borderColor: "var(--border)", background: "var(--surface)" }}>
            {p.rotulo}
          </a>
        ))}
        {periodo === "periodo" && (
          <>
            <input type="hidden" name="periodo" value="periodo" />
            <div><label className="label" htmlFor="de">De</label><input id="de" name="de" type="date" className="input !py-1" defaultValue={de} /></div>
            <div><label className="label" htmlFor="ate">Até</label><input id="ate" name="ate" type="date" className="input !py-1" defaultValue={ate} /></div>
            <button className="btn-ghost !py-1.5">Aplicar</button>
          </>
        )}
      </form>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
        {[
          { l: "Gasto no período", v: usd(total), s: cot ? brl(total) : "Informe a cotação em Inteligência Artificial para ver em reais" },
          { l: "Chamadas à IA", v: totais._count._all.toLocaleString("pt-BR"), s: `${falhas} com falha (sem custo)` },
          { l: "Custo médio por chamada", v: usd(totais._count._all ? total / totais._count._all : 0), s: "" },
          { l: "Tokens", v: ((totais._sum.entrada ?? 0) + (totais._sum.saida ?? 0) + (totais._sum.cacheLeitura ?? 0)).toLocaleString("pt-BR"), s: `${(totais._sum.cacheLeitura ?? 0).toLocaleString("pt-BR")} vindos do cache (≈10% do preço)` },
        ].map((c) => (
          <div key={c.l} className="card p-3" data-kpi={c.l}>
            <div className="font-display text-[22px] font-extrabold">{c.v}</div>
            <div className="text-[12px] font-bold mt-1">{c.l}</div>
            {c.s && <div className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>{c.s}</div>}
          </div>
        ))}
      </div>

      <div className="card p-3 mt-3">
        <h2 className="font-display font-bold text-[14px]">Gasto em dólar {porHora ? "por hora (hoje)" : "por dia"}</h2>
        <Grafico barras={barras} cotacao={cot} />
      </div>

      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        <Tabela titulo="30 empresas que mais consomem" linhas={ranking(Modulo.EMPRESARIAL, 30)} rotuloConta="Empresa" />
        <Tabela titulo="20 usuários individuais que mais consomem" linhas={ranking(Modulo.INDIVIDUAL, 20)} rotuloConta="Usuário individual" />
      </div>
      {(superAdmin._count._all ?? 0) > 0 && (
        <p className="text-[12px] mt-2" style={{ color: "var(--muted)" }}>
          Uso do Super Admin (testes e campanhas próprias): {superAdmin._count._all} chamadas • {usd(superAdmin._sum.custoUsd ?? 0)} {cot ? `• ${brl(superAdmin._sum.custoUsd ?? 0)}` : ""}
        </p>
      )}
    </section>
  );
}
