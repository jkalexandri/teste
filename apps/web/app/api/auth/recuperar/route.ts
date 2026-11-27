// POST /api/auth/recuperar — envia um link de uso único (30 minutos) para criar uma nova senha (decisão #164).
// A resposta é sempre a mesma, exista o e-mail ou não (não revela quem é cadastrado).
// A senha atual continua valendo até a pessoa entrar com a temporária e trocá-la.
import { NextResponse, after } from "next/server";
import { limitarPorIp } from "@/lib/limite-acesso";
import { prisma, StatusUsuario } from "@filapro/db";
import { enviarEmail, emailLinkRecuperacao } from "@/lib/email";
import { VALIDADE_LINK_MIN, criarLinkSenha, urlDoLink } from "@/lib/auth/link-senha";
import { podePedirRecuperacao } from "@/lib/auth/tentativas";

export async function POST(req: Request) {
  // Limite por endereço de internet (decisão #105): 5 pedidos por hora
  const limite = await limitarPorIp("recuperar", 5, 3600_000);
  if (limite) return limite;
  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email || "").trim().toLowerCase();

  // Decisão #159 (S4 do Módulo 1): a resposta sai na hora e é sempre igual; o trabalho (senha temporária + e-mail) roda depois,
  // para o tempo de resposta não revelar se o e-mail tem conta.
  if (email.includes("@")) {
    after(async () => {
      try {
        const usuario = await prisma.usuario.findUnique({ where: { email } });
        if (usuario && usuario.status === StatusUsuario.ATIVO) {
          // Decisão #160 (S5): no máximo 3 pedidos por hora por e-mail e 10 minutos entre uma senha e outra (a senha do e-mail
          // que o dono está digitando não é anulada por pedidos alheios; contra quem enche a caixa de e-mail). Atômico.
          if (!(await podePedirRecuperacao(email))) return;
          // Decisão #164 (S9): link de uso único (30 minutos) no lugar da senha temporária; o anterior deixa de valer
          const link = urlDoLink(await criarLinkSenha(usuario.id));
          const { texto, html } = emailLinkRecuperacao(usuario.nome, link, VALIDADE_LINK_MIN);
          await enviarEmail({ para: usuario.email, assunto: "Crie uma nova senha — FilaPro Leads", texto, html });
        }
      } catch (e) {
        console.error("[recuperar] falha ao gerar/enviar a senha temporária", e);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
