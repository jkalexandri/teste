// GET /api/cron/servico — roda a cada 5 minutos (agendador da VPS: deploy/vigia-servico.sh — decisão #151).
// Avisa os Super Admins por e-mail quando o serviço 24/7 fica fora do ar (e quando volta). Protegido por CRON_SECRET.
import { NextResponse } from "next/server";
import { conferirServico } from "@/lib/alerta-servico";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json(await conferirServico());
}
