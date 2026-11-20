// POST /api/auth/login — entrada no sistema.
import { NextResponse } from "next/server";
import { Modulo } from "@filapro/db";
import { tentarLogin, destinoPorCargo } from "@/lib/auth/login";
import { criarSessao } from "@/lib/auth/session";
import { isPasswordValid } from "@/lib/password-policy";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email || "");
  const senha = String(corpo.senha || "");
  const modulo = corpo.modulo === "empresarial" ? Modulo.EMPRESARIAL : Modulo.INDIVIDUAL;

  if (!email.includes("@") || !isPasswordValid(senha)) {
    return NextResponse.json({ erro: "Confira o e-mail e todos os requisitos da senha antes de entrar." }, { status: 400 });
  }

  const r = await tentarLogin(email, senha, modulo);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 401 });

  await criarSessao(r.usuarioId, r.precisaTrocar);
  return NextResponse.json({ destino: r.precisaTrocar ? "/primeiro-acesso" : destinoPorCargo(r.cargo) });
}
