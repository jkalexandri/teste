// POST /api/cron/vps — relatório da VPS a cada 15 minutos (deploy/vigia-vps.sh — decisão #171). Protegido por CRON_SECRET.
// Recebe só códigos, níveis e um valor curto de cada verificação; o site decide quando avisar os Super Admins por e-mail.
import { NextResponse } from "next/server";
import { processarRelatorio, type ItemRelatorio } from "@/lib/alerta-vps";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const corpo = (await req.json().catch(() => null)) as { itens?: unknown } | null;
  if (!corpo || !Array.isArray(corpo.itens) || corpo.itens.length > 50) {
    return NextResponse.json({ erro: "Relatório inválido." }, { status: 400 });
  }
  const itens: ItemRelatorio[] = corpo.itens
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({ id: String(i.id ?? ""), nivel: i.nivel as ItemRelatorio["nivel"], valor: typeof i.valor === "string" ? i.valor : undefined }));
  return NextResponse.json(await processarRelatorio(itens));
}
