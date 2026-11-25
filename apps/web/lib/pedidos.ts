// Criação de pedidos (compra nova, renovação, extras, pacotes) — decisões #33, #37, #44.
// Com o Asaas ligado (decisão #115): PIX automático, boleto (+2%) ou cartão (à vista ou parcelado); sem ele, PIX manual.
import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma, type Plano } from "@filapro/db";
import { gerarPixCopiaECola } from "@/lib/pix";
import { cicloAutomatico, MAX_PARCELAS, maxQuantidade, podeParcelar, precoComQuantidade, rotuloQuantidade, valorDaForma, type FormaPagamento } from "@/lib/planos";
import { asaasLigado, clienteAsaas, criarAssinaturaAsaas, criarCobrancaAsaas, ErroAsaas } from "@/lib/asaas";
import { documentoValido, soDigitos } from "@/lib/documento";

export const VALIDADE_PEDIDO_HORAS = 24;

/** Código curto do pedido (também usado nos pedidos de cada período da cobrança automática — decisão #124). */
export function novoCodigoPedido() {
  // Sem letras/números que se confundem (0/O, 1/I).
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "FP" + Array.from(randomBytes(6), (x) => abc[x % abc.length]).join("");
}

export type RespostaPix = {
  codigo: string; plano: string; valor: number; copiaECola: string; qrCode: string; expiraEm: string; renovacao: boolean;
  /** Forma escolhida, parcelas, página de pagamento (cartão) e linha digitável (boleto) — decisão #115 */
  forma: FormaPagamento; parcelas: number; link: string | null; boletoLinha: string | null;
};

export async function criarPedidoPix(opts: {
  plano: Plano;
  comprador: { nome: string; email: string; whatsapp: string; empresaNome?: string | null };
  renovarEmpresaId?: string | null;
  /** Quantidade (decisão #113): números de WhatsApp (Individual, extras = quantidade − 1) ou pacotes de usuários (Empresarial) */
  quantidade?: number;
  /** Renovação com menos extras: números que o cliente quer manter */
  manterSessoes?: string[];
  /** Compra só de extras no meio do período: valor proporcional já calculado, conta existente */
  somenteExtras?: { empresaId: string; valor: number };
  /** Pacotes extras de disparos (decisão #102): quantos pacotes */
  pacotesDisparos?: number;
  /** Forma de pagamento, parcelas e CPF/CNPJ (decisão #115). Sem isso: PIX (do Asaas, se ligado; senão manual).
   *  "automatica": cobrança automática no cartão (decisão #124) — só cartão, plano de período fixo, compra de plano. */
  pagamento?: { forma?: FormaPagamento; parcelas?: number; cpfCnpj?: string; automatica?: boolean };
}): Promise<{ erro: string } | RespostaPix> {
  const { plano } = opts;
  if (plano.precoAtual == null) return { erro: "Plano indisponível." };
  // Compra só de extras (meio do período) usa "quantidade" como o número de extras comprados
  const qtd = Math.max(1, Math.floor(opts.quantidade ?? 1));
  const individual = plano.modulo === "INDIVIDUAL";
  const maxQ = maxQuantidade({ ...plano, modulo: plano.modulo as "INDIVIDUAL" | "EMPRESARIAL" });
  if (!opts.somenteExtras && !opts.pacotesDisparos && qtd > maxQ) {
    return { erro: individual ? `Este plano permite no máximo ${maxQ} números de WhatsApp.` : `Este plano permite no máximo ${(plano.usuarios ?? 1) * maxQ} usuários.` };
  }
  const extras = opts.somenteExtras ? qtd : individual ? qtd - 1 : 0;
  const pacotes = individual || opts.somenteExtras ? 1 : qtd;
  // Valor: plano + cada item a mais com o desconto da posição (100 + 90 + 85…)
  const valor = opts.somenteExtras ? opts.somenteExtras.valor : precoComQuantidade(plano.precoAtual, plano.descontos, qtd);
  if (valor <= 0) return { erro: "Valor inválido." };
  const config = await prisma.configVenda.findUnique({ where: { id: "config" } });
  // Forma de pagamento (decisão #115): com o Asaas ligado só as formas dele; sem, o PIX manual (reserva — item l)
  const asaas = await asaasLigado();
  let forma: FormaPagamento = opts.pagamento?.forma ?? (asaas ? "PIX" : "PIX_MANUAL");
  if (!asaas) {
    if (forma !== "PIX" && forma !== "PIX_MANUAL") return { erro: "Esta forma de pagamento não está disponível no momento. Use o PIX." };
    forma = "PIX_MANUAL";
  } else if (forma === "PIX_MANUAL") forma = "PIX";
  // Parcelas: só cartão, plano trimestral/anual, juros configurados e compra de plano (não extras nem pacotes)
  // Cobrança automática no cartão (decisão #124): sempre à vista (item a), só planos de período fixo (item c), não para extras/pacotes (item f)
  const ciclo = cicloAutomatico(plano.prazoDias);
  const automatica = forma === "CARTAO" && !!opts.pagamento?.automatica && !!ciclo && !opts.somenteExtras && !opts.pacotesDisparos;
  const parcelavel = !automatica && forma === "CARTAO" && podeParcelar(plano) && config?.jurosParcelaMes != null && !opts.somenteExtras && !opts.pacotesDisparos;
  const parcelas = parcelavel ? Math.min(MAX_PARCELAS, Math.max(1, Math.floor(opts.pagamento?.parcelas ?? 1))) : 1;
  // CPF/CNPJ de quem paga: exigido pelo Asaas; nas compras de quem já é cliente, usa o guardado na conta
  const contaId = opts.renovarEmpresaId ?? opts.somenteExtras?.empresaId ?? null;
  let cpfCnpj: string | null = null;
  if (asaas) {
    const guardado = contaId ? (await prisma.empresa.findUnique({ where: { id: contaId }, select: { cpfCnpj: true } }))?.cpfCnpj : null;
    cpfCnpj = soDigitos(opts.pagamento?.cpfCnpj || guardado || "");
    if (!documentoValido(cpfCnpj)) return { erro: "Informe um CPF ou CNPJ válido de quem vai pagar." };
  }
  const total = valorDaForma(valor, forma, parcelas, config?.jurosParcelaMes ?? null);
  if (forma === "PIX_MANUAL" && (!config?.chavePix || !config.nomeRecebedor || !config.cidadeRecebedor)) {
    return { erro: "Pagamento indisponível no momento. Tente mais tarde." };
  }
  const codigo = novoCodigoPedido();
  const pix = forma === "PIX_MANUAL"
    ? gerarPixCopiaECola({ chave: config!.chavePix, nome: config!.nomeRecebedor, cidade: config!.cidadeRecebedor, valorCentavos: total, identificador: codigo })
    : "";
  const rotulo = opts.pacotesDisparos ? `${opts.pacotesDisparos * (plano.pacoteDisparos ?? 0)} disparos extras (${plano.nome})` : opts.somenteExtras ? `${extras} WhatsApp extra${extras > 1 ? "s" : ""} (${plano.nome})` : qtd > 1 ? `${plano.nome} — ${rotuloQuantidade({ modulo: plano.modulo as "INDIVIDUAL" | "EMPRESARIAL", usuarios: plano.usuarios }, qtd)}` : plano.nome;
  // Validade do pedido: boleto vence em 3 dias e compensa em até 3 dias úteis; os outros, 24 horas
  const horas = forma === "BOLETO" ? 6 * 24 : VALIDADE_PEDIDO_HORAS;
  const pedido = await prisma.pedido.create({
    data: {
      codigo,
      renovacao: !!opts.renovarEmpresaId,
      empresaId: opts.renovarEmpresaId ?? opts.somenteExtras?.empresaId ?? null,
      whatsappsExtras: extras,
      pacotes,
      somenteExtras: !!opts.somenteExtras,
      pacotesDisparos: (opts.pacotesDisparos ?? 0) * (plano.pacoteDisparos ?? 0),
      manterSessoes: opts.manterSessoes ?? [],
      planoId: plano.id,
      planoNome: plano.nome,
      modulo: plano.modulo,
      // Total de usuários do pedido (pacote × quantidade)
      usuarios: plano.usuarios != null ? plano.usuarios * pacotes : null,
      prazoDias: plano.prazoDias,
      valor: total,
      forma,
      parcelas,
      automatica,
      cpfCnpj,
      nome: opts.comprador.nome,
      email: opts.comprador.email.toLowerCase(),
      whatsapp: opts.comprador.whatsapp,
      empresaNome: opts.comprador.empresaNome ?? null,
      pixCopiaECola: pix,
      expiraEm: new Date(Date.now() + horas * 3600 * 1000),
    },
  });
  // Cobrança no Asaas (decisão #115): se falhar, o pedido não fica pendurado
  let link: string | null = null;
  let boletoLinha: string | null = null;
  let copiaECola = pix;
  let qrCode = "";
  if (forma !== "PIX_MANUAL") {
    try {
      const cliente = await clienteAsaas({ nome: opts.comprador.nome, email: opts.comprador.email, cpfCnpj: cpfCnpj!, whatsapp: opts.comprador.whatsapp });
      if (automatica) {
        // Assinatura no Asaas: o cliente paga a 1ª cobrança na página do Asaas e o cartão fica guardado (decisão #124)
        const a = await criarAssinaturaAsaas({ clienteId: cliente, valor: total, ciclo: ciclo!, referencia: codigo, descricao: `FilaPro Leads — ${rotulo} (cobrança automática, pedido ${codigo})` });
        link = a.link;
        await prisma.pedido.update({ where: { id: pedido.id }, data: { asaasId: a.cobrancaId, asaasAssinaturaId: a.id, linkPagamento: link } });
      } else {
        const c = await criarCobrancaAsaas({
          clienteId: cliente, forma, valor: total, parcelas, referencia: codigo,
          descricao: `FilaPro Leads — ${rotulo} (pedido ${codigo})`,
          vencimentoDias: forma === "BOLETO" ? 3 : 1,
        });
        link = forma === "BOLETO" ? c.boletoLink ?? c.link : c.link;
        boletoLinha = c.boletoLinha ?? null;
        copiaECola = c.pix?.payload ?? "";
        qrCode = c.pix?.imagem ?? "";
        await prisma.pedido.update({ where: { id: pedido.id }, data: { asaasId: c.id, linkPagamento: link, boletoLinha, pixCopiaECola: copiaECola } });
      }
    } catch (e) {
      await prisma.pedido.delete({ where: { id: pedido.id } }).catch(() => undefined);
      console.error("[asaas] falha ao criar a cobrança", e);
      return { erro: e instanceof ErroAsaas ? `Não foi possível gerar o pagamento: ${e.message}` : "Não foi possível gerar o pagamento agora. Tente de novo em instantes." };
    }
  } else {
    qrCode = await QRCode.toDataURL(pix, { margin: 1, width: 240 });
  }
  return {
    codigo: pedido.codigo,
    plano: rotulo,
    valor: pedido.valor,
    copiaECola,
    qrCode,
    forma,
    parcelas,
    link,
    boletoLinha,
    expiraEm: pedido.expiraEm.toISOString(),
    renovacao: pedido.renovacao,
  };
}

/** Forma de pagamento enviada pela tela (decisão #115): forma, parcelas e CPF/CNPJ. */
export function lerPagamento(c: Record<string, unknown>) {
  const f = String(c.forma ?? "");
  const forma = (["PIX", "BOLETO", "CARTAO", "PIX_MANUAL"] as const).find((x) => x === f);
  return { forma, parcelas: Math.max(1, Math.min(6, Math.floor(Number(c.parcelas) || 1))), cpfCnpj: String(c.cpfCnpj ?? "").slice(0, 20), automatica: c.automatica === true };
}
