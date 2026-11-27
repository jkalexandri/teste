// Limite de tentativas por endereço de internet (decisão #105, item 4), em memória (o site roda num processo só na VPS).
import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { chaveDeLimite, ipReal } from "@/lib/ip";

import { dentroDoLimite } from "@/lib/limite-memoria";
export { dentroDoLimite };

/**
 * Endereço de internet de quem chamou, para LIMITES (IPv6 pelo bloco /64; "local" = a própria máquina, sem cabeçalho).
 * Atrás do Caddy vale a última entrada do X-Forwarded-For (decisão #163; o Caddyfile também o define explicitamente).
 */
export async function ipDoPedido() {
  const h = await headers();
  const ip = ipReal(h.get("x-forwarded-for"), h.get("x-real-ip"));
  return ip ? chaveDeLimite(ip) : "local";
}

/** Endereço COMPLETO (sem agrupar o IPv6), para Logs, alertas e e-mails; null se não houver cabeçalho. */
export async function ipRealDoPedido() {
  const h = await headers();
  return ipReal(h.get("x-forwarded-for"), h.get("x-real-ip"));
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
