"use server";

// Ações do Super Admin sobre os pedidos (decisão #33: confirmação manual do PIX).
import { revalidatePath } from "next/cache";
import { prisma, StatusPedido } from "@filapro/db";
import { exigirSuperAdmin } from "@/lib/auth/exigir";
import { confirmarPedido } from "@/lib/confirmar-pedido";
import { apagarCobrancaAsaas } from "@/lib/asaas";

type R = { ok: boolean; mensagem: string };

/** Confirma o pagamento à mão (PIX manual ou quando o aviso do Asaas não chegou). */
export async function confirmarPagamento(id: string): Promise<R> {
  const sessao = await exigirSuperAdmin();
  const r = await confirmarPedido(id, sessao.usuario.email);
  revalidatePath("/pedidos");
  return r;
}

export async function cancelarPedido(id: string): Promise<R> {
  await exigirSuperAdmin();
  // Cobrança no Asaas (decisão #115) é apagada junto
  const p = await prisma.pedido.findUnique({ where: { id }, select: { asaasId: true, status: true } });
  const r = await prisma.pedido.updateMany({
    where: { id, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } },
    data: { status: StatusPedido.CANCELADO, canceladoEm: new Date() },
  });
  if (r.count && p?.asaasId) await apagarCobrancaAsaas(p.asaasId);
  revalidatePath("/pedidos");
  return r.count ? { ok: true, mensagem: "Pedido cancelado." } : { ok: false, mensagem: "Este pedido não pode ser cancelado." };
}
