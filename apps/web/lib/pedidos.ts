// Criação de pedidos com PIX (compra nova ou renovação) — decisões #33, #37, #44.
import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma, type Plano } from "@filapro/db";
import { gerarPixCopiaECola } from "@/lib/pix";

export const VALIDADE_PEDIDO_HORAS = 24;

function novoCodigo() {
  // Sem letras/números que se confundem (0/O, 1/I).
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "FP" + Array.from(randomBytes(6), (x) => abc[x % abc.length]).join("");
}

export type RespostaPix = { codigo: string; plano: string; valor: number; copiaECola: string; qrCode: string; expiraEm: string; renovacao: boolean };

export async function criarPedidoPix(opts: {
  plano: Plano;
  comprador: { nome: string; email: string; whatsapp: string; empresaNome?: string | null };
  renovarEmpresaId?: string | null;
  /** WhatsApps extras (Individual — decisões #80 e #95): somados ao valor do plano */
  extras?: number;
  /** Renovação com menos extras: números que o cliente quer manter */
  manterSessoes?: string[];
  /** Compra só de extras no meio do período: valor proporcional já calculado, conta existente */
  somenteExtras?: { empresaId: string; valor: number };
  /** Pacotes extras de disparos (decisão #102): quantos pacotes */
  pacotesDisparos?: number;
}): Promise<{ erro: string } | RespostaPix> {
  const { plano } = opts;
  if (plano.precoAtual == null) return { erro: "Plano indisponível." };
  const extras = Math.max(0, Math.floor(opts.extras ?? 0));
  if (extras && (plano.modulo !== "INDIVIDUAL" || plano.gratis || plano.precoWhatsappExtra == null || 1 + extras > plano.maxWhatsapps)) {
    return { erro: `Este plano permite no máximo ${plano.maxWhatsapps} WhatsApp${plano.maxWhatsapps > 1 ? "s" : ""}.` };
  }
  const valor = opts.somenteExtras ? opts.somenteExtras.valor : plano.precoAtual + extras * (plano.precoWhatsappExtra ?? 0);
  if (valor <= 0) return { erro: "Valor inválido." };
  const config = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (!config?.chavePix || !config.nomeRecebedor || !config.cidadeRecebedor) {
    return { erro: "Pagamento indisponível no momento. Tente mais tarde." };
  }
  const codigo = novoCodigo();
  const pix = gerarPixCopiaECola({
    chave: config.chavePix,
    nome: config.nomeRecebedor,
    cidade: config.cidadeRecebedor,
    valorCentavos: valor,
    identificador: codigo,
  });
  const pedido = await prisma.pedido.create({
    data: {
      codigo,
      renovacao: !!opts.renovarEmpresaId,
      empresaId: opts.renovarEmpresaId ?? opts.somenteExtras?.empresaId ?? null,
      whatsappsExtras: extras,
      somenteExtras: !!opts.somenteExtras,
      pacotesDisparos: (opts.pacotesDisparos ?? 0) * (plano.pacoteDisparos ?? 0),
      manterSessoes: opts.manterSessoes ?? [],
      planoId: plano.id,
      planoNome: plano.nome,
      modulo: plano.modulo,
      usuarios: plano.usuarios,
      prazoDias: plano.prazoDias,
      valor,
      nome: opts.comprador.nome,
      email: opts.comprador.email.toLowerCase(),
      whatsapp: opts.comprador.whatsapp,
      empresaNome: opts.comprador.empresaNome ?? null,
      pixCopiaECola: pix,
      expiraEm: new Date(Date.now() + VALIDADE_PEDIDO_HORAS * 3600 * 1000),
    },
  });
  // TODO etapa 6: avisar o Super Admin pelo WhatsApp (decisão #38).
  return {
    codigo: pedido.codigo,
    plano: opts.pacotesDisparos ? `${opts.pacotesDisparos * (plano.pacoteDisparos ?? 0)} disparos extras (${plano.nome})` : opts.somenteExtras ? `${extras} WhatsApp extra${extras > 1 ? "s" : ""} (${plano.nome})` : extras ? `${plano.nome} + ${extras} WhatsApp extra${extras > 1 ? "s" : ""}` : plano.nome,
    valor: pedido.valor,
    copiaECola: pix,
    qrCode: await QRCode.toDataURL(pix, { margin: 1, width: 240 }),
    expiraEm: pedido.expiraEm.toISOString(),
    renovacao: pedido.renovacao,
  };
}
