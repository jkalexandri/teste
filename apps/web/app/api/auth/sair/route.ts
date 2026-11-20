// POST /api/auth/sair — encerra a sessão.
import { NextResponse } from "next/server";
import { encerrarSessao } from "@/lib/auth/session";

export async function POST() {
  await encerrarSessao();
  return NextResponse.json({ destino: "/login" });
}
