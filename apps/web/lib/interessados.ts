// Chat para interessados (decisão #104): regras do site — código do aparelho (cookie de 30 dias), limites contra robôs,
// gravação das mensagens e avisos ao Super Admin.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma, Cargo } from "@filapro/db";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";
import { chamarWorker, guardarArquivoNoWorker } from "@/lib/worker";
import { ONLINE_MS, MAX_ANEXO_SUPORTE } from "@/lib/suporte";

export const COOKIE_INTERESSADO = "filapro_interessado";
export const DIAS_COOKIE = 30;
export const MAX_TEXTO_VISITANTE = 1000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export type MsgInteressado = { id: string; autor: "VISITANTE" | "IA" | "SUPORTE"; texto: string; tipo: string; arquivoNome: string | null; criadoEm: string };

// Limites contra robôs: lib/limite-acesso.ts (decisão #105)
export { dentroDoLimite, ipDoPedido } from "@/lib/limite-acesso";

/** Visitante do aparelho atual (pelo cookie), ou null. */
export async function interessadoAtual() {
  const t = (await cookies()).get(COOKIE_INTERESSADO)?.value;
  if (!t) return null;
  return prisma.interessado.findUnique({ where: { tokenHash: hash(t) } });
}

/** Começa a conversa: grava o visitante e o código do aparelho (30 dias). */
export async function criarInteressado(d: { nome: string; whatsapp: string; email: string | null; ip: string }) {
  const token = randomBytes(32).toString("base64url");
  const it = await prisma.interessado.create({ data: { tokenHash: hash(token), nome: d.nome, whatsapp: d.whatsapp, email: d.email, aceitouEm: new Date(), ip: d.ip } });
  (await cookies()).set(COOKIE_INTERESSADO, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DIAS_COOKIE * 86400 });
  return it;
}

/** WhatsApp do formulário: só números, com 55 quando for do Brasil (10 ou 11 dígitos). */
export function normalizarWhatsapp(bruto: string) {
  let n = bruto.replace(/\D/g, "");
  if (n.length === 10 || n.length === 11) n = "55" + n;
  return n.length >= 12 && n.length <= 15 ? n : "";
}

export async function mensagensDoInteressado(id: string, desde?: string | null): Promise<MsgInteressado[]> {
  const d = desde ? new Date(desde) : null;
  const ms = await prisma.interessadoMensagem.findMany({
    where: { interessadoId: id, ...(d && !isNaN(+d) ? { criadoEm: { gt: d } } : {}) },
    orderBy: { criadoEm: "asc" },
    take: 300,
  });
  return ms.map((m) => ({ id: m.id, autor: m.autor as MsgInteressado["autor"], texto: m.texto, tipo: m.tipo, arquivoNome: m.arquivoNome, criadoEm: m.criadoEm.toISOString() }));
}

const TIPOS_ANEXO: Record<string, string> = { "image/jpeg": "imagem", "image/png": "imagem", "application/pdf": "documento" };

/** Resposta do Super Admin (assume a conversa: a IA para). Se o visitante não estiver com o chat aberto, vai também pelo WhatsApp. */
export async function responderComoSuporte(id: string, autorId: string, texto: string, arquivo: File | null) {
  texto = texto.trim().slice(0, 4000);
  if (!texto && !arquivo) return { ok: false as const, mensagem: "Escreva a mensagem ou escolha um arquivo." };
  if (arquivo) {
    if (!TIPOS_ANEXO[arquivo.type]) return { ok: false as const, mensagem: "Envie imagem (JPG/PNG) ou PDF." };
    if (arquivo.size > MAX_ANEXO_SUPORTE) return { ok: false as const, mensagem: "Arquivo muito grande (máximo 15 MB)." };
  }
  const it = await prisma.interessado.findUnique({ where: { id } });
  if (!it) return { ok: false as const, mensagem: "Conversa não encontrada." };
  const m = await prisma.interessadoMensagem.create({
    data: { interessadoId: id, autor: "SUPORTE", autorId, texto, tipo: arquivo ? TIPOS_ANEXO[arquivo.type]! : "texto", arquivoNome: arquivo?.name.slice(0, 120) ?? null, arquivoTipo: arquivo?.type ?? null },
  });
  if (arquivo) {
    const g = await guardarArquivoNoWorker(`int-${m.id}`, await arquivo.arrayBuffer());
    if (!g.ok) { await prisma.interessadoMensagem.delete({ where: { id: m.id } }); return { ok: false as const, mensagem: g.mensagem }; }
  }
  await prisma.interessado.update({ where: { id }, data: { ultimaMensagemEm: new Date(), naoLidasVisitante: { increment: 1 }, iaPausada: true, iaPausaMotivo: "Assumida pelo Super Admin", naoLidasSuporte: 0 } });
  const online = it.vistoEm && Date.now() - it.vistoEm.getTime() < ONLINE_MS;
  if (!online) {
    const site = process.env.NEXT_PUBLIC_SITE_URL || "https://filaproleads.com.br";
    await enviarPelaPlataforma(it.whatsapp, `FilaPro Leads: ${texto || "(enviamos um arquivo)"}\n\nContinue a conversa em ${site} → Planos → Fale conosco.`, { prioridade: "alta" }).catch(() => undefined);
  }
  return { ok: true as const, mensagem: "Enviada.", id: m.id };
}

/** Mensagem do visitante: grava, chama a IA (se não estiver pausada) e avisa o Super Admin offline (no máximo a cada 30 min). */
export async function gravarDoVisitante(it: { id: string; nome: string; whatsapp: string; iaPausada: boolean; ultimoAvisoEm: Date | null }, texto: string) {
  await prisma.interessadoMensagem.create({ data: { interessadoId: it.id, autor: "VISITANTE", texto } });
  await prisma.interessado.update({ where: { id: it.id }, data: { ultimaMensagemEm: new Date(), vistoEm: new Date(), naoLidasSuporte: { increment: 1 } } });
  if (!it.iaPausada) await chamarWorker(`/interessados/${it.id}/responder`, {}).catch(() => undefined);
  if (it.ultimoAvisoEm && Date.now() - it.ultimoAvisoEm.getTime() < 30 * 60_000) return;
  const admins = await prisma.usuario.findMany({ where: { cargo: Cargo.SUPERADMIN, status: "ATIVO" }, select: { id: true, vistoEm: true } });
  if (admins.some((a) => a.vistoEm && Date.now() - a.vistoEm.getTime() < ONLINE_MS)) return;
  await prisma.interessado.update({ where: { id: it.id }, data: { ultimoAvisoEm: new Date() } });
  const cfg = await prisma.configVenda.findUnique({ where: { id: "config" } });
  // Ponto Visitante desligado (decisão #149): o aviso diz que só você responde
  const ia = it.iaPausada ? "" : cfg?.iaVisitanteLigada === false ? " A IA está desligada: responda você." : " A IA está respondendo.";
  const aviso = `💬 Interessado no site: ${it.nome} (+${it.whatsapp}) escreveu: "${texto.slice(0, 120)}".${ia} Veja em Atendimento → Interessados.`;
  if (cfg?.numeroAvisos) await enviarPelaPlataforma(cfg.numeroAvisos, aviso, { prioridade: "alta" }).catch(() => undefined);
  for (const a of admins) await chamarWorker(`/push/${a.id}/enviar`, { texto: aviso, url: "/atendimento?aba=interessados" }).catch(() => undefined);
}

/** Compra confirmada (decisão #104, item h): a conversa vira o suporte do novo cliente (pelo e-mail ou WhatsApp). */
export async function ligarInteressadoAoCliente(usuario: { id: string; email: string; whatsapp: string | null }) {
  const zap = normalizarWhatsapp(usuario.whatsapp ?? "");
  const its = await prisma.interessado.findMany({
    where: { OR: [{ email: { equals: usuario.email, mode: "insensitive" } }, ...(zap ? [{ whatsapp: zap }] : [])] },
    include: { mensagens: { orderBy: { criadoEm: "asc" } } },
  });
  if (!its.length) return 0;
  const msgs = its.flatMap((i) => i.mensagens).sort((a, b) => +a.criadoEm - +b.criadoEm);
  const conversa = await prisma.suporteConversa.upsert({ where: { usuarioId: usuario.id }, create: { usuarioId: usuario.id }, update: {} });
  if (msgs.length) {
    await prisma.suporteMensagem.createMany({
      data: msgs.map((m) => ({
        conversaId: conversa.id, autor: m.autor === "VISITANTE" ? "CLIENTE" : "SUPORTE", autorId: m.autorId ?? (m.autor === "VISITANTE" ? usuario.id : "ia"),
        texto: m.autor === "IA" ? `[IA] ${m.texto}` : m.texto, tipo: "texto", criadoEm: m.criadoEm,
      })),
    });
    await prisma.suporteConversa.update({ where: { id: conversa.id }, data: { ultimaMensagemEm: msgs.at(-1)!.criadoEm } });
  }
  await prisma.interessado.deleteMany({ where: { id: { in: its.map((i) => i.id) } } });
  return its.length;
}
