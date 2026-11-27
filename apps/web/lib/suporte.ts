// Suporte em tempo real (decisão #102): conversa de cada cliente (Usuário ou Admin da Empresa) com o Super Admin.
import "server-only";
import { prisma, Cargo } from "@filapro/db";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";
import { chamarWorker, guardarArquivoNoWorker } from "@/lib/worker";

export const ONLINE_MS = 2 * 60_000;
export const MAX_ANEXO_SUPORTE = 15 * 1024 * 1024;
const TIPOS_ANEXO: Record<string, string> = { "image/jpeg": "imagem", "image/png": "imagem", "application/pdf": "documento" };

export type MsgSuporte = { id: string; autor: "CLIENTE" | "SUPORTE" | "IA" | "SISTEMA"; texto: string; tipo: string; arquivoNome: string | null; criadoEm: string };

/**
 * Mensagens do atendimento ATUAL da conversa (decisão #177). Cada atendimento é um bloco: depois de encerrado, a tela fica limpa e a próxima
 * mensagem abre o seguinte; os anteriores continuam guardados (atendimentosAnteriores, só leitura). Atendimento encerrado: quem abre a tela do
 * zero vê vazio; quem já estava com ela aberta (`desde`) recebe só o que chegou depois — a mensagem de encerramento, uma única vez.
 * `atendimento` vai junto: se mudou (a conversa foi reaberta), a tela recarrega do zero e some o que era do atendimento anterior.
 */
export async function mensagensDaConversa(usuarioId: string, desde?: string | null) {
  const c = await prisma.suporteConversa.findUnique({ where: { usuarioId } });
  if (!c) return { conversa: null, mensagens: [] as MsgSuporte[], atendimento: 1, encerrada: false };
  const d = desde ? new Date(desde) : null;
  const valida = !!d && !isNaN(+d);
  const base = { conversa: c, atendimento: c.atendimentoAtual, encerrada: !!c.encerradaEm };
  if (c.encerradaEm && !valida) return { ...base, mensagens: [] as MsgSuporte[] };
  const ms = await prisma.suporteMensagem.findMany({
    where: { conversaId: c.id, atendimento: c.atendimentoAtual, ...(valida ? { criadoEm: { gt: d! } } : {}) },
    orderBy: { criadoEm: "asc" },
    take: 300,
  });
  return {
    ...base,
    mensagens: ms.map((m) => ({ id: m.id, autor: m.autor as MsgSuporte["autor"], texto: m.texto, tipo: m.tipo, arquivoNome: m.arquivoNome, criadoEm: m.criadoEm.toISOString() })),
  };
}

export type AtendimentoAnterior = { numero: number; inicio: string; fim: string; mensagens: MsgSuporte[] };

/** Atendimentos anteriores da conversa (só leitura, para o Super Admin): os já fechados, do mais novo para o mais antigo. */
export async function atendimentosAnteriores(usuarioId: string): Promise<AtendimentoAnterior[]> {
  const c = await prisma.suporteConversa.findUnique({ where: { usuarioId }, select: { id: true, atendimentoAtual: true, encerradaEm: true } });
  if (!c) return [];
  // Já fechados: os de número menor que o atual e, se a conversa está encerrada, o próprio atual
  const ms = await prisma.suporteMensagem.findMany({
    where: { conversaId: c.id, ...(c.encerradaEm ? {} : { atendimento: { lt: c.atendimentoAtual } }) },
    orderBy: { criadoEm: "asc" },
    take: 3000,
  });
  const porNumero = new Map<number, typeof ms>();
  for (const m of ms) porNumero.set(m.atendimento, [...(porNumero.get(m.atendimento) ?? []), m]);
  return [...porNumero.entries()]
    .sort((x, y) => y[0] - x[0])
    .map(([numero, lista]) => ({
      numero,
      inicio: lista[0]!.criadoEm.toISOString(),
      fim: lista[lista.length - 1]!.criadoEm.toISOString(),
      mensagens: lista.map((m) => ({ id: m.id, autor: m.autor as MsgSuporte["autor"], texto: m.texto, tipo: m.tipo, arquivoNome: m.arquivoNome, criadoEm: m.criadoEm.toISOString() })),
    }));
}

/** Grava a mensagem (texto e/ou anexo) e atualiza os contadores de não lidas. */
export async function gravarMensagem(usuarioId: string, autor: "CLIENTE" | "SUPORTE", autorId: string, texto: string, arquivo: File | null) {
  texto = texto.trim().slice(0, 4000);
  if (!texto && !arquivo) return { ok: false as const, mensagem: "Escreva a mensagem ou escolha um arquivo." };
  if (arquivo) {
    if (!TIPOS_ANEXO[arquivo.type]) return { ok: false as const, mensagem: "Envie imagem (JPG/PNG) ou PDF." };
    if (arquivo.size > MAX_ANEXO_SUPORTE) return { ok: false as const, mensagem: "Arquivo muito grande (máximo 15 MB)." };
  }
  const agora = new Date();
  // Reabre o atendimento encerrado por inatividade (decisões #156 e #177): a mensagem do cliente (ou do Super Admin) começa um novo atendimento (número seguinte);
  // para o cliente a IA volta a atender (sem pausa antiga)
  await prisma.suporteConversa.updateMany({
    where: { usuarioId, encerradaEm: { not: null } },
    // Atendimento novo (decisão #177): a conversa reaberta começa um bloco novo; a tela passa a mostrar só ele
    data: autor === "CLIENTE" ? { encerradaEm: null, atendimentoAtual: { increment: 1 }, iaPausada: false, iaPausaMotivo: null, ultimoAvisoEm: null } : { encerradaEm: null, atendimentoAtual: { increment: 1 } },
  });
  const conversa = await prisma.suporteConversa.upsert({
    where: { usuarioId },
    create: { usuarioId, ultimaMensagemEm: agora },
    // Quem escreve pelo Atendimento assume a conversa: a IA do suporte para (decisão #146)
    update: { ultimaMensagemEm: agora, ...(autor === "SUPORTE" ? { iaPausada: true, iaPausaMotivo: "Assumida pelo Super Admin" } : {}) },
  });
  const m = await prisma.suporteMensagem.create({
    data: { conversaId: conversa.id, atendimento: conversa.atendimentoAtual, autor, autorId, texto, tipo: arquivo ? TIPOS_ANEXO[arquivo.type]! : "texto", arquivoNome: arquivo?.name.slice(0, 120) ?? null, arquivoTipo: arquivo?.type ?? null },
  });
  if (arquivo) {
    const g = await guardarArquivoNoWorker(`sup-${m.id}`, await arquivo.arrayBuffer());
    if (!g.ok) {
      await prisma.suporteMensagem.delete({ where: { id: m.id } });
      return { ok: false as const, mensagem: g.mensagem };
    }
  }
  await prisma.suporteConversa.update({
    where: { id: conversa.id },
    data: autor === "CLIENTE" ? { naoLidasSuporte: { increment: 1 } } : { naoLidasCliente: { increment: 1 } },
  });
  return { ok: true as const, mensagem: "Enviada.", id: m.id };
}

/**
 * Mensagem nova do cliente (decisão #146): chama a IA do suporte, se a chave geral estiver ligada e a conversa não estiver pausada.
 * Devolve se a IA está atendendo (para o aviso ao Super Admin não repetir a cada mensagem).
 */
export async function acionarIASuporte(usuarioId: string) {
  const [cfg, conversa] = await Promise.all([
    prisma.configVenda.findUnique({ where: { id: "config" }, select: { iaSuporteLigada: true } }),
    prisma.suporteConversa.findUnique({ where: { usuarioId }, select: { id: true, iaPausada: true } }),
  ]);
  if (!cfg?.iaSuporteLigada || !conversa || conversa.iaPausada) return false;
  await chamarWorker(`/suporte/${usuarioId}/responder`, {}).catch(() => undefined);
  return true;
}

/** Cliente chamou e o Super Admin está offline: avisa no WhatsApp (número de avisos) e no celular (decisão #102). */
export async function avisarSuporteOffline(cliente: { id?: string; nome: string; email: string }, texto: string, iaAtendendo = false) {
  const admins = await prisma.usuario.findMany({ where: { cargo: Cargo.SUPERADMIN, status: "ATIVO" }, select: { id: true, vistoEm: true } });
  const online = admins.some((a) => a.vistoEm && Date.now() - a.vistoEm.getTime() < ONLINE_MS);
  if (online) return;
  // Com a IA atendendo, só 1 aviso a cada 30 min por conversa (quando ela passa para o atendente, o aviso sai na hora, pelo serviço)
  if (iaAtendendo && cliente.id) {
    const c = await prisma.suporteConversa.findUnique({ where: { usuarioId: cliente.id }, select: { ultimoAvisoEm: true } });
    if (c?.ultimoAvisoEm && Date.now() - c.ultimoAvisoEm.getTime() < 30 * 60_000) return;
    await prisma.suporteConversa.update({ where: { usuarioId: cliente.id }, data: { ultimoAvisoEm: new Date() } });
  }
  const aviso = `💬 Suporte FilaPro Leads: ${cliente.nome} (${cliente.email}) chamou: "${texto.slice(0, 120) || "(arquivo)"}".${iaAtendendo ? " A IA está respondendo." : ""} Responda em Atendimento.`;
  const cfg = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (cfg?.numeroAvisos) await enviarPelaPlataforma(cfg.numeroAvisos, aviso, { prioridade: "alta" }).catch(() => undefined);
  for (const a of admins) await chamarWorker(`/push/${a.id}/enviar`, { texto: aviso, url: "/atendimento" }).catch(() => undefined);
}
