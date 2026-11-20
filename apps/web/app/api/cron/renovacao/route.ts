// GET /api/cron/renovacao — roda 1x por dia (Vercel Cron, vercel.json).
// Envia o link de renovação 10 dias antes e o lembrete 3 dias antes (decisão #42).
// Protegido por CRON_SECRET (a Vercel envia "Authorization: Bearer <CRON_SECRET>").
import { NextResponse } from "next/server";
import { prisma } from "@filapro/db";
import { enviarAvisoRenovacao } from "@/lib/renovacao";

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
  return NextResponse.json({ verificadas: contas.length, enviados10, enviados3 });
}
