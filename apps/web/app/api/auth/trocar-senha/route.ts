// POST /api/auth/trocar-senha — primeiro acesso: troca a senha temporária pela definitiva.
// Decisão #157 (Módulo 1, S1): só vale enquanto a sessão está em "primeiro acesso" (precisaTrocar); a nova senha não pode
// repetir a temporária; as sessões antigas são apagadas e uma nova é aberta; o dono recebe e-mail de aviso e fica nos Logs.
import { NextResponse } from "next/server";
import { limitarPorIp, ipDoPedido } from "@/lib/limite-acesso";
import { prisma, gerarHash, conferirSenha } from "@filapro/db";
import { obterSessao, renovarSessoesAposNovaSenha } from "@/lib/auth/session";
import { destinoPorCargo } from "@/lib/auth/login";
import { isPasswordValid } from "@/lib/password-policy";
import { registrarLog } from "@/lib/logs";
import { limparRecuperacao } from "@/lib/auth/tentativas";
import { enviarEmail, emailSenhaAlterada } from "@/lib/email";

export async function POST(req: Request) {
  // Limite por endereço de internet (decisão #105): 10 tentativas a cada 10 minutos
  const limite = await limitarPorIp("trocar-senha", 10, 10 * 60_000);
  if (limite) return limite;
  const sessao = await obterSessao();
  if (!sessao) return NextResponse.json({ erro: "Sessão expirada. Entre novamente." }, { status: 401 });
  // Quem já tem senha definitiva não troca por aqui (evita tomar a conta por uma sessão aberta)
  if (!sessao.precisaTrocar) return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });

  const corpo = await req.json().catch(() => ({}));
  const nova = String(corpo.senha || "");
  if (!isPasswordValid(nova)) {
    return NextResponse.json({ erro: "Sua nova senha precisa cumprir todos os requisitos abaixo." }, { status: 400 });
  }
  // A senha temporária passou por e-mail: não pode virar a definitiva
  if (sessao.usuario.senhaTempHash && (await conferirSenha(nova, sessao.usuario.senhaTempHash))) {
    return NextResponse.json({ erro: "A nova senha não pode ser igual à senha temporária. Crie uma senha diferente." }, { status: 400 });
  }

  await prisma.usuario.update({
    where: { id: sessao.usuarioId },
    data: { senhaHash: await gerarHash(nova), senhaTempHash: null, senhaTempExpiraEm: null },
  });
  // Token novo: sessões antigas (inclusive a atual) deixam de valer
  await renovarSessoesAposNovaSenha(sessao.usuarioId);

  const ip = await ipDoPedido();
  const u = sessao.usuario;
  await limparRecuperacao(u.email).catch(() => undefined); // o dono provou que tem a caixa de e-mail: pode pedir recuperação de novo
  await registrarLog(u, "ENTRADA", "Senha definida no primeiro acesso (sessões antigas encerradas)");
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const { texto, html } = emailSenhaAlterada(u.nome, quando, ip);
  void enviarEmail({ para: u.email, assunto: "Sua senha foi alterada — FilaPro Leads", texto, html }).catch(() => undefined);
  return NextResponse.json({ destino: destinoPorCargo(u.cargo) });
}
