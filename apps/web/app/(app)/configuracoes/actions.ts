"use server";

// Janela de envio da conta (decisões #6 e #65): Admin da Empresa (vale para todos os usuários
// da empresa) ou o próprio usuário Individual. Sempre dentro da faixa global do Super Admin.
import { revalidatePath } from "next/cache";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { lerJanela } from "@/lib/janela";

export async function salvarJanelaConta(form: FormData): Promise<{ ok: boolean; mensagem: string }> {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  const u = s.usuario;
  const pode = !!u.empresa && (u.cargo === Cargo.ADMIN_EMPRESA || (u.cargo === Cargo.USUARIO && u.empresa.modulo === Modulo.INDIVIDUAL));
  if (!pode || !u.empresaId) return { ok: false, mensagem: "Só o administrador da empresa altera a janela de envio." };
  const global = await prisma.configEnvio.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  const j = lerJanela(form, global);
  if ("erro" in j) return { ok: false, mensagem: j.erro! };
  await prisma.empresa.update({ where: { id: u.empresaId }, data: { janelaInicio: j.inicio, janelaFim: j.fim } });
  revalidatePath("/configuracoes");
  revalidatePath("/campanhas");
  return { ok: true, mensagem: "Janela de envio salva. Vale imediatamente para as campanhas em andamento." };
}
