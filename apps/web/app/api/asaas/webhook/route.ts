// POST /api/asaas/webhook — aviso automático do Asaas (decisão #115).
// Etapa A: só confere o token e responde "ok", para o Asaas não pausar a fila de avisos enquanto
// o processamento dos pagamentos (etapa C) não está pronto.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tokenWebhook } from "@/lib/asaas";
import { prisma } from "@filapro/db";

/** Compara o token sem vazar o tempo da comparação. */
function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const recebido = req.headers.get("asaas-access-token") ?? "";
  const evento = (await req.json().catch(() => ({}))) as { event?: string };
  const tokenOk = !!recebido && igual(recebido, await tokenWebhook());
  // Guarda o último aviso (quando, evento, se o token conferiu) para conferir na tela Pagamento.
  // Chamada sem token (ex.: teste com curl) não conta como aviso do Asaas.
  if (recebido) {
    await prisma.configVenda.update({
      where: { id: "config" },
      data: { asaasAvisoEm: new Date(), asaasAvisoEvento: String(evento.event ?? "sem evento").slice(0, 60), asaasAvisoOk: tokenOk },
    }).catch(() => undefined);
  }
  if (!tokenOk) return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  console.log(`[asaas] aviso recebido: ${evento.event ?? "sem evento"} (processamento na etapa C)`);
  return NextResponse.json({ ok: true });
}
