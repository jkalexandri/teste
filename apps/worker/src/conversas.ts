// Conversas IA no serviço 24/7 (etapa 10 — decisões #75 e #92).
// Guarda as mensagens, e a IA responde o lead pelo WhatsApp do usuário: a qualquer hora, depois de 20 a 60 s
// com "digitando…", qualificando (Quente/Morno/Frio) e marcando o status na mesma chamada.
import { join } from "node:path";
import type { Logger } from "pino";
import { prisma, AutorMensagem, Cargo, StatusLead } from "@filapro/db";
import { PALAVRAS_SAIR } from "@filapro/db/src/envio.ts";
import { MENSAGENS_RECENTES, resumirConversa, responderConversa, type MensagemConversa } from "@filapro/ia/src/conversa.ts";
import { ErroIA } from "@filapro/ia/src/tipos.ts";
import type { Conteudo, Remetente } from "./disparos.js";

/** Máximo de respostas da IA por conversa por dia (decisão #92). */
export const MAX_IA_DIA = 30;
/** Histórico guardado por 365 dias (especificação, seção 10). */
export const DIAS_HISTORICO = 365;
/** Quando o trecho fora do resumo passa disto, as mensagens mais antigas entram no resumo (economia). */
const RESUMIR_ACIMA = MENSAGENS_RECENTES + 8;

export const TEXTO_AUDIO = "Oi! No momento não consigo ouvir áudios por aqui. Pode me escrever, por favor? 🙂";
export const MOTIVO_ASSUMIDA = "Conversa assumida pelo usuário.";
export const MOTIVO_NAO_SEI = "A IA não soube responder. Confirme a informação com o lead e depois devolva a conversa para a IA.";
export const MOTIVO_LIMITE = `Limite de ${MAX_IA_DIA} respostas da IA nesta conversa hoje.`;

export type Recebida = { texto: string; tipo: string; baixarImagem?: () => Promise<{ tipo: string; base64: string } | null> };

/** Status que a IA pode trocar; os outros (venda concluída, pediu para sair, bloqueado) só o usuário muda. */
const STATUS_DA_IA: StatusLead[] = [StatusLead.NOVO, StatusLead.EM_CONVERSA, StatusLead.QUALIFICADO, StatusLead.OBJECAO];

const jidDe = (telefone: string) => `${telefone}@s.whatsapp.net`;
const inicioDoDiaSP = (d: Date) => new Date(`${new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10)}T00:00:00-03:00`);

export class Atendente {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private imagens = new Map<string, () => Promise<{ tipo: string; base64: string } | null>>();
  private limpeza: ReturnType<typeof setInterval> | null = null;

  constructor(
    private remetente: Remetente,
    private log: Logger,
    private opcoes: {
      pastaArquivos: string;
      notificar?: (para: string, texto: string) => Promise<unknown>;
      /** Espera antes de responder (padrão 20–60 s — decisão #92). Nos testes, 0. */
      esperaMs?: () => number;
      agora?: () => Date;
    },
  ) {}

  private agora() { return this.opcoes.agora?.() ?? new Date(); }
  private espera() { return this.opcoes.esperaMs?.() ?? 20_000 + Math.random() * 40_000; }

  iniciar() {
    void this.limparAntigas();
    this.limpeza = setInterval(() => void this.limparAntigas(), 24 * 3600_000);
  }
  parar() {
    if (this.limpeza) clearInterval(this.limpeza);
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Apaga as mensagens com mais de 365 dias. */
  async limparAntigas() {
    const limite = new Date(this.agora().getTime() - DIAS_HISTORICO * 86400_000);
    const r = await prisma.mensagem.deleteMany({ where: { criadoEm: { lt: limite } } }).catch(() => ({ count: 0 }));
    if (r.count) this.log.info({ apagadas: r.count }, "mensagens com mais de 365 dias apagadas");
  }

  /** Mensagem de campanha enviada: entra no histórico da conversa. */
  async registrarCampanha(leadId: string | null, conteudo: Conteudo, arquivoId?: string | null) {
    if (!leadId) return;
    const tipo = conteudo.anexo ? tipoDoArquivo(conteudo.anexo.tipo) : "texto";
    await prisma.mensagem.create({ data: { leadId, autor: AutorMensagem.CAMPANHA, texto: conteudo.texto, tipo, arquivoId: arquivoId ?? null, arquivoNome: conteudo.anexo?.nome ?? null } });
    await prisma.lead.update({ where: { id: leadId }, data: { ultimaMensagemEm: this.agora() } }).catch(() => undefined);
  }

  /** Mensagem recebida de um contato. Quem não é lead é ignorado (decisão #92, item 9). */
  async receber(sessaoId: string, telefone: string, r: Recebida) {
    const lead = await prisma.lead.findFirst({ where: { usuarioId: sessaoId, telefone }, include: { usuario: true } });
    if (!lead) return;
    const agora = this.agora();
    await prisma.mensagem.create({ data: { leadId: lead.id, autor: AutorMensagem.LEAD, texto: r.texto, tipo: r.tipo } });
    await prisma.lead.update({ where: { id: lead.id }, data: { ultimaMensagemEm: agora, naoLidas: { increment: 1 } } });

    // SAIR/PARAR/STOP/CANCELAR e mensagens vazias não chamam a IA (decisões #75 e #83)
    const palavra = r.texto.trim().toUpperCase().replace(/[^A-ZÇÃÕÁÉÍÓÚ]/g, "");
    if (PALAVRAS_SAIR.includes(palavra)) return;
    if (!lead.usuario.iaConversas || lead.iaPausada) return;
    if (lead.status === StatusLead.PEDIU_SAIR) return;

    // Áudio: a IA não ouve; pede para escrever e avisa o usuário (decisão #92, item 8)
    if (r.tipo === "audio") {
      this.agendar(lead.id, () => this.responderAudio(lead.id));
      return;
    }
    if (!r.texto.trim() && r.tipo !== "imagem") return;
    if (r.tipo === "imagem" && r.baixarImagem) this.imagens.set(lead.id, r.baixarImagem);
    // Várias mensagens seguidas viram uma resposta só: o relógio recomeça a cada mensagem
    this.agendar(lead.id, () => this.responder(lead.id));
  }

  private agendar(leadId: string, acao: () => Promise<void>) {
    clearTimeout(this.timers.get(leadId));
    this.timers.set(leadId, setTimeout(() => {
      this.timers.delete(leadId);
      void acao().catch((e) => this.log.error({ e, leadId }, "falha ao responder lead"));
    }, this.espera()));
  }

  /** Para os testes: espera as respostas agendadas terminarem. */
  pendentes() { return this.timers.size; }

  private async enviarComoEmpresa(lead: { id: string; usuarioId: string; telefone: string }, texto: string, autor: AutorMensagem) {
    if (!this.remetente.conectado(lead.usuarioId)) {
      this.log.warn({ leadId: lead.id }, "WhatsApp desconectado: resposta não enviada");
      return false;
    }
    const jid = jidDe(lead.telefone);
    await this.remetente.digitando(lead.usuarioId, jid, Math.min(8_000, 1_500 + texto.length * 40));
    await this.remetente.enviar(lead.usuarioId, jid, { texto });
    await prisma.mensagem.create({ data: { leadId: lead.id, autor, texto } });
    await prisma.lead.update({ where: { id: lead.id }, data: { ultimaMensagemEm: this.agora() } });
    return true;
  }

  private async responderAudio(leadId: string) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { usuario: true } });
    if (!lead || lead.iaPausada || !lead.usuario.iaConversas) return;
    if (await this.enviarComoEmpresa(lead, TEXTO_AUDIO, AutorMensagem.IA)) {
      await this.avisarUsuario(lead.usuario, `🎤 FilaPro Leads: o lead ${nomeDo(lead)} mandou um áudio. A IA pediu para ele escrever; se preferir, ouça no seu WhatsApp.`);
    }
  }

  async responder(leadId: string) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { usuario: { include: { empresa: true } } } });
    if (!lead || lead.iaPausada || !lead.usuario.iaConversas || lead.status === StatusLead.PEDIU_SAIR) return;
    const quem = { empresaId: lead.empresaId, usuarioId: lead.usuarioId };

    // Limite de 30 respostas da IA por conversa por dia: pausa e avisa (decisão #92, item 12)
    const hoje = await prisma.mensagem.count({ where: { leadId, autor: AutorMensagem.IA, criadoEm: { gte: inicioDoDiaSP(this.agora()) } } });
    if (hoje >= MAX_IA_DIA) {
      await prisma.lead.update({ where: { id: leadId }, data: { iaPausada: true, iaPausaMotivo: MOTIVO_LIMITE } });
      await this.avisarUsuario(lead.usuario, `⏸️ FilaPro Leads: a IA parou de responder ${nomeDo(lead)} hoje (limite de ${MAX_IA_DIA} respostas). Abra Conversas IA para continuar.`);
      return;
    }
    if (!this.remetente.conectado(lead.usuarioId)) return;

    // Contexto enxuto: ficha (cache) + resumo + últimas mensagens (decisão #75)
    const ficha = await fichaDoUsuario(lead.usuario);
    await this.atualizarResumo(lead.id, lead.resumoConversa, lead.resumidoAte, quem);
    const atual = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { resumoConversa: true } });
    const recentes = (await prisma.mensagem.findMany({ where: { leadId }, orderBy: { criadoEm: "desc" }, take: MENSAGENS_RECENTES })).reverse();
    const baixar = this.imagens.get(leadId);
    this.imagens.delete(leadId);
    const imagem = baixar ? await baixar().catch(() => null) : null;

    let r;
    try {
      r = await responderConversa(
        { ficha: ficha.texto, comoQualificar: ficha.comoQualificar, resumo: atual.resumoConversa, nomeLead: lead.nome, recentes: recentes.map(paraIA), imagem: imagem ?? undefined },
        quem,
      );
    } catch (e) {
      this.log.warn({ leadId, msg: e instanceof ErroIA ? e.message : String(e) }, "IA não respondeu");
      return;
    }
    // Pode ter sido assumida enquanto a IA pensava
    const agoraLead = await prisma.lead.findUnique({ where: { id: leadId }, select: { iaPausada: true } });
    if (!agoraLead || agoraLead.iaPausada) return;
    if (!(await this.enviarComoEmpresa(lead, r.resposta, AutorMensagem.IA))) return;

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        qualificacao: r.temperatura,
        qualificacaoMotivo: r.motivo || null,
        qualificacaoEm: this.agora(),
        ...(STATUS_DA_IA.includes(lead.status) ? { status: r.status as StatusLead } : {}),
        // Não soube responder: pausa e avisa (decisão #92, item 7)
        ...(r.naoSei ? { iaPausada: true, iaPausaMotivo: MOTIVO_NAO_SEI } : {}),
      },
    });
    if (r.naoSei) {
      await this.avisarUsuario(lead.usuario, `❓ FilaPro Leads: o lead ${nomeDo(lead)} perguntou algo que a IA não sabe responder. A IA disse que vai confirmar e pausou a conversa. Abra Conversas IA para responder.`);
    }
  }

  /** Coloca no resumo as mensagens que ficaram fora da janela recente. */
  private async atualizarResumo(leadId: string, resumo: string, resumidoAte: Date | null, quem: { empresaId: string | null; usuarioId: string }) {
    const fora = await prisma.mensagem.findMany({ where: { leadId, ...(resumidoAte ? { criadoEm: { gt: resumidoAte } } : {}) }, orderBy: { criadoEm: "asc" } });
    if (fora.length <= RESUMIR_ACIMA) return;
    const antigas = fora.slice(0, fora.length - MENSAGENS_RECENTES);
    try {
      const novo = await resumirConversa(resumo, antigas.map(paraIA), quem);
      await prisma.lead.update({ where: { id: leadId }, data: { resumoConversa: novo, resumidoAte: antigas.at(-1)!.criadoEm } });
    } catch (e) {
      this.log.warn({ leadId, e }, "resumo da conversa não atualizado");
    }
  }

  /** Mensagem escrita pelo usuário na tela Conversas IA (com ou sem arquivo). Assume a conversa. */
  async enviarManual(leadId: string, usuarioId: string, texto: string, arquivoId?: string | null) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.usuarioId !== usuarioId) return { ok: false, mensagem: "Conversa não encontrada." };
    if (!this.remetente.conectado(usuarioId)) return { ok: false, mensagem: "Seu WhatsApp está desconectado. Conecte em WhatsApp e tente de novo." };
    const arquivo = arquivoId ? await prisma.arquivo.findUnique({ where: { id: arquivoId } }) : null;
    if (arquivoId && (!arquivo || arquivo.usuarioId !== usuarioId)) return { ok: false, mensagem: "Arquivo não encontrado." };
    if (!texto.trim() && !arquivo) return { ok: false, mensagem: "Escreva a mensagem ou escolha um arquivo." };
    clearTimeout(this.timers.get(leadId));
    this.timers.delete(leadId);
    const anexo = arquivo ? { caminho: join(this.opcoes.pastaArquivos, arquivo.id), tipo: arquivo.tipo, nome: arquivo.nome } : undefined;
    try {
      await this.remetente.enviar(usuarioId, jidDe(lead.telefone), { texto, anexo });
    } catch (e) {
      this.log.warn({ e, leadId }, "mensagem manual não enviada");
      return { ok: false, mensagem: "Não foi possível enviar. Confira o WhatsApp e tente de novo." };
    }
    await prisma.mensagem.create({
      data: { leadId, autor: AutorMensagem.USUARIO, texto, tipo: arquivo ? tipoDoArquivo(arquivo.tipo) : "texto", arquivoId: arquivo?.id ?? null, arquivoNome: arquivo?.nome ?? null },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: { ultimaMensagemEm: this.agora(), naoLidas: 0, iaPausada: true, iaPausaMotivo: MOTIVO_ASSUMIDA, ...(lead.status === StatusLead.NOVO ? { status: StatusLead.EM_CONVERSA } : {}) },
    });
    return { ok: true, mensagem: "Mensagem enviada." };
  }

  /** Avisos ao usuário pelo número da plataforma (mesma regra dos avisos de campanha). */
  private async avisarUsuario(u: { cargo: Cargo; whatsapp: string | null }, texto: string) {
    if (!this.opcoes.notificar) return;
    let para = u.whatsapp ?? "";
    if (u.cargo === Cargo.SUPERADMIN) para = (await prisma.configVenda.findUnique({ where: { id: "config" } }))?.numeroAvisos || para;
    const dig = para.replace(/\D/g, "");
    const numero = dig.length === 10 || dig.length === 11 ? "55" + dig : dig;
    if (!/^\d{12,15}$/.test(numero)) return;
    await this.opcoes.notificar(numero, texto).catch((e) => this.log.warn({ e }, "aviso pelo WhatsApp não enviado"));
  }
}

function paraIA(m: { autor: AutorMensagem; texto: string; tipo: string; arquivoNome: string | null }): MensagemConversa {
  return { autor: m.autor, texto: m.texto || (m.arquivoNome ? `(arquivo ${m.arquivoNome})` : ""), tipo: m.tipo };
}

const nomeDo = (l: { nome: string; telefone: string }) => (l.nome ? `${l.nome} (+${l.telefone})` : `+${l.telefone}`);

export function tipoDoArquivo(mime: string) {
  return mime.startsWith("image/") ? "imagem" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "documento";
}

/** Ficha da empresa do dono do lead (a mesma regra do site: resumo, ou os campos preenchidos). */
async function fichaDoUsuario(u: { id: string; cargo: Cargo; empresaId: string | null; empresa: { nome: string } | null }) {
  const onde = u.cargo === Cargo.SUPERADMIN ? { superAdminId: u.id } : u.empresaId ? { empresaId: u.empresaId } : null;
  const f = onde ? await prisma.fichaEmpresa.findUnique({ where: onde }) : null;
  let texto = f?.resumo.trim() ?? "";
  if (!texto && f) {
    texto = [["Empresa", f.nome], ["Endereço", f.endereco], ["Telefone", f.telefone], ["WhatsApp", f.whatsapp], ["Atividade", f.atividade]]
      .filter(([, v]) => v!.trim()).map(([k, v]) => `${k}: ${v}`).join("\n");
  }
  if (!texto && u.empresa) texto = `Empresa: ${u.empresa.nome}`;
  return { texto, comoQualificar: f?.comoQualificar ?? "" };
}
