// Limite de tentativas por endereço de internet (decisão #105, item 4), em memória (o site roda num processo só na VPS).
import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const batidas = new Map<string, number[]>();

/** true = pode; false = passou do limite (máximo "max" vezes em "janelaMs"). */
export function dentroDoLimite(chave: string, max: number, janelaMs: number) {
  const agora = Date.now();
  const l = (batidas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (l.length >= max) { batidas.set(chave, l); return false; }
  l.push(agora);
  batidas.set(chave, l);
  if (batidas.size > 5000) for (const [k, v] of batidas) if (!v.some((t) => agora - t < 3600_000)) batidas.delete(k);
  return true;
}

/** Endereço de internet de quem chamou. Atrás do Caddy vem no X-Forwarded-For (o Caddy não aceita o enviado pelo cliente). */
export async function ipDoPedido() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/**
 * Confere o limite do endereço de internet para uma ação. Devolve a resposta 429 pronta, ou null se pode seguir.
 * Chamadas da própria máquina (sem endereço — testes locais) não contam fora de produção.
 */
export async function limitarPorIp(acao: string, max: number, janelaMs: number, campo: "erro" | "mensagem" = "erro") {
  const ip = await ipDoPedido();
  // A própria máquina (o Next.js marca como 127.0.0.1) não conta fora de produção: testes locais
  const local = ip === "local" || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (local && process.env.NEXT_PUBLIC_APP_ENV !== "production") return null;
  if (dentroDoLimite(`${acao}:${ip}`, max, janelaMs)) return null;
  const min = Math.ceil(janelaMs / 60_000);
  const texto = `Muitas tentativas seguidas deste endereço. Aguarde ${min >= 60 ? `${Math.round(min / 60)} hora${min >= 120 ? "s" : ""}` : `${min} minutos`} e tente de novo.`;
  return NextResponse.json({ ok: false, [campo]: texto }, { status: 429, headers: { "retry-after": String(Math.ceil(janelaMs / 1000)) } });
}
