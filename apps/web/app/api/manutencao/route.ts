// GET /api/manutencao — o sistema está em atualização? (decisão #103). Usado pela tela de login e pela tela de manutenção.
import { NextResponse } from "next/server";
import { emManutencao } from "@/lib/manutencao";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ manutencao: await emManutencao() }, { headers: { "cache-control": "no-store" } });
}
