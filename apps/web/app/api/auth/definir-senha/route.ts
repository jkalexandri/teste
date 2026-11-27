// POST /api/auth/definir-senha — define a nova senha pelo link de uso único enviado ao e-mail (decisão #164 — S9 do Módulo 1).
// { token, senha }: o link só é gasto quando a senha nova é aceita. Não entra no sistema sozinho: a pessoa vai ao login
// (e o Super Admin continua precisando do código da verificação em duas etapas).
import { NextResponse, after } from "next/server";
import { limitarPorIp, ipRealDoPedido } from "@/lib/limite-acesso";
import { prisma, gerarHash } from "@filapro/db";
import { isPasswordValid } from "@/lib/password-policy";
import { definirSenhaPorLink, tokenValido } from "@/lib/auth/link-senha";
import { limparRecuperacao } from "@/lib/auth/tentativas";
import { registrarLog } from "@/lib/logs";
import { enviarEmail, emailSenhaAlterada } from "@/lib/email";

const LINK_INVALIDO = "Link inválido ou expirado. Peça um novo em “Esqueci minha senha”, na tela de login.";

export async function POST(req: Request) {
  const limite = await limitarPorIp("definir-senha", 10, 10 * 60_000);
  if (limite) return limite;
  const corpo = await req.json().catch(() => ({}));
  const token = String(corpo.token || "");
  const senha = String(corpo.senha || "");
  if (!tokenValido(token)) return NextResponse.json({ erro: LINK_INVALIDO }, { status: 400 });
  // Senha fraca: recusa SEM gastar o link
  if (!isPasswordValid(senha)) return NextResponse.json({ erro: "Sua nova senha precisa cumprir todos os requisitos abaixo." }, { status: 400 });

  const u = await definirSenhaPorLink(token, await gerarHash(senha));
  if (!u) return NextResponse.json({ erro: LINK_INVALIDO }, { status: 400 });

  // Todos os aparelhos saem (se alguém tinha a conta, perde o acesso) e os bloqueios por tentativas acabam
  await prisma.sessao.deleteMany({ where: { usuarioId: u.id } });
  await prisma.tentativaLogin.deleteMany({ where: { OR: [{ chave: { startsWith: `par:${u.email}|` } }, { chave: `conta:${u.email}` }] } });
  await limparRecuperacao(u.email).catch(() => undefined);
  await registrarLog({ id: u.id, nome: u.nome, email: u.email, empresaId: u.empresaId }, "ENTRADA", "Senha definida pelo link de recuperação (sessões antigas encerradas)");
  const ip = (await ipRealDoPedido()) ?? "desconhecido";
  after(async () => {
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    const { texto, html } = emailSenhaAlterada(u.nome, quando, ip);
    await enviarEmail({ para: u.email, assunto: "Sua senha foi alterada — FilaPro Leads", texto, html }).catch(() => undefined);
  });
  return NextResponse.json({ ok: true });
}
