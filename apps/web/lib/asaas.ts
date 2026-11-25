// Integração com o Asaas (decisão #115): cartão, PIX com confirmação automática e boleto.
// A chave de API fica criptografada no banco (ConfigVenda.asaasChave) e nunca volta para a tela.
// Os dados do cartão não passam pelo FilaPro: o cliente paga na página de pagamento do Asaas.
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@filapro/db";
import { criptografar, descriptografar } from "@filapro/ia";

export type AmbienteAsaas = "sandbox" | "producao";

/** Endereços da API do Asaas. ASAAS_URL troca o endereço (usado nos testes com um Asaas de mentira). */
export function urlAsaas(ambiente: AmbienteAsaas) {
  if (process.env.ASAAS_URL) return process.env.ASAAS_URL.replace(/\/$/, "");
  return ambiente === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

/** A chave do Asaas mostra o ambiente: "$aact_prod_…" (produção) ou "$aact_hmlg_…" (testes). */
export function ambienteDaChave(chave: string): AmbienteAsaas | null {
  if (chave.startsWith("$aact_prod_")) return "producao";
  if (chave.startsWith("$aact_hmlg_")) return "sandbox";
  return null;
}

export class ErroAsaas extends Error {
  constructor(mensagem: string, public status = 0) { super(mensagem); }
}

/** Chamada à API do Asaas com a chave informada (ou a salva), com limite de tempo. */
export async function chamarAsaas<T = unknown>(
  caminho: string,
  opcoes: { metodo?: "GET" | "POST" | "PUT" | "DELETE"; corpo?: unknown; chave?: string; ambiente?: AmbienteAsaas } = {},
): Promise<T> {
  let { chave, ambiente } = opcoes;
  if (!chave || !ambiente) {
    const c = await prisma.configVenda.findUnique({ where: { id: "config" } });
    if (!c?.asaasChave) throw new ErroAsaas("O Asaas não está configurado.");
    chave = chave ?? descriptografar(c.asaasChave);
    ambiente = ambiente ?? (c.asaasAmbiente as AmbienteAsaas);
  }
  let r: Response;
  try {
    r = await fetch(urlAsaas(ambiente) + caminho, {
      method: opcoes.metodo ?? "GET",
      headers: { access_token: chave, "Content-Type": "application/json", "User-Agent": "FilaPro Leads" },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErroAsaas("Não foi possível falar com o Asaas agora. Tente de novo em instantes.");
  }
  const dados = (await r.json().catch(() => ({}))) as { errors?: { description?: string }[] } & T;
  if (r.status === 401) throw new ErroAsaas("Chave de API recusada pelo Asaas. Confira a chave e o ambiente (Testes ou Produção).", 401);
  if (!r.ok) throw new ErroAsaas(dados.errors?.[0]?.description || `O Asaas respondeu com erro (${r.status}).`, r.status);
  return dados;
}

/** Testa a chave: lê os dados comerciais da conta e devolve o nome dela. */
export async function testarConexao(chave: string, ambiente: AmbienteAsaas) {
  const d = await chamarAsaas<{ companyName?: string; name?: string; email?: string }>("/myAccount/commercialInfo", { chave, ambiente });
  return d.companyName || d.name || d.email || "Conta Asaas";
}

/** Token que o Asaas manda em cada aviso (webhook): gerado uma vez e guardado criptografado. */
export async function tokenWebhook() {
  const c = await prisma.configVenda.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  if (c.asaasTokenWebhook) return descriptografar(c.asaasTokenWebhook);
  const novo = "fp_" + randomBytes(24).toString("base64url");
  await prisma.configVenda.update({ where: { id: "config" }, data: { asaasTokenWebhook: criptografar(novo) } });
  return novo;
}

/** Endereço do aviso (webhook) que o Super Admin cadastra no Asaas. */
export function urlWebhook() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br").replace(/\/$/, "");
  return `${site}/api/asaas/webhook`;
}

// ===== Cadastro automático do aviso (webhook) pela API do Asaas =====
// Evita o passo manual no painel do Asaas: com a chave conectada, o FilaPro cria (ou corrige) o webhook dele.

/** Eventos de cobrança que o FilaPro usa (criada, confirmada, recebida, vencida, apagada, estornada…). */
export const EVENTOS_WEBHOOK = [
  "PAYMENT_CREATED", "PAYMENT_UPDATED", "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE",
  "PAYMENT_DELETED", "PAYMENT_RESTORED", "PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED", "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
];

type WebhookAsaas = { id: string; name?: string; url: string; enabled?: boolean; interrupted?: boolean; penalizedRequestsCount?: number; events?: string[] };

/** Situação do webhook do FilaPro no Asaas (ou null se não existe). */
export async function webhookNoAsaas(): Promise<WebhookAsaas | null> {
  const lista = await chamarAsaas<{ data?: WebhookAsaas[] }>("/webhooks?limit=100");
  return (lista.data ?? []).find((w) => w.url.replace(/\/$/, "") === urlWebhook()) ?? null;
}

/** Cria o webhook do FilaPro no Asaas, ou atualiza o que já existe (token, eventos, ativado e fila liberada). */
export async function configurarWebhookNoAsaas(email: string) {
  const corpo = {
    name: "FilaPro Leads",
    url: urlWebhook(),
    email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: await tokenWebhook(),
    sendType: "SEQUENTIALLY",
    events: EVENTOS_WEBHOOK,
  };
  const atual = await webhookNoAsaas();
  if (atual) await chamarAsaas(`/webhooks/${atual.id}`, { metodo: "PUT", corpo });
  else await chamarAsaas("/webhooks", { metodo: "POST", corpo });
  return { criado: !atual };
}

// ===== Cobranças (decisão #115, etapa B) =====

/** Asaas ligado = tem chave salva (testada). */
export async function asaasLigado() {
  const c = await prisma.configVenda.findUnique({ where: { id: "config" }, select: { asaasChave: true } });
  return !!c?.asaasChave;
}

/** Cliente no Asaas: reaproveita o do mesmo CPF/CNPJ; senão cria. */
export async function clienteAsaas(dados: { nome: string; email: string; cpfCnpj: string; whatsapp?: string }) {
  const doc = dados.cpfCnpj.replace(/\D/g, "");
  const achados = await chamarAsaas<{ data?: { id: string }[] }>(`/customers?cpfCnpj=${doc}&limit=1`);
  if (achados.data?.[0]) return achados.data[0].id;
  const fone = (dados.whatsapp ?? "").replace(/\D/g, "");
  const novo = await chamarAsaas<{ id: string }>("/customers", {
    metodo: "POST",
    corpo: { name: dados.nome, email: dados.email, cpfCnpj: doc, mobilePhone: fone.length >= 10 ? fone : undefined, notificationDisabled: true },
  });
  return novo.id;
}

const TIPO_ASAAS = { PIX: "PIX", BOLETO: "BOLETO", CARTAO: "CREDIT_CARD" } as const;

/** Data AAAA-MM-DD daqui a N dias (vencimento da cobrança). */
const dataDaqui = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

export type CobrancaAsaas = { id: string; link: string | null; pix?: { payload: string; imagem: string; expira: string | null }; boletoLinha?: string | null; boletoLink?: string | null };

/**
 * Cria a cobrança no Asaas. "valor" já é o total com acréscimo (boleto) ou juros (parcelas).
 * Cartão: o cliente paga na página do Asaas (link). PIX: QR Code e copia e cola. Boleto: link e linha digitável.
 */
export async function criarCobrancaAsaas(o: {
  clienteId: string; forma: "PIX" | "BOLETO" | "CARTAO"; valor: number; parcelas: number; descricao: string; referencia: string; vencimentoDias: number;
}): Promise<CobrancaAsaas> {
  const reais = (c: number) => Math.round(c) / 100;
  const base = {
    customer: o.clienteId,
    billingType: TIPO_ASAAS[o.forma],
    dueDate: dataDaqui(o.vencimentoDias),
    description: o.descricao.slice(0, 500),
    externalReference: o.referencia,
  };
  const corpo = o.forma === "CARTAO" && o.parcelas > 1
    ? { ...base, installmentCount: o.parcelas, totalValue: reais(o.valor) }
    : { ...base, value: reais(o.valor) };
  const p = await chamarAsaas<{ id: string; invoiceUrl?: string; bankSlipUrl?: string }>("/payments", { metodo: "POST", corpo });
  const r: CobrancaAsaas = { id: p.id, link: p.invoiceUrl ?? null };
  if (o.forma === "PIX") {
    const q = await chamarAsaas<{ encodedImage: string; payload: string; expirationDate?: string }>(`/payments/${p.id}/pixQrCode`);
    r.pix = { payload: q.payload, imagem: `data:image/png;base64,${q.encodedImage}`, expira: q.expirationDate ?? null };
  }
  if (o.forma === "BOLETO") {
    r.boletoLink = p.bankSlipUrl ?? p.invoiceUrl ?? null;
    const l = await chamarAsaas<{ identificationField?: string }>(`/payments/${p.id}/identificationField`).catch(() => ({ identificationField: undefined }));
    r.boletoLinha = l.identificationField ?? null;
  }
  return r;
}

/** Cancela (apaga) a cobrança no Asaas — usado quando o pedido é cancelado no FilaPro. */
export async function apagarCobrancaAsaas(id: string) {
  await chamarAsaas(`/payments/${id}`, { metodo: "DELETE" }).catch(() => undefined);
}

// ===== Assinaturas: cobrança automática no cartão (decisão #124, etapa D) =====
// O cliente paga a 1ª cobrança na página do Asaas (o cartão fica guardado lá); nos períodos seguintes o Asaas cobra sozinho.

/** Data AAAA-MM-DD no horário de Brasília (vencimento da cobrança). */
export const dataBR = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

/** Cria a assinatura no cartão e devolve o código dela e a 1ª cobrança (página de pagamento). */
export async function criarAssinaturaAsaas(o: {
  clienteId: string; valor: number; ciclo: string; descricao: string; referencia: string;
}): Promise<{ id: string; cobrancaId: string | null; link: string | null }> {
  const a = await chamarAsaas<{ id: string }>("/subscriptions", {
    metodo: "POST",
    corpo: {
      customer: o.clienteId,
      billingType: "CREDIT_CARD",
      value: Math.round(o.valor) / 100,
      nextDueDate: dataBR(new Date(Date.now() + 86_400_000)), // 1ª cobrança: vence amanhã, como o cartão avulso
      cycle: o.ciclo,
      description: o.descricao.slice(0, 500),
      externalReference: o.referencia,
    },
  });
  const lista = await chamarAsaas<{ data?: { id: string; invoiceUrl?: string }[] }>(`/subscriptions/${a.id}/payments`).catch(() => ({ data: [] }));
  const primeira = lista.data?.[0];
  return { id: a.id, cobrancaId: primeira?.id ?? null, link: primeira?.invoiceUrl ?? null };
}

/** Atualiza valor, período e próxima data da assinatura; a cobrança já gerada e ainda não paga acompanha. */
export async function atualizarAssinaturaAsaas(id: string, o: { valor: number; ciclo: string; proximaData: Date }) {
  await chamarAsaas(`/subscriptions/${id}`, {
    metodo: "PUT",
    corpo: { value: Math.round(o.valor) / 100, cycle: o.ciclo, nextDueDate: dataBR(o.proximaData), updatePendingPayments: true },
  });
}

/** Cancela a assinatura no Asaas (o cartão deixa de ser cobrado). */
export async function cancelarAssinaturaAsaas(id: string) {
  await chamarAsaas(`/subscriptions/${id}`, { metodo: "DELETE" });
}
