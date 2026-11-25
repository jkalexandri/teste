// Upgrade de conta dentro do sistema (decisão #125): o dono troca para um plano igual ou maior quando quiser.
// Preço: valor cheio do plano novo; os dias que faltavam são somados ao prazo novo (Free: começa hoje);
// entre dois planos por disparo, os disparos que sobraram também passam para o novo período.
import "server-only";
import { prisma, Cargo, Modulo, saldoDisparos, type Empresa, type Plano } from "@filapro/db";
import { precoComQuantidade } from "@/lib/planos";
import { quantidadeDaConta } from "@/lib/assinatura";

/** Dono da conta (item a): usuário do plano Individual ou Admin da Empresa. */
export const ehDonoDaConta = (u: { cargo: Cargo; empresa: Pick<Empresa, "modulo"> | null }) =>
  !!u.empresa && ((u.empresa.modulo === Modulo.INDIVIDUAL && u.cargo === Cargo.USUARIO) || (u.empresa.modulo === Modulo.EMPRESARIAL && u.cargo === Cargo.ADMIN_EMPRESA));

/** Custo por mês (item j): preço do período com a quantidade ÷ dias do período × 30, em centavos. */
export const custoMensal = (p: Pick<Plano, "precoAtual" | "descontos" | "prazoDias">, quantidade: number) =>
  p.precoAtual == null || p.precoAtual <= 0 ? 0 : (precoComQuantidade(p.precoAtual, p.descontos, quantidade) / Math.max(1, p.prazoDias)) * 30;

/** Custo por mês do que a conta tem hoje (Free ou sem plano: 0). */
export async function custoAtual(e: Empresa) {
  const plano = e.planoId ? await prisma.plano.findUnique({ where: { id: e.planoId } }) : null;
  return { plano, custo: plano && !plano.gratis ? custoMensal({ ...plano, prazoDias: e.prazoDias }, quantidadeDaConta(e)) : 0 };
}

/** Plano de venda do mesmo módulo, com preço. */
const vendavel = (p: Plano, e: Empresa) => p.visivel && !p.gratis && !p.personalizado && p.precoAtual != null && p.precoAtual > 0 && p.modulo === e.modulo;

/**
 * Plano igual ou maior (itens e e j): custa por mês o mesmo ou mais que o atual, na quantidade escolhida.
 * Devolve a mensagem de erro, ou null se pode.
 */
export async function conferirUpgrade(e: Empresa, plano: Plano, quantidade: number): Promise<string | null> {
  if (!vendavel(plano, e)) return "Plano indisponível para esta conta.";
  const { custo } = await custoAtual(e);
  // Meio centavo de folga para arredondamentos
  if (custoMensal(plano, quantidade) + 0.5 < custo) return "Esse plano é menor que o atual. Para um plano menor, aguarde a renovação.";
  return null;
}

/** Dados da tela de upgrade: a conta (como na renovação) e os planos iguais ou maiores. */
export async function dadosUpgrade(e: Empresa) {
  const { plano: atual, custo } = await custoAtual(e);
  const qtdAtual = quantidadeDaConta(e);
  const todos = await prisma.plano.findMany({ where: { modulo: e.modulo }, orderBy: { ordem: "asc" } });
  // Aparece o plano que, na quantidade atual da conta, custa por mês o mesmo ou mais (no cartão ainda dá para aumentar a quantidade)
  const planos = todos.filter((p) => vendavel(p, e) && custoMensal(p, qtdAtual) + 0.5 >= custo);
  // WhatsApps extras da conta Individual (decisão #95): o cliente escolhe quais ficam se diminuir (como na renovação)
  const dono = e.modulo === Modulo.INDIVIDUAL ? await prisma.usuario.findFirst({ where: { empresaId: e.id, cargo: Cargo.USUARIO } }) : null;
  const numerosExtras = dono
    ? (await prisma.whatsappSessao.findMany({ where: { usuarioId: dono.id, bloqueada: false, id: { not: dono.id } }, orderBy: { ordem: "asc" } }))
        .slice(0, e.whatsappsExtras)
        .map((s, i) => ({ id: s.id, rotulo: s.apelido || (s.numero ? `+${s.numero}` : `WhatsApp ${i + 2}`) }))
    : [];
  // Disparos que sobraram (só plano por disparo pago — o Free não passa sobras: item d)
  const saldo = atual && !atual.gratis ? await saldoDisparos(prisma, e) : null;
  return {
    conta: {
      nome: e.nome,
      pacote: e.pacote,
      planoId: e.planoId,
      expiraEm: e.expiraEm.toISOString(),
      extras: e.modulo === Modulo.INDIVIDUAL ? e.whatsappsExtras : 0,
      numerosExtras,
      modulo: e.modulo as "INDIVIDUAL" | "EMPRESARIAL",
      pacotes: e.pacotes,
      documentoFinal: e.cpfCnpj ? `final ${e.cpfCnpj.slice(-2)}` : null,
      // Para o resumo antes de pagar (item da prévia)
      gratis: !!atual?.gratis,
      sobraDisparos: saldo ? saldo.restantes : null,
    },
    planos: planos.map(({ criadoEm, atualizadoEm, ...p }) => p),
  };
}
