// POST /api/asaas/webhook — aviso automático do Asaas (decisões #115 e #117).
// Etapa C: confere o token, guarda o aviso (tabela AvisoAsaas), responde 200 na hora e processa logo depois
// (confirmação do pedido, taxa, estorno). O Asaas pausa a fila de avisos se a resposta demorar ou der erro,
// por isso o processamento roda depois da resposta (after) e erros ficam guardados para tentar de novo.
import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tokenWebhook } from "@/lib/asaas";
import { guardarAviso, processarAviso, reprocessarPendentes, type CorpoAviso } from "@/lib/asaas-avisos";
import { prisma } from "@filapro/db";

/** Compara o token sem vazar o tempo da comparação. */
function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const recebido = req.headers.get("asaas-access-token") ?? "";
  const corpo = (await req.json().catch(() => ({}))) as CorpoAviso;
  const tokenOk = !!recebido && igual(recebido, await tokenWebhook());
  // Guarda o último aviso (quando, evento, se o token conferiu) para conferir na tela Pagamento.
  // Chamada sem token (ex.: teste com curl) não conta como aviso do Asaas.
  if (recebido) {
    await prisma.configVenda.update({
      where: { id: "config" },
      data: { asaasAvisoEm: new Date(), asaasAvisoEvento: String(corpo.event ?? "sem evento").slice(0, 60), asaasAvisoOk: tokenOk },
    }).catch(() => undefined);
  }
  if (!tokenOk) return NextResponse.json({ erro: "Token inválido." }, { status: 401 });

  // Guarda antes de responder. Aviso repetido (mesmo evento) responde 200 sem processar de novo.
  const id = await guardarAviso(corpo);
  console.log(`[asaas] aviso recebido: ${corpo.event ?? "sem evento"}${id ? "" : " (repetido)"}`);
  if (id) {
    after(async () => {
      await processarAviso(id);
      await reprocessarPendentes().catch(() => undefined); // aproveita para tentar os que deram erro antes
    });
  }
  return NextResponse.json({ ok: true });
}
