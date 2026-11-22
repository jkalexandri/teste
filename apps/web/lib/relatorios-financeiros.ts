// Relatórios financeiros do Super Admin (decisão #106, item 8). A tela, a impressão e o Excel usam as mesmas funções.
// Colunas em "moeda" vêm em reais (número) e são formatadas como R$ na tela e no Excel.
import "server-only";
import { prisma, Modulo, StatusPedido, SituacaoLancamento } from "@filapro/db";
import { DESPESA, RECEITA, diaBR, fimDoMes, inicioDoMes, mesAtual, nomeMes, proximoMes, reais, receitaRecorrente, resumoDoMes } from "@/lib/financeiro";

export const TIPOS_FIN = {
  resultado: "Resultado por mês",
  fluxo: "Fluxo de caixa",
  "por-plano": "Faturamento por plano",
  "por-tipo": "Receitas e despesas por categoria",
  recorrente: "Receita recorrente e clientes ativos",
  cancelamentos: "Cancelamentos (não renovaram)",
  renovacoes: "Previsão de renovações (30/60/90 dias)",
} as const;
export type TipoFin = keyof typeof TIPOS_FIN;
export type RelFin = { titulo: string; resumo: [string, string][]; colunas: string[]; moeda: number[]; linhas: (string | number)[][]; periodo: boolean };

const r2 = (c: number) => Math.round(c) / 100;
const tipoConta = (m: Modulo) => (m === Modulo.EMPRESARIAL ? "Empresa" : "Individual");

/** Período padrão: últimos 6 meses até o mês atual (datas AAAA-MM-DD). */
export function periodo(de?: string, ate?: string) {
  const hoje = mesAtual();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(de ?? "") ? de! : `${proximoMes(hoje, -5)}-01`;
  const a = /^\d{4}-\d{2}-\d{2}$/.test(ate ?? "") ? ate! : new Date(fimDoMes(hoje).getTime() - 86400_000 - 3 * 3600_000).toISOString().slice(0, 10);
  return { de: d, ate: a, ini: new Date(`${d}T00:00:00-03:00`), fim: new Date(`${a}T23:59:59.999-03:00`) };
}

export async function gerarRelatorioFin(tipo: TipoFin, deS?: string, ateS?: string): Promise<RelFin> {
  const { de, ate, ini, fim } = periodo(deS, ateS);
  const titulo = `${TIPOS_FIN[tipo]}${["recorrente", "renovacoes"].includes(tipo) ? "" : ` — ${diaBR(ini)} a ${diaBR(fim)}`}`;
  const pagoNoPeriodo = { situacao: SituacaoLancamento.PAGO, pagoEm: { gte: ini, lte: fim } };

  if (tipo === "resultado") {
    const linhas: (string | number)[][] = [];
    const tot = { r: 0, d: 0, i: 0 };
    for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = proximoMes(m)) {
      const x = await resumoDoMes(m);
      tot.r += x.receitas; tot.d += x.despesas; tot.i += x.imposto;
      linhas.push([nomeMes(m), r2(x.receitas), r2(x.despesas), r2(x.lucroCaixa), r2(x.imposto), r2(x.lucroEstimado)]);
    }
    linhas.push(["Total", r2(tot.r), r2(tot.d), r2(tot.r - tot.d), r2(tot.i), r2(tot.r - tot.d - tot.i)]);
    return { titulo, periodo: true, colunas: ["Mês", "Receitas", "Despesas", "Lucro (caixa)", "Imposto previsto", "Lucro estimado"], moeda: [1, 2, 3, 4, 5], linhas,
      resumo: [["Receitas", reais(tot.r)], ["Despesas", reais(tot.d)], ["Lucro (caixa)", reais(tot.r - tot.d)], ["Imposto previsto", reais(tot.i)], ["Lucro estimado", reais(tot.r - tot.d - tot.i)]] };
  }

  if (tipo === "fluxo") {
    const l = await prisma.lancamento.findMany({ where: pagoNoPeriodo, orderBy: [{ pagoEm: "asc" }, { criadoEm: "asc" }], include: { categoria: true, conta: true } });
    let saldo = 0, ent = 0, sai = 0;
    const linhas = l.map((x) => {
      const e = x.tipo === RECEITA ? x.valor : 0, s = x.tipo === DESPESA ? x.valor : 0;
      saldo += e - s; ent += e; sai += s;
      return [diaBR(x.pagoEm), x.categoria?.nome ?? "—", x.descricao, x.conta?.nome ?? "—", r2(e), r2(s), r2(saldo)];
    });
    const [aReceber, aPagar] = await Promise.all([
      prisma.lancamento.aggregate({ _sum: { valor: true }, where: { tipo: RECEITA, situacao: SituacaoLancamento.PENDENTE, vencimento: { gte: ini, lte: fim } } }),
      prisma.lancamento.aggregate({ _sum: { valor: true }, where: { tipo: DESPESA, situacao: SituacaoLancamento.PENDENTE, vencimento: { gte: ini, lte: fim } } }),
    ]);
    linhas.push(["", "Total", "", "", r2(ent), r2(sai), r2(saldo)]);
    return { titulo, periodo: true, colunas: ["Data", "Categoria", "Descrição", "Conta", "Entrada", "Saída", "Saldo"], moeda: [4, 5, 6], linhas,
      resumo: [["Entradas", reais(ent)], ["Saídas", reais(sai)], ["Saldo do período", reais(saldo)], ["A receber (pendente)", reais(aReceber._sum.valor ?? 0)], ["A pagar (pendente)", reais(aPagar._sum.valor ?? 0)]] };
  }

  if (tipo === "por-plano") {
    const l = await prisma.lancamento.findMany({ where: { tipo: RECEITA, ...pagoNoPeriodo }, include: { pedido: { select: { planoNome: true } } } });
    const g = new Map<string, { n: number; v: number }>();
    for (const x of l) {
      const k = x.origem === "ESTORNO" ? "Estornos" : x.pedido?.planoNome ?? "Sem plano (lançamento manual)";
      const a = g.get(k) ?? { n: 0, v: 0 };
      a.n += 1; a.v += x.valor; g.set(k, a);
    }
    const total = [...g.values()].reduce((s, a) => s + a.v, 0);
    const linhas: (string | number)[][] = [...g.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, a]) => [k, a.n, r2(a.v), total ? `${((a.v / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"]);
    linhas.push(["Total", l.length, r2(total), "100%"]);
    return { titulo, periodo: true, colunas: ["Plano", "Lançamentos", "Faturamento", "Participação"], moeda: [2], linhas, resumo: [["Faturamento recebido", reais(total)]] };
  }

  if (tipo === "por-tipo") {
    const l = await prisma.lancamento.findMany({ where: pagoNoPeriodo, include: { categoria: true } });
    const g = new Map<string, { tipo: string; cat: string; n: number; v: number }>();
    for (const x of l) {
      const k = `${x.tipo}|${x.categoria?.nome ?? "Sem categoria"}`;
      const a = g.get(k) ?? { tipo: x.tipo === RECEITA ? "Receita" : "Despesa", cat: x.categoria?.nome ?? "Sem categoria", n: 0, v: 0 };
      a.n += 1; a.v += x.valor; g.set(k, a);
    }
    const lista = [...g.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) * -1 || b.v - a.v);
    const rec = lista.filter((a) => a.tipo === "Receita").reduce((s, a) => s + a.v, 0);
    const des = lista.filter((a) => a.tipo === "Despesa").reduce((s, a) => s + a.v, 0);
    return { titulo, periodo: true, colunas: ["Tipo", "Categoria", "Lançamentos", "Valor"], moeda: [3],
      linhas: [...lista.map((a) => [a.tipo, a.cat, a.n, r2(a.v)]), ["", "Total de receitas", "", r2(rec)], ["", "Total de despesas", "", r2(des)]],
      resumo: [["Receitas", reais(rec)], ["Despesas", reais(des)], ["Resultado", reais(rec - des)]] };
  }

  if (tipo === "recorrente") {
    const r = await receitaRecorrente();
    const linhas: (string | number)[][] = r.linhas.sort((a, b) => b.mensal - a.mensal).map((c) => [`${c.codigo ? `${c.codigo} • ` : ""}${c.nome}`, tipoConta(c.modulo), c.planoNome, diaBR(c.expiraEm), r2(c.mensal)]);
    linhas.push(["Total", "", "", "", r2(r.mrr)]);
    return { titulo, periodo: false, colunas: ["Conta", "Tipo", "Plano", "Vence em", "Valor mensal"], moeda: [4], linhas,
      resumo: [["Receita recorrente mensal", reais(r.mrr)], ["Clientes ativos", String(r.ativos)], ["Pagantes", String(r.pagantes)], ["Ticket médio (mensal)", reais(r.ticket)]] };
  }

  if (tipo === "cancelamentos") {
    const agora = new Date();
    const es = await prisma.empresa.findMany({
      where: { expiraEm: { gte: ini, lte: fim < agora ? fim : agora } },
      orderBy: { expiraEm: "asc" },
      select: { nome: true, codigo: true, modulo: true, pacote: true, expiraEm: true, pedidos: { where: { status: StatusPedido.PAGO }, orderBy: { confirmadoEm: "desc" }, take: 1, select: { valor: true } } },
    });
    const ativos = await prisma.empresa.count({ where: { ativa: true, expiraEm: { gt: agora } } });
    const pagantes = es.filter((e) => e.pedidos.length);
    const perda = pagantes.reduce((s, e) => s + (e.pedidos[0]?.valor ?? 0), 0);
    return { titulo, periodo: true, colunas: ["Conta", "Tipo", "Pacote", "Venceu em", "Último valor pago"], moeda: [4],
      linhas: es.map((e) => [`${e.codigo ? `${e.codigo} • ` : ""}${e.nome}`, tipoConta(e.modulo), e.pacote, diaBR(e.expiraEm), r2(e.pedidos[0]?.valor ?? 0)]),
      resumo: [["Não renovaram", String(es.length)], ["Desses, pagantes", String(pagantes.length)], ["Receita perdida (último valor)", reais(perda)], ["Taxa de cancelamento", ativos + es.length ? `${((es.length / (ativos + es.length)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"]] };
  }

  // renovacoes: contas ativas que vencem nos próximos 90 dias
  const r = await receitaRecorrente();
  const hoje = Date.now();
  const prox = r.linhas.map((c) => ({ ...c, dias: Math.ceil((c.expiraEm.getTime() - hoje) / 86400_000) })).filter((c) => c.dias <= 90).sort((a, b) => a.dias - b.dias);
  const faixa = (d: number) => (d <= 30 ? "Até 30 dias" : d <= 60 ? "31 a 60 dias" : "61 a 90 dias");
  const soma = (f: string) => prox.filter((c) => faixa(c.dias) === f).reduce((s, c) => s + c.valorRenovacao, 0);
  return { titulo, periodo: false, colunas: ["Conta", "Tipo", "Plano", "Vence em", "Faixa", "Valor previsto"], moeda: [5],
    linhas: [...prox.map((c) => [`${c.codigo ? `${c.codigo} • ` : ""}${c.nome}`, tipoConta(c.modulo), c.planoNome, diaBR(c.expiraEm), faixa(c.dias), r2(c.valorRenovacao)]), ["Total", "", "", "", "", r2(prox.reduce((s, c) => s + c.valorRenovacao, 0))]],
    resumo: [["Até 30 dias", reais(soma("Até 30 dias"))], ["31 a 60 dias", reais(soma("31 a 60 dias"))], ["61 a 90 dias", reais(soma("61 a 90 dias"))], ["Contas", String(prox.length)]] };
}

export { inicioDoMes };
