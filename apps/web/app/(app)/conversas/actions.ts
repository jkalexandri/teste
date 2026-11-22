"use server";

// Ações da tela Conversas IA (etapa 10 — decisão #92). O envio sai pelo serviço 24/7 (WhatsApp do usuário).
import { revalidatePath } from "next/cache";
import { prisma, regraAnexo, StatusLead } from "@filapro/db";
import { atorConversas } from "@/lib/conversas";
import { LISTA_STATUS } from "@/lib/leads-status";
import { chamarWorker, guardarArquivoNoWorker } from "@/lib/worker";

type R = { ok: boolean; mensagem: string };

/** Lead que o usuário pode responder/alterar (só o dono). */
async function minhaConversa(leadId: string) {
  const a = await atorConversas();
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  return lead && a.podeResponder(lead) ? { a, lead } : null;
}

/** Mensagem escrita pelo usuário (texto e/ou arquivo dos Arquivos ou do computador). Ao escrever, a conversa fica assumida. */
export async function enviarMensagem(leadId: string, form: FormData): Promise<R> {
  const x = await minhaConversa(leadId);
  if (!x) return { ok: false, mensagem: "Você não pode responder esta conversa." };
  const texto = String(form.get("texto") ?? "").trim().slice(0, 4000);
  let arquivoId = String(form.get("arquivoId") ?? "") || null;
  if (arquivoId) {
    const a = await prisma.arquivo.findUnique({ where: { id: arquivoId } });
    if (!a || a.usuarioId !== x.a.u.id) return { ok: false, mensagem: "Arquivo não encontrado." };
  }
  // Arquivo do computador: vai para os Arquivos do usuário (fica na VPS — decisão #67)
  const f = form.get("arquivo");
  if (f instanceof File && f.size > 0) {
    const regra = regraAnexo(f.type);
    if (!regra) return { ok: false, mensagem: "Tipo não aceito. Use imagem JPG/PNG, PDF, vídeo MP4 ou áudio MP3/OGG/M4A." };
    if (f.size > regra.maxMB * 1024 * 1024) return { ok: false, mensagem: `${regra.rotulo}: máximo de ${regra.maxMB} MB.` };
    const novo = await prisma.arquivo.create({ data: { usuarioId: x.a.u.id, nome: f.name.slice(0, 120), tipo: f.type, tamanho: f.size } });
    const g = await guardarArquivoNoWorker(novo.id, await f.arrayBuffer());
    if (!g.ok) {
      await prisma.arquivo.delete({ where: { id: novo.id } });
      return { ok: false, mensagem: g.mensagem };
    }
    arquivoId = novo.id;
  }
  if (!texto && !arquivoId) return { ok: false, mensagem: "Escreva a mensagem ou escolha um arquivo." };
  const r = await chamarWorker(`/conversas/${leadId}/enviar`, { usuarioId: x.a.u.id, texto, arquivoId });
  revalidatePath("/conversas");
  return r;
}

/** "Assumir conversa": pausa a IA nesta conversa. */
export async function assumirConversa(leadId: string): Promise<R> {
  const x = await minhaConversa(leadId);
  if (!x) return { ok: false, mensagem: "Conversa não encontrada." };
  await prisma.lead.update({ where: { id: leadId }, data: { iaPausada: true, iaPausaMotivo: "Conversa assumida pelo usuário." } });
  revalidatePath("/conversas");
  return { ok: true, mensagem: "Conversa assumida: a IA não responde este lead até você devolver." };
}

/** "Devolver para a IA": a IA volta a responder (a partir da próxima mensagem do lead). */
export async function devolverParaIA(leadId: string): Promise<R> {
  const x = await minhaConversa(leadId);
  if (!x) return { ok: false, mensagem: "Conversa não encontrada." };
  await prisma.lead.update({ where: { id: leadId }, data: { iaPausada: false, iaPausaMotivo: null } });
  revalidatePath("/conversas");
  return { ok: true, mensagem: "Conversa devolvida: a IA responde a próxima mensagem do lead." };
}

/** Status manual (decisão #59; venda concluída só o usuário marca — #92). */
export async function mudarStatusConversa(leadId: string, status: string): Promise<R> {
  const x = await minhaConversa(leadId);
  if (!x) return { ok: false, mensagem: "Conversa não encontrada." };
  if (!LISTA_STATUS.includes(status as never)) return { ok: false, mensagem: "Status inválido." };
  const novo = status as StatusLead;
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: novo, pediuSairEm: novo === StatusLead.PEDIU_SAIR ? x.lead.pediuSairEm ?? new Date() : null },
  });
  revalidatePath("/conversas");
  return { ok: true, mensagem: "Status alterado." };
}

/** Temperatura manual (Quente/Morno/Frio) — a IA pode mudar de novo nas próximas respostas. */
export async function mudarTemperatura(leadId: string, temperatura: string): Promise<R> {
  const x = await minhaConversa(leadId);
  if (!x) return { ok: false, mensagem: "Conversa não encontrada." };
  if (!["QUENTE", "MORNO", "FRIO", ""].includes(temperatura)) return { ok: false, mensagem: "Temperatura inválida." };
  await prisma.lead.update({ where: { id: leadId }, data: { qualificacao: temperatura || null, qualificacaoMotivo: temperatura ? "Definido pelo usuário" : null, qualificacaoEm: new Date() } });
  revalidatePath("/conversas");
  return { ok: true, mensagem: "Temperatura alterada." };
}

/** Liga/desliga geral: a IA responde sozinha os leads deste usuário. */
export async function ligarIAConversas(ligar: boolean): Promise<R> {
  const a = await atorConversas();
  if (!a.temIA) return { ok: false, mensagem: "O Admin da Empresa não envia mensagens." };
  await prisma.usuario.update({ where: { id: a.u.id }, data: { iaConversas: !!ligar } });
  revalidatePath("/conversas");
  return { ok: true, mensagem: ligar ? "IA ligada: ela responde os seus leads." : "IA desligada: ninguém responde sozinho; responda pela tela." };
}

/** Abrir a conversa zera as não lidas (só o dono). */
export async function marcarLida(leadId: string) {
  const x = await minhaConversa(leadId);
  if (x && x.lead.naoLidas > 0) await prisma.lead.update({ where: { id: leadId }, data: { naoLidas: 0 } });
}
