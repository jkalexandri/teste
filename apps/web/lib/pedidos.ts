// Criação de pedidos com PIX (compra nova ou renovação) — decisões #33, #37, #44.
import "server-only";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { prisma, type Plano } from "@filapro/db";
import { gerarPixCopiaECola } from "@/lib/pix";
import { maxQuantidade, precoComQuantidade, rotuloQuantidade } from "@/lib/planos";

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
  /** Quantidade (decisão #113): números de WhatsApp (Individual, extras = quantidade − 1) ou pacotes de usuários (Empresarial) */
  quantidade?: number;
  /** Renovação com menos extras: números que o cliente quer manter */
  manterSessoes?: string[];
  /** Compra só de extras no meio do período: valor proporcional já calculado, conta existente */
  somenteExtras?: { empresaId: string; valor: number };
  /** Pacotes extras de disparos (decisão #102): quantos pacotes */
  pacotesDisparos?: number;
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
    plano: opts.pacotesDisparos ? `${opts.pacotesDisparos * (plano.pacoteDisparos ?? 0)} disparos extras (${plano.nome})` : opts.somenteExtras ? `${extras} WhatsApp extra${extras > 1 ? "s" : ""} (${plano.nome})` : qtd > 1 ? `${plano.nome} — ${rotuloQuantidade({ modulo: plano.modulo as "INDIVIDUAL" | "EMPRESARIAL", usuarios: plano.usuarios }, qtd)}` : plano.nome,
    valor: pedido.valor,
    copiaECola: pix,
    qrCode: await QRCode.toDataURL(pix, { margin: 1, width: 240 }),
    expiraEm: pedido.expiraEm.toISOString(),
    renovacao: pedido.renovacao,
  };
}
