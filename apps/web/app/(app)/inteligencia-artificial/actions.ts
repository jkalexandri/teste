"use server";

// Super Admin → Inteligência Artificial (decisões #72, #75 e #77): provedor, modelo, chave e preços
// de cada tarefa; botão Testar; cotação do dólar para a tela de despesas.
import { revalidatePath } from "next/cache";
import { prisma } from "@filapro/db";
import { criptografar, ErroIA, TAREFAS, testarConfig, type Tarefa } from "@filapro/ia";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { IS_PRODUCTION } from "@/lib/env";

type R = { ok: boolean; mensagem: string };
const PROVEDORES = ["anthropic", "compativel", "simulado"];

function lerForm(tarefa: string, form: FormData) {
  if (!(tarefa in TAREFAS)) return { erro: "Tarefa inválida." } as const;
  const provedor = String(form.get("provedor") ?? "");
  if (!PROVEDORES.includes(provedor) || (provedor === "simulado" && IS_PRODUCTION)) return { erro: "Provedor inválido." } as const;
  const modelo = String(form.get("modelo") ?? "").trim().slice(0, 120);
  if (!modelo) return { erro: "Informe o modelo." } as const;
  const urlBase = String(form.get("urlBase") ?? "").trim().slice(0, 300);
  if (provedor === "compativel" && !/^https?:\/\//.test(urlBase)) return { erro: "Informe o endereço do provedor (começando com https://)." } as const;
  const num = (k: string) => {
    const v = parseFloat(String(form.get(k) ?? "").replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : NaN;
  };
  const precoEntrada = num("precoEntrada"), precoSaida = num("precoSaida");
  if (Number.isNaN(precoEntrada) || Number.isNaN(precoSaida)) return { erro: "Informe os preços (dólar por 1 milhão de tokens)." } as const;
  const chaveNova = String(form.get("chave") ?? "").trim();
  return { tarefa: tarefa as Tarefa, provedor, modelo, urlBase, precoEntrada, precoSaida, chaveNova } as const;
}

export async function salvarConfigIA(tarefa: string, form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const d = lerForm(tarefa, form);
  if ("erro" in d) return { ok: false, mensagem: d.erro! };
  const atual = await prisma.configIA.findUnique({ where: { tarefa } });
  // Chave em branco = mantém a salva. Para apagar, marque "remover chave".
  const chave = form.get("removerChave") === "on" ? null : d.chaveNova ? criptografar(d.chaveNova) : atual?.chave ?? null;
  const dados = { provedor: d.provedor, modelo: d.modelo, urlBase: d.urlBase, precoEntrada: d.precoEntrada, precoSaida: d.precoSaida, chave };
  await prisma.configIA.upsert({ where: { tarefa }, update: dados, create: { tarefa, ...dados } });
  revalidatePath("/inteligencia-artificial");
  return { ok: true, mensagem: `IA de “${TAREFAS[d.tarefa]}” salva.` };
}

/** Testa a configuração do formulário (antes de salvar). Usa a chave salva se o campo estiver em branco. */
export async function testarConfigIA(tarefa: string, form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const d = lerForm(tarefa, form);
  if ("erro" in d) return { ok: false, mensagem: d.erro! };
  const atual = await prisma.configIA.findUnique({ where: { tarefa } });
  const chave = d.chaveNova || atual?.chave || null;
  try {
    const r = await testarConfig(d.tarefa, { tarefa, provedor: d.provedor, modelo: d.modelo, urlBase: d.urlBase, chave, precoEntrada: d.precoEntrada, precoSaida: d.precoSaida });
    return { ok: true, mensagem: `Funcionou ✓ Resposta: “${r.texto.slice(0, 120)}” • custo do teste: US$ ${r.custoUsd.toFixed(6)}` };
  } catch (e) {
    return { ok: false, mensagem: e instanceof ErroIA ? e.message : "Falha no teste." };
  }
}

export async function salvarCotacao(form: FormData): Promise<R> {
  await exigirSuperAdmin();
  const bruto = String(form.get("cotacao") ?? "").trim();
  const v = bruto ? parseFloat(bruto.replace(",", ".")) : null;
  if (v !== null && (!Number.isFinite(v) || v <= 0 || v > 100)) return { ok: false, mensagem: "Cotação inválida." };
  await prisma.configVenda.upsert({ where: { id: "config" }, update: { cotacaoDolar: v }, create: { id: "config", cotacaoDolar: v } });
  revalidatePath("/despesas-ia");
  revalidatePath("/inteligencia-artificial");
  return { ok: true, mensagem: v ? `Cotação salva: R$ ${v.toFixed(2).replace(".", ",")}` : "Cotação removida (valores só em dólar)." };
}
