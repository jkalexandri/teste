// Gestão financeira do Super Admin (decisão #106): categorias, entradas automáticas (pedidos, despesas fixas, IA),
// resumo do mês, indicadores e avisos de contas vencendo. Valores em centavos.
import "server-only";
import { prisma, Cargo, Modulo, StatusPedido, TipoLancamento, SituacaoLancamento, type Prisma } from "@filapro/db";

export const RECEITA = TipoLancamento.RECEITA;
export const DESPESA = TipoLancamento.DESPESA;

/** Categorias prontas (decisão #106, item 2). */
export const CATEGORIAS_PADRAO: { tipo: TipoLancamento; nome: string; ordem: number }[] = [
  { tipo: RECEITA, nome: "Vendas (novos clientes)", ordem: 1 },
  { tipo: RECEITA, nome: "Renovações", ordem: 2 },
  { tipo: RECEITA, nome: "WhatsApp extra", ordem: 3 },
  { tipo: RECEITA, nome: "Pacotes de disparos", ordem: 4 },
  { tipo: RECEITA, nome: "Outras receitas", ordem: 5 },
  { tipo: RECEITA, nome: "Estornos", ordem: 6 },
  ...["Servidor (VPS)", "Domínio", "E-mail", "Chips de WhatsApp", "IA", "Marketing e anúncios", "Impostos", "Taxas bancárias", "Comissões", "Salários e pró-labore", "Outras despesas"]
    .map((nome, i) => ({ tipo: DESPESA, nome, ordem: i + 1 })),
];
export const CAT = { venda: "Vendas (novos clientes)", renovacao: "Renovações", whatsapp: "WhatsApp extra", disparos: "Pacotes de disparos", estorno: "Estornos", ia: "IA" };

// ===================== Datas (horário de Brasília, sem horário de verão) =====================
export const mesAtual = (d = new Date()) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
export const inicioDoMes = (mes: string) => new Date(`${mes}-01T00:00:00-03:00`);
export function proximoMes(mes: string, n = 1) {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const fimDoMes = (mes: string) => inicioDoMes(proximoMes(mes));
export const diaBR = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
export const nomeMes = (mes: string) => inicioDoMes(mes).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });
export const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** "1.234,56" ou "1234.56" → centavos */
export function lerValor(v: string) {
  const t = v.replace(/[R$\s]/g, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
/** "2026-11-30" → data às 12h de Brasília (não muda de dia com o fuso) */
export const dataDoCampo = (s: string) => new Date(`${s}T12:00:00-03:00`);

// ===================== Entradas automáticas =====================

export async function garantirCategorias() {
  const n = await prisma.categoriaFinanceira.count({ where: { padrao: true } });
  if (n >= CATEGORIAS_PADRAO.length) return;
  for (const c of CATEGORIAS_PADRAO) {
    await prisma.categoriaFinanceira.upsert({ where: { tipo_nome: { tipo: c.tipo, nome: c.nome } }, create: { ...c, padrao: true }, update: { padrao: true } });
  }
}

async function categoriaId(tipo: TipoLancamento, nome: string) {
  return (await prisma.categoriaFinanceira.findUnique({ where: { tipo_nome: { tipo, nome } } }))?.id ?? null;
}

/** Tipo da receita de um pedido (item 1): venda, renovação, WhatsApp extra ou pacote de disparos. */
export function categoriaDoPedido(p: { renovacao: boolean; somenteExtras: boolean; whatsappsExtras: number; pacotesDisparos: number }) {
  if (p.somenteExtras && p.pacotesDisparos > 0 && p.whatsappsExtras === 0) return CAT.disparos;
  if (p.somenteExtras) return CAT.whatsapp;
  return p.renovacao ? CAT.renovacao : CAT.venda;
}

/** Cria o que é automático e ainda não existe (pode rodar várias vezes): receitas dos pedidos pagos (inclui os antigos),
 *  despesas fixas do mês e a despesa com IA do mês anterior. */
export async function sincronizarFinanceiro(agora = new Date()) {
  await garantirCategorias();
  // 1. Pedidos pagos → receita paga
  const pedidos = await prisma.pedido.findMany({ where: { status: StatusPedido.PAGO, lancamentos: { none: { origem: "PEDIDO" } } }, take: 2000 });
  for (const p of pedidos) {
    const cat = categoriaDoPedido(p);
    await prisma.lancamento.create({
      data: {
        tipo: RECEITA, categoriaId: await categoriaId(RECEITA, cat), valor: p.valor, origem: "PEDIDO", chaveAuto: `pedido:${p.id}`, pedidoId: p.id,
        descricao: `${cat === CAT.venda ? "Venda" : cat} — ${p.planoNome} — ${p.empresaNome || p.nome} (pedido ${p.codigo})`,
        vencimento: p.confirmadoEm ?? p.criadoEm, pagoEm: p.confirmadoEm ?? p.criadoEm, situacao: SituacaoLancamento.PAGO, criadoPor: p.confirmadoPor,
      },
    }).catch(() => undefined); // já criado em paralelo
  }
  // 2. Despesas fixas do mês
  const mes = mesAtual(agora);
  const fixas = await prisma.despesaFixa.findMany({ where: { ativa: true } });
  for (const f of fixas) {
    const chave = `fixa:${f.id}:${mes}`;
    if (await prisma.lancamento.findUnique({ where: { chaveAuto: chave } })) continue;
    const ultimoDia = new Date(fimDoMes(mes).getTime() - 86400_000).getUTCDate();
    const dia = String(Math.min(f.diaVencimento, ultimoDia)).padStart(2, "0");
    await prisma.lancamento.create({
      data: { tipo: DESPESA, categoriaId: f.categoriaId, contaId: f.contaId, valor: f.valor, descricao: f.descricao, origem: "FIXA", chaveAuto: chave, despesaFixaId: f.id, vencimento: dataDoCampo(`${mes}-${dia}`) },
    }).catch(() => undefined);
  }
  // 3. IA do mês anterior (dólar × cotação), lançada como paga no dia 1
  const anterior = proximoMes(mes, -1);
  const chaveIA = `ia:${anterior}`;
  let semCotacao = false;
  if (!(await prisma.lancamento.findUnique({ where: { chaveAuto: chaveIA } }))) {
    const uso = await prisma.usoIA.aggregate({ _sum: { custoUsd: true }, where: { criadoEm: { gte: inicioDoMes(anterior), lt: fimDoMes(anterior) } } });
    const usd = uso._sum.custoUsd ?? 0;
    const cot = (await prisma.configVenda.findUnique({ where: { id: "config" } }))?.cotacaoDolar ?? null;
    if (usd > 0 && !cot) semCotacao = true;
    else if (usd > 0 && cot) {
      await prisma.lancamento.create({
        data: {
          tipo: DESPESA, categoriaId: await categoriaId(DESPESA, CAT.ia), valor: Math.round(usd * cot * 100), origem: "IA", chaveAuto: chaveIA,
          descricao: `IA — ${nomeMes(anterior)} (US$ ${usd.toFixed(2)} × R$ ${cot.toFixed(2)})`, vencimento: inicioDoMes(mes), pagoEm: inicioDoMes(mes), situacao: SituacaoLancamento.PAGO,
        },
      }).catch(() => undefined);
    }
  }
  return { semCotacao };
}

// ===================== Resumo e indicadores =====================

const somar = async (where: Prisma.LancamentoWhereInput) => (await prisma.lancamento.aggregate({ _sum: { valor: true }, where }))._sum.valor ?? 0;

/** Resultado do mês (regime de caixa — pelo dia do pagamento). Imposto previsto sobre o faturamento recebido (item 7). */
export async function resumoDoMes(mes: string) {
  const periodo = { gte: inicioDoMes(mes), lt: fimDoMes(mes) };
  const [receitas, despesas, aReceber, aPagar, cfg] = await Promise.all([
    somar({ tipo: RECEITA, situacao: SituacaoLancamento.PAGO, pagoEm: periodo }),
    somar({ tipo: DESPESA, situacao: SituacaoLancamento.PAGO, pagoEm: periodo }),
    somar({ tipo: RECEITA, situacao: SituacaoLancamento.PENDENTE, vencimento: periodo }),
    somar({ tipo: DESPESA, situacao: SituacaoLancamento.PENDENTE, vencimento: periodo }),
    prisma.configVenda.findUnique({ where: { id: "config" } }),
  ]);
  const aliquota = cfg?.aliquotaImposto ?? 0;
  const imposto = Math.round(Math.max(0, receitas) * aliquota / 100);
  return { mes, receitas, despesas, imposto, aliquota, lucroCaixa: receitas - despesas, lucroEstimado: receitas - despesas - imposto, aReceber, aPagar };
}

/** Contas pendentes: vencidas e as que vencem nos próximos dias. */
export async function contasVencendo(dias = 7) {
  const hoje0 = dataDoCampo(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10));
  hoje0.setUTCHours(3, 0, 0, 0); // 00:00 em Brasília
  const ate = new Date(hoje0.getTime() + (dias + 1) * 86400_000);
  const l = await prisma.lancamento.findMany({ where: { situacao: SituacaoLancamento.PENDENTE, vencimento: { lt: ate } }, orderBy: { vencimento: "asc" }, include: { categoria: true } });
  return { vencidas: l.filter((x) => x.vencimento < hoje0), proximas: l.filter((x) => x.vencimento >= hoje0) };
}

/** Valor mensal de cada conta ativa (último pedido pago ÷ prazo × 30; sem pedido: preço do plano). */
export async function receitaRecorrente() {
  const contas = await prisma.empresa.findMany({
    where: { ativa: true, expiraEm: { gt: new Date() } },
    select: { id: true, nome: true, codigo: true, modulo: true, expiraEm: true, planoId: true,
      pedidos: { where: { status: StatusPedido.PAGO, somenteExtras: false }, orderBy: { confirmadoEm: "desc" }, take: 1, select: { valor: true, prazoDias: true, planoNome: true } } },
  });
  const planos = new Map((await prisma.plano.findMany({ select: { id: true, nome: true, precoAtual: true, prazoDias: true, gratis: true } })).map((p) => [p.id, p]));
  const linhas = contas.map((c) => {
    const p = c.pedidos[0];
    const plano = c.planoId ? planos.get(c.planoId) : undefined;
    const mensal = p ? Math.round((p.valor * 30) / Math.max(1, p.prazoDias)) : plano && !plano.gratis && plano.precoAtual ? Math.round((plano.precoAtual * 30) / Math.max(1, plano.prazoDias)) : 0;
    return { ...c, mensal, planoNome: p?.planoNome ?? plano?.nome ?? "—", valorRenovacao: p?.valor ?? (plano && !plano.gratis ? plano.precoAtual ?? 0 : 0) };
  });
  const pagantes = linhas.filter((l) => l.mensal > 0);
  const mrr = pagantes.reduce((s, l) => s + l.mensal, 0);
  return { linhas, mrr, ativos: linhas.length, pagantes: pagantes.length, ticket: pagantes.length ? Math.round(mrr / pagantes.length) : 0 };
}

/** Avisa o Super Admin (WhatsApp de avisos e celular) das contas vencidas e das que vencem em até 3 dias — 1 vez por dia. */
export async function avisarContasVencendo(enviar: (texto: string) => Promise<void>) {
  const cfg = await prisma.configVenda.findUnique({ where: { id: "config" } });
  const diaSP = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  if (cfg?.avisoFinanceiroEm && diaSP(cfg.avisoFinanceiroEm) === diaSP(new Date())) return 0;
  const { vencidas, proximas } = await contasVencendo(3);
  if (!vencidas.length && !proximas.length) return 0;
  const linha = (x: (typeof vencidas)[number]) => `• ${diaBR(x.vencimento)} — ${x.tipo === RECEITA ? "receber" : "pagar"} ${reais(x.valor)} — ${x.descricao}`;
  const texto = ["💰 FilaPro Leads — contas a pagar/receber", vencidas.length ? `Vencidas (${vencidas.length}):\n${vencidas.slice(0, 8).map(linha).join("\n")}` : "", proximas.length ? `Vencem em até 3 dias (${proximas.length}):\n${proximas.slice(0, 8).map(linha).join("\n")}` : "", "Veja em Financeiro → Contas a pagar e receber."].filter(Boolean).join("\n\n");
  await enviar(texto);
  await prisma.configVenda.upsert({ where: { id: "config" }, create: { id: "config", avisoFinanceiroEm: new Date() }, update: { avisoFinanceiroEm: new Date() } });
  return vencidas.length + proximas.length;
}

export const ehSuperAdmin = (c: Cargo) => c === Cargo.SUPERADMIN;
export { Modulo };
