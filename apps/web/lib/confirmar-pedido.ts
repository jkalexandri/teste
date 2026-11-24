// Confirmação de pedido pago (decisões #33, #43, #80, #102, #115): usada pelo Super Admin (tela Pedidos)
// e pelo aviso automático do Asaas (webhook — etapa C).
import "server-only";
import { ligarInteressadoAoCliente } from "@/lib/interessados";
import { prisma, Modulo, StatusPedido, MOTIVO_SEM_SALDO } from "@filapro/db";
import { criarConta, enviarEmailBoasVindas } from "@/lib/contas";
import { aplicarRenovacao, enviarEmailRenovacaoConfirmada } from "@/lib/renovacao";
import { sincronizarExtrasDaConta } from "@/lib/whatsapp-extra";

type R = { ok: boolean; mensagem: string };

/** Guarda o CPF/CNPJ de quem pagou na conta (decisão #115), para renovação, extras e pacotes. */
async function guardarDocumento(empresaId: string, cpfCnpj: string | null) {
  if (cpfCnpj) await prisma.empresa.update({ where: { id: empresaId }, data: { cpfCnpj } });
}

/** Confirma o pagamento: cria a conta (ou renova, ou libera extras) e envia o acesso por e-mail.
 *  Também aceita pedido expirado (cliente que pagou depois). "por" = quem confirmou (e-mail do Super Admin ou "Asaas"). */
export async function confirmarPedido(id: string, por: string): Promise<R> {
  const pedido = await prisma.pedido.findUnique({ where: { id } });
  if (!pedido) return { ok: false, mensagem: "Pedido não encontrado." };
  if (pedido.status === StatusPedido.PAGO) return { ok: false, mensagem: "Este pedido já foi confirmado." };
  if (pedido.status === StatusPedido.CANCELADO) return { ok: false, mensagem: "Pedido cancelado não pode ser confirmado." };

  // WhatsApp extra comprado no meio do período (decisões #80 e #95): soma os números na conta
  if (pedido.somenteExtras && pedido.empresaId) {
    const empresa = await prisma.$transaction(async (tx) => {
      const marcado = await tx.pedido.updateMany({
        where: { id, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } },
        data: { status: StatusPedido.PAGO, confirmadoEm: new Date(), confirmadoPor: por },
      });
      if (marcado.count === 0) throw new Error("Pedido já processado.");
      return tx.empresa.update({ where: { id: pedido.empresaId! }, data: { whatsappsExtras: { increment: pedido.whatsappsExtras }, disparosExtras: { increment: pedido.pacotesDisparos } } });
    });
    await guardarDocumento(empresa.id, pedido.cpfCnpj);
    if (pedido.whatsappsExtras) await sincronizarExtrasDaConta(empresa.id);
    if (pedido.pacotesDisparos) await retomarSemSaldo(empresa.id);
    return { ok: true, mensagem: pedido.pacotesDisparos ? `${pedido.pacotesDisparos} disparos extras liberados para ${empresa.nome}.` : `WhatsApp extra liberado para ${empresa.nome} (${1 + empresa.whatsappsExtras} números).` };
  }

  // Renovação (decisões #43 e #44): troca o plano, se mudou, e soma o prazo.
  if (pedido.renovacao) {
    const empresa = await prisma.$transaction(async (tx) => {
      const marcado = await tx.pedido.updateMany({
        where: { id, status: { in: [StatusPedido.AGUARDANDO, StatusPedido.EXPIRADO] } },
        data: { status: StatusPedido.PAGO, confirmadoEm: new Date(), confirmadoPor: por },
      });
      if (marcado.count === 0) throw new Error("Pedido já processado.");
      return aplicarRenovacao(pedido, tx);
    });
    // Extras da renovação: os que o cliente escolheu manter ficam; os outros saem (decisão #95, item 3)
    await guardarDocumento(empresa.id, pedido.cpfCnpj);
    await sincronizarExtrasDaConta(empresa.id, pedido.manterSessoes);
    await retomarSemSaldo(empresa.id);
    await enviarEmailRenovacaoConfirmada(pedido.nome, pedido.email, empresa, pedido.valor);
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
      data: { status: StatusPedido.PAGO, confirmadoEm: new Date(), confirmadoPor: por },
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
        // Limite de leads multiplicado pelos pacotes de usuários (decisão #113)
        limiteLeads: ((l) => (l == null ? null : l * Math.max(1, pedido.pacotes)))((await tx.plano.findUnique({ where: { id: pedido.planoId } }))?.limiteLeads ?? null),
        whatsappsExtras: pedido.whatsappsExtras,
        pacotes: pedido.pacotes,
        usuario: { nome: pedido.nome, email: pedido.email, whatsapp: pedido.whatsapp },
      },
      tx,
    );
    await tx.pedido.update({ where: { id }, data: { empresaId: c.empresa.id } });
    return c;
  });

  await guardarDocumento(conta.empresa.id, pedido.cpfCnpj);
  // Era um interessado do chat (decisão #104): a conversa vira o suporte do novo cliente
  await ligarInteressadoAoCliente(conta.usuario).catch(() => undefined);
  const enviado = await enviarEmailBoasVindas(pedido.nome, pedido.email, conta.senhaTemporaria, pedido.planoNome, pedido.modulo);
  return {
    ok: true,
    mensagem: enviado
      ? `Pagamento confirmado. Acesso enviado para ${pedido.email}.`
      : `Pagamento confirmado e conta criada, mas o e-mail não foi enviado. Use “Esqueci minha senha” para ${pedido.email}.`,
  };
}

/** Campanhas paradas por falta de saldo voltam sozinhas depois de comprar pacote ou renovar (decisão #102). */
async function retomarSemSaldo(empresaId: string) {
  await prisma.campanha.updateMany({ where: { empresaId, status: "PAUSADA", motivo: { startsWith: MOTIVO_SEM_SALDO } }, data: { status: "EM_ANDAMENTO", motivo: null } });
}
