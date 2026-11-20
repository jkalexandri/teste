// GET /api/auth/encerrar?motivo=... — encerra a sessão e volta ao login com o motivo.
// Usado quando o acesso deixa de valer com a pessoa já logada
// (pacote expirado, empresa inativa, usuário bloqueado).
import { NextResponse } from "next/server";
import { encerrarSessao } from "@/lib/auth/session";

export async function GET(req: Request) {
  await encerrarSessao();
  const motivo = new URL(req.url).searchParams.get("motivo") || "";
  const destino = new URL("/login", req.url);
  if (motivo) destino.searchParams.set("motivo", motivo);
  return NextResponse.redirect(destino);
}
