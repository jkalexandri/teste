// POST /api/auth/login — entrada no sistema.
import { NextResponse } from "next/server";
import { Modulo } from "@filapro/db";
import { tentarLogin, destinoPorCargo } from "@/lib/auth/login";
import { criarSessao } from "@/lib/auth/session";
import { isPasswordValid } from "@/lib/password-policy";
import { prisma } from "@filapro/db";
import { registrarLog } from "@/lib/logs";

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email || "");
  const senha = String(corpo.senha || "");
  const modulo = corpo.modulo === "empresarial" ? Modulo.EMPRESARIAL : Modulo.INDIVIDUAL;

  if (!email.includes("@") || !isPasswordValid(senha)) {
    return NextResponse.json({ erro: "Confira o e-mail e todos os requisitos da senha antes de entrar." }, { status: 400 });
  }

  const r = await tentarLogin(email, senha, modulo);
  // Logs (decisão #99): entradas e senhas erradas/bloqueios de quem tem conta
  const quem = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, nome: true, email: true, empresaId: true } });
  if (!r.ok) {
    if (quem) await registrarLog(quem, "SENHA", `Entrada recusada: ${r.erro}`);
    return NextResponse.json({ erro: r.erro }, { status: 401 });
  }
  if (quem) await registrarLog(quem, "ENTRADA", "Entrou no sistema");

  await criarSessao(r.usuarioId, r.precisaTrocar);
  return NextResponse.json({ destino: r.precisaTrocar ? "/primeiro-acesso" : destinoPorCargo(r.cargo) });
}
