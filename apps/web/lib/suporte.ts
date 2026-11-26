// Suporte em tempo real (decisão #102): conversa de cada cliente (Usuário ou Admin da Empresa) com o Super Admin.
import "server-only";
import { prisma, Cargo } from "@filapro/db";
import { enviarPelaPlataforma } from "@/lib/avisos-whatsapp";
import { chamarWorker, guardarArquivoNoWorker } from "@/lib/worker";

export const ONLINE_MS = 2 * 60_000;
export const MAX_ANEXO_SUPORTE = 15 * 1024 * 1024;
const TIPOS_ANEXO: Record<string, string> = { "image/jpeg": "imagem", "image/png": "imagem", "application/pdf": "documento" };

export type MsgSuporte = { id: string; autor: "CLIENTE" | "SUPORTE"; texto: string; tipo: string; arquivoNome: string | null; criadoEm: string };

export async function mensagensDaConversa(usuarioId: string, desde?: string | null) {
  const c = await prisma.suporteConversa.findUnique({ where: { usuarioId } });
  if (!c) return { conversa: null, mensagens: [] as MsgSuporte[] };
  const d = desde ? new Date(desde) : null;
  const ms = await prisma.suporteMensagem.findMany({
    where: { conversaId: c.id, ...(d && !isNaN(+d) ? { criadoEm: { gt: d } } : {}) },
    orderBy: { criadoEm: "asc" },
    take: 300,
  });
  return {
    conversa: c,
    mensagens: ms.map((m) => ({ id: m.id, autor: m.autor as MsgSuporte["autor"], texto: m.texto, tipo: m.tipo, arquivoNome: m.arquivoNome, criadoEm: m.criadoEm.toISOString() })),
  };
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
  const conversa = await prisma.suporteConversa.upsert({
    where: { usuarioId },
    create: { usuarioId, ultimaMensagemEm: agora },
    update: { ultimaMensagemEm: agora },
  });
  const m = await prisma.suporteMensagem.create({
    data: { conversaId: conversa.id, autor, autorId, texto, tipo: arquivo ? TIPOS_ANEXO[arquivo.type]! : "texto", arquivoNome: arquivo?.name.slice(0, 120) ?? null, arquivoTipo: arquivo?.type ?? null },
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

/** Cliente chamou e o Super Admin está offline: avisa no WhatsApp (número de avisos) e no celular (decisão #102). */
export async function avisarSuporteOffline(cliente: { nome: string; email: string }, texto: string) {
  const admins = await prisma.usuario.findMany({ where: { cargo: Cargo.SUPERADMIN, status: "ATIVO" }, select: { id: true, vistoEm: true } });
  const online = admins.some((a) => a.vistoEm && Date.now() - a.vistoEm.getTime() < ONLINE_MS);
  if (online) return;
  const aviso = `💬 Suporte FilaPro Leads: ${cliente.nome} (${cliente.email}) chamou: "${texto.slice(0, 120) || "(arquivo)"}". Responda em Atendimento.`;
  const cfg = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (cfg?.numeroAvisos) await enviarPelaPlataforma(cfg.numeroAvisos, aviso, { prioridade: "alta" }).catch(() => undefined);
  for (const a of admins) await chamarWorker(`/push/${a.id}/enviar`, { texto: aviso, url: "/atendimento" }).catch(() => undefined);
}
