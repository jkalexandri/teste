// GET /api/monitor?t=TOKEN — endereço para o monitor EXTERNO (UptimeRobot etc.; decisão #171 — O1 do Módulo 12).
// 200 "ok" = site no ar, VPS reportando e sem problema crítico. 503 = problema crítico ou VPS sem reportar há mais de 1 hora.
// Sem o token certo (MONITOR_TOKEN no .env) responde 404, como se a rota não existisse. Não revela detalhes. Livre na manutenção.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { emManutencao } from "@/lib/manutencao";
import { estadoParaMonitor } from "@/lib/alerta-vps";

export const dynamic = "force-dynamic";
const resp = (corpo: string, status: number) => new NextResponse(corpo, { status, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });

export async function GET(req: Request) {
  const esperado = process.env.MONITOR_TOKEN ?? "";
  const recebido = new URL(req.url).searchParams.get("t") ?? "";
  const a = Buffer.from(recebido), b = Buffer.from(esperado);
  if (esperado.length < 24 || a.length !== b.length || !timingSafeEqual(a, b)) return resp("Não encontrado", 404);
  if (await emManutencao()) return resp("manutencao", 200);
  try {
    const e = await estadoParaMonitor();
    return e.ok ? resp("ok", 200) : resp(e.motivo === "critico" ? "problema critico" : "sem relatorio da VPS", 503);
  } catch {
    return resp("banco indisponivel", 503);
  }
}
