// Processamento dos avisos (webhooks) do Asaas — decisões #115 e #117 (etapa C: confirmação automática).
// O aviso é guardado primeiro (tabela AvisoAsaas) e processado logo depois de responder ao Asaas.
// Tudo aqui pode rodar mais de uma vez para o mesmo aviso sem repetir nada (idempotente).
import "server-only";
import { prisma, StatusPedido, SituacaoLancamento, Prisma } from "@filapro/db";
import { encerrarAcessoDaEmpresa } from "@/lib/auth/encerrar-acesso";
import { confirmarPedido } from "@/lib/confirmar-pedido";
import { sincronizarFinanceiro, garantirCategorias, RECEITA, DESPESA, CAT, reais } from "@/lib/financeiro";
import { avisarSuperAdmins } from "@/lib/alertas-seguranca";
import { registrarLog } from "@/lib/logs";
import { pedidoDoPeriodo } from "@/lib/assinatura";

/** Cobrança como o Asaas manda no aviso (só os campos que o FilaPro usa). Valores em reais. */
type CobrancaAviso = {
  id?: string; value?: number; netValue?: number; externalReference?: string | null; billingType?: string; installment?: string | null;
  /** Cobrança gerada por uma assinatura (cobrança automática no cartão — decisão #124) e o vencimento dela */
  subscription?: string | null; dueDate?: string;
};
export type CorpoAviso = { id?: string; event?: string; payment?: CobrancaAviso };

/** Pagamento aprovado: PIX e boleto avisam quando o dinheiro cai; cartão avisa quando a compra é aprovada (decisão #117, item 1). */
const PAGO = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"];
/** Depois de 5 tentativas com erro, o aviso para de ser reprocessado (o Super Admin confere em Pedidos). */
const MAX_TENTATIVAS = 5;

const centavos = (v: number | undefined) => Math.round((v ?? 0) * 100);
const FORMA: Record<string, string> = { PIX: "PIX", BOLETO: "boleto", CREDIT_CARD: "cartão" };

/** Guarda o aviso recebido. O mesmo evento (mesmo id do Asaas) não é guardado duas vezes. Devolve o id do aviso, ou null se repetido. */
export async function guardarAviso(corpo: CorpoAviso): Promise<string | null> {
  const p = corpo.payment ?? {};
  const evento = String(corpo.event ?? "sem evento").slice(0, 60);
  // Sem id do evento (não deveria acontecer): usa evento + cobrança, que também não repete
  const eventoId = String(corpo.id || `${evento}:${p.id ?? Date.now()}`).slice(0, 120);
  try {
    const a = await prisma.avisoAsaas.create({
      data: { eventoId, evento, cobrancaId: p.id ?? null, referencia: p.externalReference ?? null, dados: corpo as Prisma.InputJsonValue },
    });
    return a.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // aviso repetido
    throw e;
  }
}

/** Processa um aviso guardado. Grava o resultado (ou o erro, para tentar de novo depois). */
export async function processarAviso(id: string) {
  const aviso = await prisma.avisoAsaas.findUnique({ where: { id } });
  if (!aviso || aviso.processadoEm) return;
  try {
    const resultado = await tratar(aviso.evento, (aviso.dados ?? {}) as CorpoAviso);
    await prisma.avisoAsaas.update({ where: { id }, data: { processadoEm: new Date(), resultado: resultado.slice(0, 500), erro: null, tentativas: { increment: 1 } } });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    const a = await prisma.avisoAsaas.update({ where: { id }, data: { erro: erro.slice(0, 500), tentativas: { increment: 1 } } });
    console.error(`[asaas] erro ao processar o aviso ${aviso.evento} (${aviso.cobrancaId}): ${erro}`);
    if (a.tentativas >= MAX_TENTATIVAS) {
      await avisarSuperAdmins(`⚠️ Asaas: não consegui processar o aviso ${aviso.evento} do pedido ${aviso.referencia ?? "?"} depois de ${a.tentativas} tentativas (${erro}). Confira em Pedidos.`, "/pedidos");
    }
  }
}

/** Reprocessa os avisos que ficaram pela metade (erro ou site reiniciado). Roda na rotina diária e a cada aviso novo. */
export async function reprocessarPendentes() {
  const pendentes = await prisma.avisoAsaas.findMany({
    where: { processadoEm: null, tentativas: { lt: MAX_TENTATIVAS }, recebidoEm: { lt: new Date(Date.now() - 60_000) } },
    orderBy: { recebidoEm: "asc" },
    take: 50,
    select: { id: true },
  });
  for (const p of pendentes) await processarAviso(p.id);
  return pendentes.length;
}

/** Decide o que fazer com cada evento. Devolve o texto do resultado. */
async function tratar(evento: string, corpo: CorpoAviso): Promise<string> {
  const cobranca = corpo.payment ?? {};
  // Cobrança de assinatura (decisão #124): o pedido é achado pela cobrança, não pelo código (o código é o do 1º pedido)
  const pedido = cobranca.subscription ? await pedidoDaAssinatura(evento, cobranca) : cobranca.externalReference ? await prisma.pedido.findUnique({ where: { codigo: cobranca.externalReference } }) : null;
  const codigo = pedido?.codigo ?? cobranca.externalReference ?? "";

  if (evento === "PAYMENT_CREATED" && cobranca.subscription) {
    // Novo período da cobrança automática: o pedido de renovação fica aguardando o cartão ser cobrado
    return pedido ? `Pedido ${pedido.codigo} da cobrança automática (${pedido.status === StatusPedido.PAGO ? "já pago" : "aguardando a cobrança"}).` : "Ignorado: assinatura sem conta no FilaPro.";
  }
  if (PAGO.includes(evento)) {
    if (!pedido) return `Ignorado: nenhum pedido com o código "${codigo}".`;
    return pagamentoAprovado(pedido, cobranca);
  }
  if (evento === "PAYMENT_REFUNDED") {
    if (!pedido) return `Ignorado: estorno sem pedido com o código "${codigo}".`;
    return estorno(pedido, cobranca);
  }
  if (evento === "PAYMENT_CHARGEBACK_REQUESTED") {
    // Contestação no cartão (decisão #117, item 6): só avisa; bloqueia apenas se o estorno vier
    await avisarSuperAdmins(`⚠️ Asaas: o cliente contestou no cartão a cobrança do pedido ${codigo || "?"}${pedido ? ` (${pedido.empresaNome || pedido.nome})` : ""}, de ${reais(centavos(cobranca.value))}. A conta só será bloqueada se o estorno acontecer.`, "/pedidos");
    await registrarLog(null, "PAGAMENTOS", `Contestação no cartão do pedido ${codigo || "?"} (${reais(centavos(cobranca.value))}).`, null);
    return "Contestação: Super Admin avisado.";
  }
  return "Ignorado: evento sem ação no FilaPro.";
}

type PedidoBD = NonNullable<Awaited<ReturnType<typeof prisma.pedido.findUnique>>>;

/**
 * Pedido de uma cobrança da assinatura (decisão #124):
 * 1) a cobrança já tem pedido; 2) é a 1ª cobrança do pedido que criou a assinatura (aviso chegou antes de gravar o código);
 * 3) é um novo período de uma conta com cobrança automática: cria o pedido de renovação.
 */
async function pedidoDaAssinatura(evento: string, cobranca: CobrancaAviso): Promise<PedidoBD | null> {
  if (!cobranca.id || !cobranca.subscription) return null;
  const ja = await prisma.pedido.findUnique({ where: { asaasId: cobranca.id } });
  if (ja) return ja;
  const primeiro = await prisma.pedido.findFirst({ where: { asaasAssinaturaId: cobranca.subscription, asaasId: null, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } } });
  if (primeiro) return prisma.pedido.update({ where: { id: primeiro.id }, data: { asaasId: cobranca.id } }).catch(() => prisma.pedido.findUnique({ where: { asaasId: cobranca.id } }));
  if (evento !== "PAYMENT_CREATED" && !PAGO.includes(evento)) return null;
  const conta = await prisma.empresa.findUnique({ where: { asaasAssinaturaId: cobranca.subscription } });
  if (!conta) return null;
  return pedidoDoPeriodo(conta, { id: cobranca.id, value: cobranca.value, dueDate: cobranca.dueDate });
}

/** PAYMENT_CONFIRMED / PAYMENT_RECEIVED: confirma o pedido (como o botão de Pedidos) e lança a taxa do Asaas. */
async function pagamentoAprovado(pedido: PedidoBD, cobranca: CobrancaAviso): Promise<string> {
  // Pedido cancelado que foi pago depois (decisão #117, item 4): não confirma, só avisa
  if (pedido.status === StatusPedido.CANCELADO) {
    await avisarSuperAdmins(`⚠️ Asaas: chegou o pagamento de ${reais(centavos(cobranca.value))} do pedido ${pedido.codigo} (${pedido.empresaNome || pedido.nome}, ${pedido.email}), que estava CANCELADO. O pedido não foi confirmado: decida em Pedidos o que fazer.`, "/pedidos");
    await registrarLog(null, "PAGAMENTOS", `Pagamento do pedido cancelado ${pedido.codigo} (${pedido.email}) — não confirmado, Super Admin avisado.`, null);
    return "Pedido cancelado: não confirmado, Super Admin avisado.";
  }

  // Cobrança automática (decisão #124): o pedido fica com o valor que o cartão pagou de fato
  if (pedido.automatica && pedido.status !== StatusPedido.PAGO && cobranca.value && centavos(cobranca.value) !== pedido.valor) {
    pedido = await prisma.pedido.update({ where: { id: pedido.id }, data: { valor: centavos(cobranca.value) } });
  }

  let resultado: string;
  if (pedido.status === StatusPedido.PAGO) {
    // Outra parcela do cartão, ou o "recebido" depois do "confirmado": o pedido já foi confirmado
    resultado = "Pedido já confirmado.";
  } else {
    // Avisos quase juntos (ex.: as parcelas do cartão) podem confirmar ao mesmo tempo: a proteção contra confirmação
    // dupla recusa o segundo com erro — se o pedido já está PAGO, é só "já confirmado"
    const r = await confirmarPedido(pedido.id, "Asaas").catch(async (e) => {
      const atual = await prisma.pedido.findUnique({ where: { id: pedido.id }, select: { status: true } });
      if (atual?.status === StatusPedido.PAGO) return { ok: false, mensagem: "Este pedido já foi confirmado." };
      throw e;
    });
    if (!r.ok) {
      // Ex.: o e-mail já tem acesso — o Super Admin precisa olhar (o pagamento existe)
      const atual = await prisma.pedido.findUnique({ where: { id: pedido.id }, select: { status: true } });
      if (atual?.status !== StatusPedido.PAGO) {
        await avisarSuperAdmins(`⚠️ Asaas: o pedido ${pedido.codigo} (${pedido.email}) foi pago, mas não pôde ser confirmado sozinho: ${r.mensagem}`, "/pedidos");
        await registrarLog(null, "PAGAMENTOS", `Pedido ${pedido.codigo} pago no Asaas, mas não confirmado: ${r.mensagem}`, null);
        return `Não confirmado: ${r.mensagem}`;
      }
      resultado = "Pedido já confirmado.";
    } else {
      resultado = `Pedido confirmado: ${r.mensagem}`;
      await registrarLog(null, "PAGAMENTOS", `Pedido ${pedido.codigo} confirmado pelo Asaas (${FORMA[cobranca.billingType ?? ""] ?? cobranca.billingType ?? "?"}, ${reais(centavos(cobranca.value))}).`, null);
      await sincronizarFinanceiro().catch(() => undefined); // receita do pedido já entra no Financeiro
    }
  }
  const taxa = await lancarTaxa(pedido, cobranca);
  return taxa ? `${resultado} Taxa do Asaas: ${reais(taxa)}.` : resultado;
}

/** Taxa do Asaas (valor cobrado − valor líquido) como despesa paga, uma por cobrança (decisão #117, item 3). */
async function lancarTaxa(pedido: PedidoBD, cobranca: CobrancaAviso): Promise<number> {
  if (!cobranca.id || cobranca.netValue == null || cobranca.value == null) return 0;
  const taxa = centavos(cobranca.value) - centavos(cobranca.netValue);
  if (taxa <= 0) return 0;
  await garantirCategorias();
  const cat = await prisma.categoriaFinanceira.findUnique({ where: { tipo_nome: { tipo: DESPESA, nome: CAT.taxaAsaas } } });
  const agora = new Date();
  try {
    await prisma.lancamento.create({
      data: {
        tipo: DESPESA, categoriaId: cat?.id ?? null, valor: taxa, origem: "ASAAS", chaveAuto: `asaas-taxa:${cobranca.id}`, pedidoId: pedido.id,
        descricao: `Taxa do Asaas — pedido ${pedido.codigo} (${FORMA[cobranca.billingType ?? ""] ?? cobranca.billingType ?? "?"}${cobranca.installment ? ", parcela" : ""})`,
        vencimento: agora, pagoEm: agora, situacao: SituacaoLancamento.PAGO, criadoPor: "Asaas",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return 0; // já lançada (aviso "confirmado" e depois "recebido")
    throw e;
  }
  return taxa;
}

/** PAYMENT_REFUNDED: estorno no Financeiro, empresa inativada e Super Admin avisado (decisão #117, itens 2, 5 e 7). */
async function estorno(pedido: PedidoBD, cobranca: CobrancaAviso): Promise<string> {
  const valorCobranca = centavos(cobranca.value);
  if (pedido.status !== StatusPedido.PAGO) {
    await avisarSuperAdmins(`⚠️ Asaas: estorno de ${reais(valorCobranca)} no pedido ${pedido.codigo} (${pedido.email}), que não estava confirmado no FilaPro. Confira em Pedidos.`, "/pedidos");
    return "Estorno de pedido não confirmado: Super Admin avisado.";
  }
  // 1. Financeiro: receita negativa ligada à receita do pedido (no máximo o que ainda não foi devolvido)
  await sincronizarFinanceiro().catch(() => undefined);
  const receita = await prisma.lancamento.findFirst({ where: { pedidoId: pedido.id, origem: "PEDIDO", tipo: RECEITA } });
  let estornado = 0;
  if (receita && cobranca.id) {
    const ja = (await prisma.lancamento.aggregate({ _sum: { valor: true }, where: { estornoDeId: receita.id, situacao: { not: SituacaoLancamento.CANCELADO } } }))._sum.valor ?? 0;
    const valor = Math.min(valorCobranca || receita.valor, receita.valor + ja);
    if (valor > 0) {
      const cat = await prisma.categoriaFinanceira.findUnique({ where: { tipo_nome: { tipo: RECEITA, nome: CAT.estorno } } });
      try {
        await prisma.lancamento.create({
          data: {
            tipo: RECEITA, categoriaId: cat?.id ?? null, valor: -valor, origem: "ESTORNO", chaveAuto: `asaas-estorno:${cobranca.id}`, estornoDeId: receita.id, pedidoId: pedido.id,
            descricao: `Estorno — ${receita.descricao} (estorno no Asaas)`, vencimento: new Date(), pagoEm: new Date(), situacao: SituacaoLancamento.PAGO, criadoPor: "Asaas",
          },
        });
        estornado = valor;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e; // já lançado
      }
    }
  }
  // 2. Empresa inativada (vale para qualquer pedido: plano, renovação, WhatsApp extra ou pacote de disparos)
  let empresaNome = pedido.empresaNome || pedido.nome;
  let inativou = false;
  if (pedido.empresaId) {
    const r = await prisma.empresa.updateMany({ where: { id: pedido.empresaId, ativa: true }, data: { ativa: false } });
    inativou = r.count > 0;
    if (inativou) await encerrarAcessoDaEmpresa(pedido.empresaId); // estorno: derruba sessões e notificações (decisão #158)
    empresaNome = (await prisma.empresa.findUnique({ where: { id: pedido.empresaId }, select: { nome: true } }))?.nome ?? empresaNome;
  }
  // 3. Aviso e registro
  await avisarSuperAdmins(`⚠️ Asaas: estorno de ${reais(valorCobranca)} no pedido ${pedido.codigo} (${empresaNome}, ${pedido.email}). ${inativou ? "A empresa foi inativada." : "A empresa já estava inativa."} Para liberar de novo, use Empresas.`, "/empresas");
  await registrarLog(null, "PAGAMENTOS", `Estorno no Asaas do pedido ${pedido.codigo} (${reais(valorCobranca)}): ${inativou ? "empresa inativada" : "empresa já inativa"}.`, null);
  return `Estorno lançado (${reais(estornado)}); ${inativou ? "empresa inativada" : "empresa já estava inativa"}; Super Admin avisado.`;
}
