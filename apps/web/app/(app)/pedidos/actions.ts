"use server";

// Ações do Super Admin sobre os pedidos (decisão #33: confirmação manual do PIX).
import { revalidatePath } from "next/cache";
import { prisma, Modulo, StatusPedido } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { criarConta, enviarEmailBoasVindas } from "@/lib/contas";
import { aplicarRenovacao, enviarEmailRenovacaoConfirmada } from "@/lib/renovacao";

type R = { ok: boolean; mensagem: string };

/** Confirma o pagamento: cria a conta e envia o acesso por e-mail.
 *  Também aceita pedido expirado (cliente que pagou depois das 24 h). */
export async function confirmarPagamento(id: string): Promise<R> {
  const sessao = await exigirSuperAdmin();
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) return { ok: false, mensagem: "Pedido não encontrado." };
  if (pedido.status === StatusPedido.PAGO) return { ok: false, mensagem: "Este pedido já foi confirmado." };
  if (pedido.status === StatusPedido.CANCELADO) return { ok: false, mensagem: "Pedido cancelado não pode ser confirmado." };

  // Renovação (decisões #43 e #44): troca o plano, se mudou, e soma o prazo.
  if (pedido.renovacao) {
    const empresa = await prisma.$transaction(async (tx) => {
      const marcado = await tx.pedido.updateMany({
        where: { id, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } },
        data: { status: StatusPedido.PAGO, confirmadoEm: new Date(), confirmadoPor: sessao.usuario.email },
      });
      if (marcado.count === 0) throw new Error("Pedido já processado.");
      return aplicarRenovacao(pedido, tx);
    });
    await enviarEmailRenovacaoConfirmada(pedido.nome, pedido.email, empresa, pedido.valor);
    revalidatePath("/pedidos");
    return { ok: true, mensagem: `Renovação confirmada: ${empresa.nome} até ${empresa.expiraEm.toLocaleDateString("pt-BR")}.` };
  }
  if (await prisma.usuario.findUnique({ where: { email: pedido.email } })) {
    return { ok: false, mensagem: `O e-mail ${pedido.email} já tem acesso. Verifique antes de confirmar.` };
  }

  const empresarial = pedido.modulo === Modulo.EMPRESARIAL;
  const conta = await prisma.$transaction(async (tx) => {
    // Garante que o pedido continua pendente (evita confirmação dupla).
    const marcado = await tx.pedido.updateMany({
      where: { id, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } },
      data: { status: StatusPedido.PAGO, confirmadoEm: new Date(), confirmadoPor: sessao.usuario.email },
    });
    if (marcado.count === 0) throw new Error("Pedido já processado.");
    const c = await criarConta(
      {
        modulo: pedido.modulo,
        nomeConta: empresarial ? pedido.empresaNome || pedido.nome : pedido.nome,
        pacote: pedido.planoNome,
        planoId: pedido.planoId,
        limiteUsuarios: empresarial ? pedido.usuarios ?? 1 : 1,
        prazoDias: pedido.prazoDias,
        usuario: { nome: pedido.nome, email: pedido.email, whatsapp: pedido.whatsapp },
      },
      tx,
    );
    await tx.pedido.update({ where: { id }, data: { empresaId: c.empresa.id } });
    return c;
  });

  const enviado = await enviarEmailBoasVindas(pedido.nome, pedido.email, conta.senhaTemporaria, pedido.planoNome, pedido.modulo);
  revalidatePath("/pedidos");
  return {
    ok: true,
    mensagem: enviado
      ? `Pagamento confirmado. Acesso enviado para ${pedido.email}.`
      : `Pagamento confirmado e conta criada, mas o e-mail não foi enviado. Use “Esqueci minha senha” para ${pedido.email}.`,
  };
}

export async function cancelarPedido(id: string): Promise<R> {
  await exigirSuperAdmin();
  const r = await prisma.pedido.updateMany({
    where: { id, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } },
    data: { status: StatusPedido.CANCELADO, canceladoEm: new Date() },
  });
  revalidatePath("/pedidos");
  return r.count ? { ok: true, mensagem: "Pedido cancelado." } : { ok: false, mensagem: "Este pedido não pode ser cancelado." };
}
