// GET /api/cron/renovacao — roda 1x por dia (agendador da VPS: deploy/rotinas.sh — decisão #99).
// Envia o link de renovação 10 dias antes e o lembrete 3 dias antes (decisão #42).
// Protegido por CRON_SECRET (o agendador envia "Authorization: Bearer <CRON_SECRET>").
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { enviarAvisoRenovacao, enviarAvisoRenovacaoAutomatica } from "@/lib/renovacao";
import { Cargo } from "@filapro/db";
import { avisarContasVencendo, sincronizarFinanceiro } from "@/lib/financeiro";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";
import { chamarWorker } from "@/lib/worker";
import { reprocessarPendentes } from "@/lib/asaas-avisos";

export const dynamic = "force-dynamic";

function diasAte(d: Date) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(d);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - hoje.getTime()) / 86400000);
}

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const limite = new Date(Date.now() + 11 * 86400000);
  const contas = await prisma.empresa.findMany({
    where: { ativa: true, expiraEm: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lte: limite } },
  });

  let enviados10 = 0;
  let enviados3 = 0;
  for (const e of contas) {
    const d = diasAte(e.expiraEm);
    // Cobrança automática no cartão (decisão #124, item g): um aviso só, 3 dias antes, sem o link de renovação
    if (e.asaasAssinaturaId) {
      if (d <= 3 && !e.avisoRenovacao3Em && (await enviarAvisoRenovacaoAutomatica(e))) {
        await prisma.empresa.update({ where: { id: e.id }, data: { avisoRenovacao3Em: new Date(), avisoRenovacao10Em: e.avisoRenovacao10Em ?? new Date() } });
        enviados3++;
      }
      continue;
    }
    if (d <= 3 && !e.avisoRenovacao3Em) {
      if (await enviarAvisoRenovacao(e, d)) {
        // Lembrete de 3 dias cobre também o de 10 se este ainda não tinha saído.
        await prisma.empresa.update({ where: { id: e.id }, data: { avisoRenovacao3Em: new Date(), avisoRenovacao10Em: e.avisoRenovacao10Em ?? new Date() } });
        enviados3++;
      }
    } else if (d <= 10 && d > 3 && !e.avisoRenovacao10Em) {
      if (await enviarAvisoRenovacao(e, d)) {
        await prisma.empresa.update({ where: { id: e.id }, data: { avisoRenovacao10Em: new Date() } });
        enviados10++;
      }
    }
  }
  // Gestão financeira (decisão #106): despesas fixas do mês, IA do mês anterior e aviso das contas vencendo
  const fin = await sincronizarFinanceiro().catch(() => null);
  const contasAvisadas = await avisarContasVencendo(async (texto) => {
    const cfg = await prisma.configVenda.findUnique({ where: { id: "config" } });
    if (cfg?.numeroAvisos) await enviarPelaPlataforma(cfg.numeroAvisos, texto).catch(() => undefined);
    const sas = await prisma.usuario.findMany({ where: { cargo: Cargo.SUPERADMIN, status: "ATIVO" }, select: { id: true } });
    for (const sa of sas) await chamarWorker(`/push/${sa.id}/enviar`, { texto: texto.slice(0, 280), url: "/financeiro/contas" }).catch(() => undefined);
  }).catch(() => 0);
  // Avisos do Asaas que ficaram pela metade (decisão #117): tenta processar de novo
  const avisosAsaas = await reprocessarPendentes().catch(() => 0);
  return NextResponse.json({ verificadas: contas.length, enviados10, enviados3, financeiro: { semCotacao: fin?.semCotacao ?? false, contasAvisadas }, avisosAsaas });
}
