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
