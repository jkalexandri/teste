// GET /api/status — estado público para a pílula do login (decisão #109). Sem dados de clientes.
import { NextResponse } from "next/server";
import { statusPublico } from "@/lib/status-publico";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await statusPublico(), { headers: { "cache-control": "no-store" } });
}
