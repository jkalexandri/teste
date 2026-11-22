// Renovação de pacotes (decisões #36, #40, #42–#44).
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma, Cargo, Modulo, type Empresa, type Pedido, type Prisma } from "@filapro/db";
import { enviarEmail } from "@/lib/email";
import { novoVencimento } from "@/lib/contas";
import { formatarReais } from "@/lib/planos";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br";

/** Quem renova: o Admin da Empresa (Empresarial) ou o próprio usuário (Individual). */
export async function responsavelDaConta(empresa: Pick<Empresa, "id" | "modulo">) {
  return prisma.usuario.findFirst({
    where: { empresaId: empresa.id, cargo: empresa.modulo === Modulo.EMPRESARIAL ? Cargo.ADMIN_EMPRESA : Cargo.USUARIO },
    orderBy: { criadoEm: "asc" },
  });
}

/** Garante um token de renovação para a conta e devolve o link. */
export async function linkRenovacao(empresaId: string) {
  const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!e) return null;
  let token = e.tokenRenovacao;
  if (!token) {
    token = randomBytes(24).toString("base64url");
    await prisma.empresa.update({ where: { id: empresaId }, data: { tokenRenovacao: token } });
  }
  return `${SITE}/renovar/${token}`;
}

export async function enviarAvisoRenovacao(empresa: Empresa, diasRestantes: number) {
  const resp = await responsavelDaConta(empresa);
  if (!resp) return false;
  const link = await linkRenovacao(empresa.id);
  const data = empresa.expiraEm.toLocaleDateString("pt-BR");
  const quando = diasRestantes <= 0 ? "vence hoje" : `vence em ${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"} (${data})`;
  const texto =
    `Olá, ${resp.nome}.\n\nO acesso de ${empresa.nome} ao FilaPro Leads (plano ${empresa.pacote}) ${quando}.\n\n` +
    `Para renovar — e, se quiser, trocar de plano — acesse:\n${link}\n\nO pagamento é por PIX.`;
  const html =
    `<p>Olá, ${resp.nome}.</p><p>O acesso de <b>${empresa.nome}</b> ao <b>FilaPro Leads</b> (plano ${empresa.pacote}) <b>${quando}</b>.</p>` +
    `<p><a href="${link}" style="display:inline-block;background:#0e9f5a;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700">Renovar agora</a></p>` +
    `<p>Se quiser, você pode trocar de plano na renovação. O pagamento é por PIX.</p>`;
  // Decisão #42: também pelo WhatsApp (número da plataforma), quando o responsável tem WhatsApp cadastrado.
  if (resp.whatsapp) await enviarPelaPlataforma(resp.whatsapp, texto);
  return enviarEmail({ para: resp.email, assunto: `Renove seu acesso ao FilaPro Leads — ${quando}`, texto, html });
}

/** Aplica um pedido de renovação confirmado: troca o plano (se mudou) e soma o prazo. */
export async function aplicarRenovacao(pedido: Pedido, tx: Prisma.TransactionClient) {
  if (!pedido.empresaId) throw new Error("Pedido de renovação sem conta.");
  const e = await tx.empresa.findUnique({ where: { id: pedido.empresaId } });
  if (!e) throw new Error("Conta da renovação não encontrada.");
  const plano = await tx.plano.findUnique({ where: { id: pedido.planoId } });
  return tx.empresa.update({
    where: { id: e.id },
    data: {
      pacote: pedido.planoNome,
      planoId: pedido.planoId,
      // Individual: sempre 1. Empresarial: usuários do novo plano (existentes continuam — decisão #24).
      limiteUsuarios: e.modulo === Modulo.INDIVIDUAL ? 1 : pedido.usuarios ?? e.limiteUsuarios,
      prazoDias: pedido.prazoDias,
      expiraEm: novoVencimento(e.expiraEm, pedido.prazoDias),
      // Plano pago não tem limite de disparos do teste grátis.
      limiteDisparos: plano?.gratis ? e.limiteDisparos : null,
      // Trocou de plano: passa a valer o limite de leads do novo plano (decisão #58).
      // Trocou de plano: também os limites de treinamento da IA (decisão #77).
      ...(plano && plano.id !== e.planoId ? { limiteLeads: plano.limiteLeads, limiteMateriais: plano.limiteMateriais, limitePaginasMes: plano.limitePaginasMes } : {}),
      // Novo ciclo: zera os avisos e o link.
      tokenRenovacao: null,
      avisoRenovacao10Em: null,
      avisoRenovacao3Em: null,
    },
  });
}

export async function enviarEmailRenovacaoConfirmada(nome: string, email: string, empresa: Empresa, valor: number) {
  const data = empresa.expiraEm.toLocaleDateString("pt-BR");
  const texto =
    `Olá, ${nome}.\n\nRecebemos o pagamento de ${formatarReais(valor)}. O acesso de ${empresa.nome} ` +
    `(plano ${empresa.pacote}) foi renovado até ${data}.\n\nEndereço: ${SITE}`;
  const html =
    `<p>Olá, ${nome}.</p><p>Recebemos o pagamento de <b>${formatarReais(valor)}</b>. O acesso de <b>${empresa.nome}</b> ` +
    `(plano ${empresa.pacote}) foi renovado até <b>${data}</b>.</p><p><a href="${SITE}">${SITE}</a></p>`;
  return enviarEmail({ para: email, assunto: "Renovação confirmada — FilaPro Leads", texto, html });
}
