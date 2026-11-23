// GET /api/auth/encerrar?motivo=... — encerra a sessão e volta ao login com o motivo.
// Usado quando o acesso deixa de valer com a pessoa já logada
// (pacote expirado, empresa inativa, usuário bloqueado).
import { NextResponse } from "next/server";
import { encerrarSessao } from "@/lib/auth/session";

export async function GET(req: Request) {
  await encerrarSessao();
  const motivo = new URL(req.url).searchParams.get("motivo") || "";
  // Endereço relativo: atrás do Caddy o "req.url" é o endereço interno (localhost:3000) — o navegador completa com o domínio certo
  const destino = motivo ? `/login?motivo=${encodeURIComponent(motivo)}` : "/login";
  return new NextResponse(null, { status: 307, headers: { location: destino } });
}
