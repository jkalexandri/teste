// Cobrança automática no cartão (decisão #124, etapa D do Asaas): assinatura no Asaas ligada à conta.
// - Liga: quando o 1º pagamento de um pedido automático é confirmado (a assinatura do pedido passa para a conta).
// - Acompanha: valor, período e data do próximo vencimento seguem a conta (item d), depois de cada mudança.
// - Desliga: pelo dono da conta, pelo Super Admin, ou sozinha quando o plano deixa de ter período fixo (item c).
import "server-only";
import { prisma, Modulo, StatusPedido, type Empresa, type Pedido } from "@filapro/db";
import { atualizarAssinaturaAsaas, cancelarAssinaturaAsaas, ErroAsaas } from "@/lib/asaas";
import { cicloAutomatico, precoComQuantidade } from "@/lib/planos";
import { registrarLog } from "@/lib/logs";
import { enviarEmail } from "@/lib/email";
import { responsavelDaConta } from "@/lib/renovacao";
import { novoCodigoPedido } from "@/lib/pedidos";

/** Quantidade contratada pela conta: números de WhatsApp (Individual) ou pacotes de usuários (Empresarial). */
export const quantidadeDaConta = (e: Pick<Empresa, "modulo" | "whatsappsExtras" | "pacotes">) =>
  e.modulo === Modulo.INDIVIDUAL ? 1 + e.whatsappsExtras : Math.max(1, e.pacotes);

/** Valor e período que a assinatura deve ter agora (null = o plano não permite cobrança automática). */
export async function assinaturaEsperada(e: Empresa) {
  const plano = e.planoId ? await prisma.plano.findUnique({ where: { id: e.planoId } }) : null;
  if (!plano || plano.precoAtual == null || plano.precoAtual <= 0 || plano.gratis) return null;
  const ciclo = cicloAutomatico(e.prazoDias);
  if (!ciclo) return null;
  return { plano, ciclo, valor: precoComQuantidade(plano.precoAtual, plano.descontos, quantidadeDaConta(e)) };
}

/** Atualiza a assinatura no Asaas para o próximo período (item d). Plano sem período fixo: desliga e avisa o dono (item c).
 *  Nunca interrompe a ação que a chamou (erros ficam no log). */
export async function sincronizarAssinatura(empresaId: string) {
  try {
    const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (!e?.asaasAssinaturaId) return;
    const esperado = await assinaturaEsperada(e);
    if (!esperado) {
      await desligarAssinatura(empresaId, null, "o plano atual não tem período fixo (mensal, trimestral, semestral ou anual)");
      return;
    }
    // Próxima cobrança no dia do vencimento (item b)
    await atualizarAssinaturaAsaas(e.asaasAssinaturaId, { valor: esperado.valor, ciclo: esperado.ciclo, proximaData: e.expiraEm });
  } catch (err) {
    console.error("[assinatura] não foi possível atualizar a assinatura no Asaas", empresaId, err);
  }
}

/** 1º pagamento confirmado: a assinatura do pedido passa a ser a cobrança automática da conta. */
export async function ligarAssinatura(pedido: Pick<Pedido, "empresaId" | "asaasAssinaturaId" | "codigo">) {
  if (!pedido.empresaId || !pedido.asaasAssinaturaId) return;
  const e = await prisma.empresa.findUnique({ where: { id: pedido.empresaId } });
  if (!e || e.asaasAssinaturaId === pedido.asaasAssinaturaId) return sincronizarAssinatura(pedido.empresaId);
  // Já tinha outra assinatura (ex.: contratou de novo): a antiga é cancelada para não cobrar duas vezes
  if (e.asaasAssinaturaId) await cancelarAssinaturaAsaas(e.asaasAssinaturaId).catch((err) => console.error("[assinatura] cancelar a antiga", err));
  await prisma.empresa.update({ where: { id: e.id }, data: { asaasAssinaturaId: pedido.asaasAssinaturaId } });
  await registrarLog(null, "PAGAMENTOS", `Cobrança automática no cartão ligada para ${e.nome} (pedido ${pedido.codigo}).`, null);
  await sincronizarAssinatura(e.id);
}

/**
 * Desliga a cobrança automática (item e): cancela no Asaas e tira da conta. O acesso continua até o vencimento.
 * "por" = quem desligou (sessão) ou null (sistema). "motivo" (sistema) vai no e-mail ao dono.
 */
export async function desligarAssinatura(empresaId: string, por: { id: string; nome: string; email: string; empresaId: string | null } | null, motivo?: string) {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!e?.asaasAssinaturaId) return { ok: false, mensagem: "A cobrança automática já está desligada." };
  try {
    await cancelarAssinaturaAsaas(e.asaasAssinaturaId);
  } catch (err) {
    // Assinatura que já não existe no Asaas (404) pode ser tirada da conta; outro erro: não desliga
    if (!(err instanceof ErroAsaas && err.status === 404)) {
      return { ok: false, mensagem: err instanceof ErroAsaas ? `Não foi possível desligar agora: ${err.message}` : "Não foi possível desligar agora. Tente de novo em instantes." };
    }
  }
  await prisma.empresa.update({ where: { id: e.id }, data: { asaasAssinaturaId: null } });
  await registrarLog(por, "PAGAMENTOS", `Cobrança automática no cartão desligada para ${e.nome}${por ? "" : ` (${motivo ?? "sistema"})`}.`, por ? por.empresaId : null);
  const data = e.expiraEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  if (!por && motivo) {
    const resp = await responsavelDaConta(e);
    if (resp) {
      await enviarEmail({
        para: resp.email,
        assunto: "Cobrança automática do FilaPro Leads desligada",
        texto: `Olá, ${resp.nome}.\n\nA cobrança automática no cartão de ${e.nome} foi desligada porque ${motivo}.\nSeu acesso continua até ${data}; a renovação volta a ser pelo link enviado perto do vencimento.`,
        html: `<p>Olá, ${resp.nome}.</p><p>A cobrança automática no cartão de <b>${e.nome}</b> foi desligada porque ${motivo}.</p><p>Seu acesso continua até <b>${data}</b>; a renovação volta a ser pelo link enviado perto do vencimento.</p>`,
      }).catch(() => undefined);
    }
  }
  return { ok: true, mensagem: `Cobrança automática desligada. O acesso continua até ${data}.` };
}

/** Pedido de renovação de um novo período da assinatura (item 3 da prévia), criado quando o Asaas gera a cobrança. */
export async function pedidoDoPeriodo(e: Empresa, cobranca: { id: string; value?: number; dueDate?: string }) {
  const esperado = await assinaturaEsperada(e);
  const plano = esperado?.plano ?? (e.planoId ? await prisma.plano.findUnique({ where: { id: e.planoId } }) : null);
  if (!plano) return null;
  const resp = await responsavelDaConta(e);
  if (!resp) return null;
  const qtd = quantidadeDaConta(e);
  const vence = cobranca.dueDate ? new Date(`${cobranca.dueDate}T23:59:59-03:00`) : e.expiraEm;
  try {
    return await prisma.pedido.create({
      data: {
        codigo: novoCodigoPedido(),
        status: StatusPedido.AGUARDANDO,
        renovacao: true,
        empresaId: e.id,
        planoId: plano.id,
        planoNome: plano.nome,
        modulo: e.modulo,
        usuarios: plano.usuarios != null ? plano.usuarios * (e.modulo === Modulo.INDIVIDUAL ? 1 : qtd) : null,
        pacotes: e.modulo === Modulo.INDIVIDUAL ? 1 : qtd,
        whatsappsExtras: e.modulo === Modulo.INDIVIDUAL ? qtd - 1 : 0,
        prazoDias: e.prazoDias,
        valor: Math.round((cobranca.value ?? 0) * 100) || esperado?.valor || 0,
        forma: "CARTAO",
        parcelas: 1,
        cpfCnpj: e.cpfCnpj,
        automatica: true,
        asaasId: cobranca.id,
        asaasAssinaturaId: e.asaasAssinaturaId,
        nome: resp.nome,
        email: resp.email,
        whatsapp: resp.whatsapp ?? "",
        empresaNome: e.modulo === Modulo.EMPRESARIAL ? e.nome : null,
        pixCopiaECola: "",
        // Fica "aguardando" até o dia da cobrança (+1 dia de folga)
        expiraEm: new Date(vence.getTime() + 86_400_000),
      },
    });
  } catch {
    // Outro aviso da mesma cobrança criou ao mesmo tempo (asaasId é único)
    return prisma.pedido.findUnique({ where: { asaasId: cobranca.id } });
  }
}
