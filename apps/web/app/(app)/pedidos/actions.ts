"use server";

// Ações do Super Admin sobre os pedidos (decisão #33: confirmação manual do PIX).
import { revalidatePath } from "next/cache";
import { prisma, Modulo, StatusPedido, MOTIVO_SEM_SALDO } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { criarConta, enviarEmailBoasVindas } from "@/lib/contas";
import { aplicarRenovacao, enviarEmailRenovacaoConfirmada } from "@/lib/renovacao";
import { sincronizarExtrasDaConta } from "@/lib/whatsapp-extra";

type R = { ok: boolean; mensagem: string };

/** Confirma o pagamento: cria a conta e envia o acesso por e-mail.
 *  Também aceita pedido expirado (cliente que pagou depois das 24 h). */
export async function confirmarPagamento(id: string): Promise<R> {
  const sessao = await exigirSuperAdmin();
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) return { ok: false, mensagem: "Pedido não encontrado." };
  if (pedido.status === StatusPedido.PAGO) return { ok: false, mensagem: "Este pedido já foi confirmado." };
  if (pedido.status === StatusPedido.CANCELADO) return { ok: false, mensagem: "Pedido cancelado não pode ser confirmado." };

  // WhatsApp extra comprado no meio do período (decisões #80 e #95): soma os números na conta
  if (pedido.somenteExtras && pedido.empresaId) {
    const empresa = await prisma.$transaction(async (tx) => {
      const marcado = await tx.pedido.updateMany({
        where: { id, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } },
        data: { status: StatusPedido.PAGO, confirmadoEm: new Date(), confirmadoPor: sessao.usuario.email },
      });
      if (marcado.count === 0) throw new Error("Pedido já processado.");
      return tx.empresa.update({ where: { id: pedido.empresaId! }, data: { whatsappsExtras: { increment: pedido.whatsappsExtras }, disparosExtras: { increment: pedido.pacotesDisparos } } });
    });
    if (pedido.whatsappsExtras) await sincronizarExtrasDaConta(empresa.id);
    if (pedido.pacotesDisparos) await retomarSemSaldo(empresa.id);
    revalidatePath("/pedidos");
    return { ok: true, mensagem: pedido.pacotesDisparos ? `${pedido.pacotesDisparos} disparos extras liberados para ${empresa.nome}.` : `WhatsApp extra liberado para ${empresa.nome} (${1 + empresa.whatsappsExtras} números).` };
  }

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
    // Extras da renovação: os que o cliente escolheu manter ficam; os outros saem (decisão #95, item 3)
    await sincronizarExtrasDaConta(empresa.id, pedido.manterSessoes);
    await retomarSemSaldo(empresa.id);
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
        limiteLeads: (await tx.plano.findUnique({ where: { id: pedido.planoId } }))?.limiteLeads ?? null,
        whatsappsExtras: pedido.whatsappsExtras,
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

/** Campanhas paradas por falta de saldo voltam sozinhas depois de comprar pacote ou renovar (decisão #102). */
async function retomarSemSaldo(empresaId: string) {
  await prisma.campanha.updateMany({ where: { empresaId, status: "PAUSADA", motivo: { startsWith: MOTIVO_SEM_SALDO } }, data: { status: "EM_ANDAMENTO", motivo: null } });
}
