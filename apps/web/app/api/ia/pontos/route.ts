// Liga/desliga cada ponto de atendimento por IA (decisão #149) — só o Super Admin.
// Pontos: LEADS (Conversas IA), CAMPANHAS (gerar mensagens), SUPORTE (clientes) e VISITANTE (chat da tela de Planos).
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { CAMPO_PONTO, PONTOS_IA, ROTULO_PONTO, type PontoIA } from "@filapro/ia";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { chamarWorker } from "@/lib/worker";

export async function POST(req: Request) {
  await exigirSuperAdmin();
  const { ponto, ligada } = (await req.json().catch(() => ({}))) as { ponto?: string; ligada?: boolean };
  if (!ponto || !(PONTOS_IA as readonly string[]).includes(ponto) || typeof ligada !== "boolean") return NextResponse.json({ ok: false, mensagem: "Pedido inválido." }, { status: 400 });
  const campo = CAMPO_PONTO[ponto as PontoIA];
  await prisma.configVenda.upsert({ where: { id: "config" }, update: { [campo]: ligada }, create: { id: "config", [campo]: ligada } });
  // O serviço confere na hora: avisa a mudança e, ao religar, a IA atende quem ficou esperando (sem esperar o minuto do vigia)
  await chamarWorker("/ia/verificar", {}).catch(() => undefined);
  return NextResponse.json({ ok: true, mensagem: `IA de ${ROTULO_PONTO[ponto as PontoIA]} ${ligada ? "ligada" : "desligada"}.` });
}
