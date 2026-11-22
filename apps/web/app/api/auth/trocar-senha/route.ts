// POST /api/auth/trocar-senha — primeiro acesso: troca a senha temporária pela definitiva.
import { NextResponse } from "next/server";
import { limitarPorIp } from "@/lib/limite-acesso";
import { prisma, gerarHash } from "@filapro/db";
import { obterSessao, atualizarSessaoTrocaFeita } from "@/lib/auth/session";
import { destinoPorCargo } from "@/lib/auth/login";
import { isPasswordValid } from "@/lib/password-policy";

export async function POST(req: Request) {
  // Limite por endereço de internet (decisão #105): 10 tentativas a cada 10 minutos
  const limite = await limitarPorIp("trocar-senha", 10, 10 * 60_000);
  if (limite) return limite;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada. Entre novamente." }, { status: 401 });

  const corpo = await req.json().catch(() => ({}));
  const nova = String(corpo.senha || "");
  if (!isPasswordValid(nova)) {
    return NextResponse.json({ erro: "Sua nova senha precisa cumprir todos os requisitos abaixo." }, { status: 400 });
  }

  await prisma.usuario.update({
    where: { id: sessao.usuarioId },
    data: { senhaHash: await gerarHash(nova), senhaTempHash: null, senhaTempExpiraEm: null },
  });
  await atualizarSessaoTrocaFeita();
  return NextResponse.json({ destino: destinoPorCargo(sessao.usuario.cargo) });
}
