// Diagnóstico do Asaas (decisão #115) — roda na VPS: bash deploy/diagnostico-asaas.sh
// Mostra a versão instalada, a configuração salva, se a chave conecta, se o aviso (webhook) está cadastrado no Asaas
// e se o endereço do aviso responde com o token. NUNCA mostra a chave nem o token.
import { readFileSync } from "node:fs";
import { prisma } from "@filapro/db";
import { descriptografar } from "@filapro/ia";

const SITE = (process.env.SITE ?? "https://filaproleads.com.br").replace(/\/$/, "");
const URL_AVISO = `${SITE}/api/asaas/webhook`;
const ok = (t: string) => console.log(`  ✅ ${t}`);
const erro = (t: string) => console.log(`  ❌ ${t}`);
const info = (t: string) => console.log(`  • ${t}`);

async function asaas(base: string, chave: string, caminho: string) {
  const r = await fetch(base + caminho, { headers: { access_token: chave, "User-Agent": "FilaPro Leads" }, signal: AbortSignal.timeout(20_000) });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, corpo };
}

async function main() {
  console.log("\n=== Diagnóstico do Asaas — FilaPro Leads ===\n");
  try {
    const v = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;
    info(`Versão instalada: v${v} (precisa ser v1.34.4 ou mais nova)`);
  } catch { info("Versão: não consegui ler"); }

  const c = await prisma.configVenda.findUnique({ where: { id: "config" } });
  console.log("\n1) Configuração salva no FilaPro");
  if (!c?.asaasChave) { erro("Nenhuma chave do Asaas salva. Cole a chave em Pagamento → Asaas."); return; }
  ok(`Chave salva (ambiente: ${c.asaasAmbiente === "producao" ? "Produção" : "Testes/sandbox"}; conta: ${c.asaasConta ?? "?"})`);
  info(`Último aviso recebido: ${c.asaasAvisoEm ? `${c.asaasAvisoEm.toLocaleString("pt-BR")} — ${c.asaasAvisoEvento} — ${c.asaasAvisoOk ? "token OK" : "TOKEN DIFERENTE (recusado)"}` : "nenhum"}`);

  let chave = "";
  let token = "";
  try { chave = descriptografar(c.asaasChave); } catch { erro("Não consegui abrir a chave salva (CHAVE_CRIPTO diferente do site?)."); return; }
  try { token = c.asaasTokenWebhook ? descriptografar(c.asaasTokenWebhook) : ""; } catch { erro("Não consegui abrir o token do aviso."); }
  // ASAAS_URL: só nos testes (Asaas de mentira)
  const base = process.env.ASAAS_URL || (c.asaasAmbiente === "producao" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3");

  console.log("\n2) Conexão com o Asaas");
  try {
    const r = await asaas(base, chave, "/myAccount/commercialInfo");
    if (r.status === 200) ok(`Conectou: ${String(r.corpo.companyName ?? r.corpo.name ?? "conta")}`);
    else erro(`Asaas respondeu ${r.status}: ${JSON.stringify(r.corpo).slice(0, 300)}`);
  } catch (e) { erro(`Sem resposta do Asaas: ${(e as Error).message}`); }

  console.log("\n3) Aviso (webhook) cadastrado no Asaas");
  try {
    const r = await asaas(base, chave, "/webhooks?limit=100");
    if (r.status !== 200) erro(`Asaas respondeu ${r.status}: ${JSON.stringify(r.corpo).slice(0, 300)}`);
    else {
      const lista = (r.corpo.data as { url: string; name?: string; enabled?: boolean; interrupted?: boolean; penalizedRequestsCount?: number; events?: string[]; apiVersion?: number }[]) ?? [];
      info(`Webhooks na conta: ${lista.length}`);
      for (const w of lista) info(`${w.name ?? "sem nome"} → ${w.url} | ativado: ${w.enabled} | fila pausada: ${w.interrupted} | falhas: ${w.penalizedRequestsCount ?? 0} | eventos: ${w.events?.length ?? 0} | API v${w.apiVersion ?? "?"}`);
      const nosso = lista.find((w) => w.url.replace(/\/$/, "") === URL_AVISO);
      if (!nosso) erro(`Nenhum webhook com a URL ${URL_AVISO}. Clique em "Configurar aviso automaticamente" em Pagamento.`);
      else if (nosso.interrupted) erro("O webhook do FilaPro está com a fila PAUSADA. Clique em \"Configurar aviso automaticamente\".");
      else if (nosso.enabled === false) erro("O webhook do FilaPro está DESATIVADO. Clique em \"Configurar aviso automaticamente\".");
      else ok("Webhook do FilaPro cadastrado e ativo.");
    }
  } catch (e) { erro(`Sem resposta do Asaas: ${(e as Error).message}`); }

  console.log("\n4) Endereço do aviso no FilaPro");
  try {
    const r = await fetch(URL_AVISO, { method: "POST", headers: { "Content-Type": "application/json", "asaas-access-token": token }, body: JSON.stringify({ event: "DIAGNOSTICO_FILAPRO" }), signal: AbortSignal.timeout(20_000) });
    if (r.status === 200) ok(`${URL_AVISO} respondeu 200 com o token (aceita os avisos).`);
    else erro(`${URL_AVISO} respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  } catch (e) { erro(`Não consegui chamar ${URL_AVISO}: ${(e as Error).message}`); }
  console.log("\nMande um print deste resultado (não tem chave nem token).\n");
}

main().catch((e) => console.error("Erro no diagnóstico:", e)).finally(() => prisma.$disconnect());
