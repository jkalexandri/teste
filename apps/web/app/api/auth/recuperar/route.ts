// POST /api/auth/recuperar — envia senha temporária para o e-mail cadastrado.
// A resposta é sempre a mesma, exista o e-mail ou não (não revela quem é cadastrado).
// A senha atual continua valendo até a pessoa entrar com a temporária e trocá-la.
import { NextResponse, after } from "next/server";
import { limitarPorIp } from "@/lib/limite-acesso";
import { prisma, gerarHash, gerarSenhaTemporaria, StatusUsuario } from "@filapro/db";
import { enviarEmail, emailSenhaTemporaria } from "@/lib/email";

const VALIDADE_TEMP_HORAS = 24;

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
          const temp = gerarSenhaTemporaria();
          await prisma.usuario.update({
            where: { id: usuario.id },
            data: {
              senhaTempHash: await gerarHash(temp),
              senhaTempExpiraEm: new Date(Date.now() + VALIDADE_TEMP_HORAS * 3600 * 1000),
            },
          });
          const { texto, html } = emailSenhaTemporaria(usuario.nome, temp, VALIDADE_TEMP_HORAS);
          await enviarEmail({ para: usuario.email, assunto: "Sua senha temporária — FilaPro Leads", texto, html });
        }
      } catch (e) {
        console.error("[recuperar] falha ao gerar/enviar a senha temporária", e);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
