"use server";

// Tela WhatsApp (etapa 10c — decisões #79, #80 e #95): apelido dos números e compra do WhatsApp extra por PIX.
import { revalidatePath } from "next/cache";
import { prisma, StatusPedido } from "@filapro/db";
import { obterSessao } from "@/lib/auth/session";
import { motivoSemAcesso } from "@/lib/auth/acesso";
import { criarPedidoPix, type RespostaPix } from "@/lib/pedidos";
import { avisarNovoPedido } from "@/lib/avisos-whatsapp";
import { podeTerExtras, valorProporcional } from "@/lib/whatsapp-extra";

type R = { ok: boolean; mensagem: string };

async function ator() {
  const s = await obterSessao();
  if (!s || s.precisaTrocar || motivoSemAcesso(s)) throw new Error("Acesso negado.");
  return s.usuario;
}

/** Apelido opcional do número (decisão #95, item 8). */
export async function salvarApelido(sessaoId: string, apelido: string): Promise<R> {
  const u = await ator();
  const s = await prisma.whatsappSessao.findUnique({ where: { id: sessaoId } });
  if (!s || s.usuarioId !== u.id) return { ok: false, mensagem: "Número não encontrado." };
  await prisma.whatsappSessao.update({ where: { id: sessaoId }, data: { apelido: String(apelido ?? "").trim().slice(0, 40) } });
  revalidatePath("/whatsapp");
  return { ok: true, mensagem: "Apelido salvo." };
}

/** Quanto custa mais um WhatsApp agora (proporcional aos dias que faltam) e se pode comprar. */
export async function infoExtra() {
  const u = await ator();
  if (!podeTerExtras(u) || !u.empresa?.planoId) return null;
  const plano = await prisma.plano.findUnique({ where: { id: u.empresa.planoId } });
  if (!plano || plano.gratis || plano.precoWhatsappExtra == null || plano.maxWhatsapps <= 1) return null;
  const total = 1 + u.empresa.whatsappsExtras;
  return {
    podeComprar: total < plano.maxWhatsapps,
    maximo: plano.maxWhatsapps,
    total,
    precoPeriodo: plano.precoWhatsappExtra,
    valorAgora: valorProporcional(plano.precoWhatsappExtra, u.empresa.expiraEm, u.empresa.prazoDias),
    vence: u.empresa.expiraEm.toISOString(),
  };
}

/** "Adicionar mais um WhatsApp": gera o PIX do valor proporcional (decisões #80 e #95). Liberado na confirmação em Pedidos. */
export async function comprarExtra(): Promise<{ ok: false; mensagem: string } | ({ ok: true } & RespostaPix)> {
  const u = await ator();
  const info = await infoExtra();
  if (!info || !u.empresa) return { ok: false, mensagem: "Seu plano não permite WhatsApp extra." };
  if (!info.podeComprar) return { ok: false, mensagem: `Seu plano permite no máximo ${info.maximo} WhatsApps.` };
  if (info.valorAgora <= 0) return { ok: false, mensagem: "Seu plano está vencendo: renove para adicionar números." };
  const abertos = await prisma.pedido.count({ where: { empresaId: u.empresa.id, somenteExtras: true, status: StatusPedido.AGUARDANDO, expiraEm: { gt: new Date() } } });
  if (abertos > 0) return { ok: false, mensagem: "Você já tem um pedido de WhatsApp extra aguardando pagamento." };
  const plano = await prisma.plano.findUniqueOrThrow({ where: { id: u.empresa.planoId! } });
  const r = await criarPedidoPix({
    plano,
    comprador: { nome: u.nome, email: u.email, whatsapp: u.whatsapp ?? "" },
    extras: 1,
    somenteExtras: { empresaId: u.empresa.id, valor: info.valorAgora },
  });
  if ("erro" in r) return { ok: false, mensagem: r.erro };
  await avisarNovoPedido({ codigo: r.codigo, planoNome: r.plano, valor: r.valor, renovacao: false, nome: u.nome, email: u.email, whatsapp: u.whatsapp ?? "" }).catch(() => undefined);
  return { ok: true, ...r };
}
