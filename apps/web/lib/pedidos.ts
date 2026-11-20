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
}): Promise<{ erro: string } | RespostaPix> {
  const { plano } = opts;
  if (plano.precoAtual == null) return { erro: "Plano indisponível." };
  const config = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (!config?.chavePix || !config.nomeRecebedor || !config.cidadeRecebedor) {
    return { erro: "Pagamento indisponível no momento. Tente mais tarde." };
  }
  const codigo = novoCodigo();
  const pix = gerarPixCopiaECola({
    chave: config.chavePix,
    nome: config.nomeRecebedor,
    cidade: config.cidadeRecebedor,
    valorCentavos: plano.precoAtual,
    identificador: codigo,
  });
  const pedido = await prisma.pedido.create({
    data: {
      codigo,
      renovacao: !!opts.renovarEmpresaId,
      empresaId: opts.renovarEmpresaId ?? null,
      planoId: plano.id,
      planoNome: plano.nome,
      modulo: plano.modulo,
      usuarios: plano.usuarios,
      prazoDias: plano.prazoDias,
      valor: plano.precoAtual,
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
    plano: plano.nome,
    valor: pedido.valor,
    copiaECola: pix,
    qrCode: await QRCode.toDataURL(pix, { margin: 1, width: 240 }),
    expiraEm: pedido.expiraEm.toISOString(),
    renovacao: pedido.renovacao,
  };
}
