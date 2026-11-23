// POST /api/asaas/webhook — aviso automático do Asaas (decisão #115).
// Etapa A: só confere o token e responde "ok", para o Asaas não pausar a fila de avisos enquanto
// o processamento dos pagamentos (etapa C) não está pronto.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tokenWebhook } from "@/lib/asaas";

/** Compara o token sem vazar o tempo da comparação. */
function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const recebido = req.headers.get("asaas-access-token") ?? "";
  if (!recebido || !igual(recebido, await tokenWebhook())) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  }
  const evento = (await req.json().catch(() => ({}))) as { event?: string };
  console.log(`[asaas] aviso recebido: ${evento.event ?? "sem evento"} (processamento na etapa C)`);
  return NextResponse.json({ ok: true });
}
