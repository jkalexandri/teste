// Conversas IA no serviço 24/7 (etapa 10 — decisões #75 e #92).
// Guarda as mensagens, e a IA responde o lead pelo WhatsApp do usuário: a qualquer hora, depois de 20 a 60 s
// com "digitando…", qualificando (Quente/Morno/Frio) e marcando o status na mesma chamada.
import { join } from "node:path";
import type { Logger } from "pino";
import { prisma, AutorMensagem, Cargo, Modulo, StatusAnuncio, StatusLead } from "@filapro/db";
import { PALAVRAS_SAIR } from "@filapro/db/src/envio.ts";
import { reservarCodigos } from "@filapro/db/src/codigos.ts";
import { numeroDeAvisos, type TipoAviso } from "./avisos.js";
import { escolherNumero } from "./numeros.js";
import { emManutencao } from "./manutencao.js";
import { enviarPush, urlDoAviso } from "./push.js";
import { MENSAGENS_RECENTES, resumirConversa, responderConversa, type MensagemConversa } from "@filapro/ia/src/conversa.ts";
import { ErroIA } from "@filapro/ia/src/tipos.ts";
import type { Conteudo, Remetente } from "./disparos.js";

/** Ao reconectar, responde as mensagens de lead das últimas 48 horas que ficaram sem resposta. */
export const HORAS_RECONEXAO = 48;
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
      /** Avisos com liga/desliga e resumo (etapa 10b) */
      avisos?: { avisar(tipo: TipoAviso, donoId: string, texto: string): Promise<void> };
    },
  ) {}

  private agora() { return this.opcoes.agora?.() ?? new Date(); }
  private emAtendimento = new Set<string>();
  private varredura: ReturnType<typeof setInterval> | null = null;
  private avisar(tipo: TipoAviso, donoId: string, texto: string) {
    return this.opcoes.avisos?.avisar(tipo, donoId, texto).catch((e) => this.log.warn({ e }, "aviso não registrado"));
  }
  private espera() { return this.opcoes.esperaMs?.() ?? 20_000 + Math.random() * 40_000; }

  iniciar() {
    void this.limparAntigas();
    this.limpeza = setInterval(() => void this.limparAntigas(), 24 * 3600_000);
    // Leads de anúncios que não foram atendidos na hora (serviço fora, WhatsApp desconectado)
    this.varredura = setInterval(() => void this.varrerAnuncios().catch((e) => this.log.error({ e }, "falha na varredura de anúncios")), 60_000);
  }
  parar() {
    if (this.limpeza) clearInterval(this.limpeza);
    if (this.varredura) clearInterval(this.varredura);
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** Apaga as mensagens com mais de 365 dias. */
  async limparAntigas() {
    const limite = new Date(this.agora().getTime() - DIAS_HISTORICO * 86400_000);
    const r = await prisma.mensagem.deleteMany({ where: { criadoEm: { lt: limite } } }).catch(() => ({ count: 0 }));
    // Histórico do suporte também fica 365 dias (decisão #102)
    await prisma.suporteMensagem.deleteMany({ where: { criadoEm: { lt: limite } } }).catch(() => undefined);
    // Logs ficam 90 dias (decisão #99)
    await prisma.log.deleteMany({ where: { criadoEm: { lt: new Date(this.agora().getTime() - 90 * 86400_000) } } }).catch(() => undefined);
    if (r.count) this.log.info({ apagadas: r.count }, "mensagens com mais de 365 dias apagadas");
  }

  /** Mensagem de campanha enviada: entra no histórico da conversa. */
  async registrarCampanha(leadId: string | null, conteudo: Conteudo, arquivoId?: string | null, sessaoId?: string) {
    if (!leadId) return;
    const tipo = conteudo.anexo ? tipoDoArquivo(conteudo.anexo.tipo) : "texto";
    await prisma.mensagem.create({ data: { leadId, autor: AutorMensagem.CAMPANHA, texto: conteudo.texto, tipo, arquivoId: arquivoId ?? null, arquivoNome: conteudo.anexo?.nome ?? null, sessaoId: sessaoId ?? null } });
    await prisma.lead.update({ where: { id: leadId }, data: { ultimaMensagemEm: this.agora(), ...(sessaoId ? { sessaoId } : {}) } }).catch(() => undefined);
  }

  /**
   * Mensagem recebida de um contato pelo número `sessaoId` do usuário `usuarioId`.
   * Quem não é lead é ignorado (decisão #92, item 9). A conversa continua pelo número que recebeu (decisão #79).
   */
  async receber(sessaoId: string, usuarioId: string, telefone: string, r: Recebida) {
    const lead = await prisma.lead.findFirst({ where: { usuarioId, telefone }, include: { usuario: true } });
    if (!lead) return;
    const agora = this.agora();
    await prisma.mensagem.create({ data: { leadId: lead.id, autor: AutorMensagem.LEAD, texto: r.texto, tipo: r.tipo, sessaoId } });
    await prisma.lead.update({ where: { id: lead.id }, data: { ultimaMensagemEm: agora, naoLidas: { increment: 1 }, sessaoId } });
    lead.sessaoId = sessaoId;

    // SAIR/PARAR/STOP/CANCELAR e mensagens vazias não chamam a IA (decisões #75 e #83)
    const palavra = r.texto.trim().toUpperCase().replace(/[^A-ZÇÃÕÁÉÍÓÚ]/g, "");
    if (PALAVRAS_SAIR.includes(palavra)) return;
    // Aviso "lead respondeu" (decisão #81), exceto SAIR/PARAR/STOP/CANCELAR
    const trecho = r.texto.trim() ? `"${r.texto.trim().slice(0, 120)}"` : r.tipo === "audio" ? "(áudio)" : r.tipo === "imagem" ? "(imagem)" : `(${r.tipo})`;
    void this.avisar("RESPONDEU", lead.usuarioId, `💬 ${nomeDo(lead)} respondeu: ${trecho}`);
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
      void (async () => {
        // Atualização em andamento (decisão #103): a resposta fica guardada e sai depois
        if (await emManutencao()) { this.agendar(leadId, acao); return; }
        await acao();
      })().catch((e) => this.log.error({ e, leadId }, "falha ao responder lead"));
    }, this.espera()));
  }

  /** Para os testes: espera as respostas agendadas terminarem. */
  pendentes() { return this.timers.size; }

  /** Número por onde falar com o lead (o da conversa; senão o principal; senão outro conectado). */
  private numeroDo(lead: { usuarioId: string; sessaoId: string | null }, preferido?: string | null) {
    return escolherNumero((id) => this.remetente.conectado(id), lead.usuarioId, preferido === undefined ? lead.sessaoId : preferido);
  }

  private async enviarComoEmpresa(lead: { id: string; usuarioId: string; telefone: string; sessaoId: string | null }, texto: string, autor: AutorMensagem, preferido?: string | null) {
    const numero = await this.numeroDo(lead, preferido);
    if (!numero) {
      this.log.warn({ leadId: lead.id }, "WhatsApp desconectado: resposta não enviada");
      return false;
    }
    const jid = jidDe(lead.telefone);
    await this.remetente.digitando(numero, jid, Math.min(8_000, 1_500 + texto.length * 40));
    await this.remetente.enviar(numero, jid, { texto });
    await prisma.mensagem.create({ data: { leadId: lead.id, autor, texto, sessaoId: numero } });
    await prisma.lead.update({ where: { id: lead.id }, data: { ultimaMensagemEm: this.agora(), sessaoId: numero } });
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
    if (!(await this.numeroDo(lead))) return;

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
    // Aviso de lead Quente (decisão #81): só quando passa a ser Quente
    if (r.temperatura === "QUENTE" && lead.qualificacao !== "QUENTE") {
      void this.avisar("QUENTE", lead.usuarioId, `🔥 Lead Quente: ${nomeDo(lead)}${r.motivo ? ` — ${r.motivo}` : ""}`);
    }
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
    // Sai pelo número da conversa (decisão #95, item 7)
    const numero = await this.numeroDo(lead);
    if (!numero) return { ok: false, mensagem: "Seu WhatsApp está desconectado. Conecte em WhatsApp e tente de novo." };
    const arquivo = arquivoId ? await prisma.arquivo.findUnique({ where: { id: arquivoId } }) : null;
    if (arquivoId && (!arquivo || arquivo.usuarioId !== usuarioId)) return { ok: false, mensagem: "Arquivo não encontrado." };
    if (!texto.trim() && !arquivo) return { ok: false, mensagem: "Escreva a mensagem ou escolha um arquivo." };
    clearTimeout(this.timers.get(leadId));
    this.timers.delete(leadId);
    const anexo = arquivo ? { caminho: join(this.opcoes.pastaArquivos, arquivo.id), tipo: arquivo.tipo, nome: arquivo.nome } : undefined;
    try {
      await this.remetente.enviar(numero, jidDe(lead.telefone), { texto, anexo });
    } catch (e) {
      this.log.warn({ e, leadId }, "mensagem manual não enviada");
      return { ok: false, mensagem: "Não foi possível enviar. Confira o WhatsApp e tente de novo." };
    }
    await prisma.mensagem.create({
      data: { leadId, autor: AutorMensagem.USUARIO, texto, tipo: arquivo ? tipoDoArquivo(arquivo.tipo) : "texto", arquivoId: arquivo?.id ?? null, arquivoNome: arquivo?.nome ?? null, sessaoId: numero },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: { ultimaMensagemEm: this.agora(), naoLidas: 0, sessaoId: numero, iaPausada: true, iaPausaMotivo: MOTIVO_ASSUMIDA, ...(lead.status === StatusLead.NOVO ? { status: StatusLead.EM_CONVERSA } : {}) },
    });
    return { ok: true, mensagem: "Mensagem enviada." };
  }

  /** Avisos ao usuário pelo número da plataforma (mesma regra dos avisos de campanha). */
  private async avisarUsuario(u: { id: string; cargo: Cargo; whatsapp: string | null; numeroAvisos: string | null }, texto: string) {
    // Também no celular (app — decisão #99)
    await enviarPush(u.id, texto, urlDoAviso(texto)).catch(() => undefined);
    if (!this.opcoes.notificar) return;
    const numero = await numeroDeAvisos(u);
    if (!numero) return;
    await this.opcoes.notificar(numero, texto).catch((e) => this.log.warn({ e }, "aviso pelo WhatsApp não enviado"));
  }

  // ===================== Leads de anúncios (etapa 10b — decisões #84 e #94) =====================

  /** Lead que chegou pelo endereço de anúncios: cadastra (ou encontra) e a IA escreve a primeira mensagem. */
  async atenderAnuncio(id: string) {
    if (this.emAtendimento.has(id)) return;
    // Atualização em andamento (decisão #103): o lead fica guardado e a varredura atende depois
    if (await emManutencao()) return;
    this.emAtendimento.add(id);
    try {
      await this.atenderAnuncioAgora(id);
    } finally {
      this.emAtendimento.delete(id);
    }
  }

  private async atenderAnuncioAgora(id: string) {
    const a = await prisma.leadAnuncio.findUnique({ where: { id } });
    if (!a || (a.status !== StatusAnuncio.RECEBIDO && a.status !== StatusAnuncio.AGUARDANDO_WHATSAPP)) return;
    const primeiraVez = !a.leadId;
    const lead = a.leadId ? await prisma.lead.findUnique({ where: { id: a.leadId }, include: { usuario: { include: { empresa: true } } } }) : await this.leadDoAnuncio(a);
    if (!lead) {
      await prisma.leadAnuncio.update({ where: { id }, data: { status: StatusAnuncio.ERRO, erro: "Não foi possível cadastrar o lead." } });
      return;
    }
    if (primeiraVez) {
      await prisma.leadAnuncio.update({ where: { id }, data: { leadId: lead.id } });
      void this.avisar("ANUNCIO", lead.usuarioId, `📣 Novo lead de anúncio: ${nomeDo(lead)}${a.assunto ? ` — ${a.assunto.split("\n")[0]!.slice(0, 100)}` : ""}`);
    }
    const dono = lead.usuario;
    if (!dono.iaConversas || lead.iaPausada) {
      await prisma.leadAnuncio.update({ where: { id }, data: { status: StatusAnuncio.ERRO, erro: "IA desligada ou conversa assumida: responda pela tela Conversas IA." } });
      return;
    }
    // WhatsApp desconectado: o lead espera e o usuário é avisado uma vez (decisão #84)
    // Lead de anúncio: começa pelo número principal; desconectado, por outro conectado (decisão #95, item 6)
    if (!(await this.numeroDo(lead, dono.id))) {
      if (a.status !== StatusAnuncio.AGUARDANDO_WHATSAPP) {
        await prisma.leadAnuncio.update({ where: { id }, data: { status: StatusAnuncio.AGUARDANDO_WHATSAPP } });
        await this.avisarUsuario(dono, `⚠️ FilaPro Leads: chegou um lead de anúncio (${nomeDo(lead)}), mas o seu WhatsApp está desconectado. A IA atende assim que ele reconectar: abra FilaPro Leads → WhatsApp.`);
      }
      return;
    }
    const ficha = await fichaDoUsuario(dono);
    const recentes = (await prisma.mensagem.findMany({ where: { leadId: lead.id }, orderBy: { criadoEm: "desc" }, take: MENSAGENS_RECENTES })).reverse();
    const formulario = [a.nome ? `Nome: ${a.nome}` : "", a.email ? `E-mail: ${a.email}` : "", a.assunto].filter(Boolean).join("\n");
    let r;
    try {
      r = await responderConversa(
        { ficha: ficha.texto, comoQualificar: ficha.comoQualificar, resumo: lead.resumoConversa, nomeLead: lead.nome, recentes: recentes.map(paraIA), formularioAnuncio: formulario || "(sem detalhes)" },
        { empresaId: lead.empresaId, usuarioId: dono.id },
      );
    } catch (e) {
      this.log.warn({ id, msg: e instanceof ErroIA ? e.message : String(e) }, "IA não escreveu a primeira mensagem");
      return; // a varredura tenta de novo
    }
    if (!(await this.enviarComoEmpresa(lead, r.resposta, AutorMensagem.IA, dono.id))) return;
    const quando = this.agora();
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        qualificacao: r.temperatura, qualificacaoMotivo: r.motivo || null, qualificacaoEm: quando,
        ...(STATUS_DA_IA.includes(lead.status) ? { status: r.status as StatusLead } : {}),
        // O assunto do formulário fica no resumo, para a IA lembrar nas próximas respostas
        resumoConversa: `${lead.resumoConversa ? lead.resumoConversa + "\n" : ""}Veio de anúncio em ${quando.toLocaleDateString("pt-BR")}: ${formulario.replace(/\n/g, "; ").slice(0, 600)}`.slice(-2000),
      },
    });
    await prisma.leadAnuncio.update({ where: { id }, data: { status: StatusAnuncio.ATENDIDO, atendidoEm: quando, erro: null } });
    if (r.temperatura === "QUENTE" && lead.qualificacao !== "QUENTE") void this.avisar("QUENTE", dono.id, `🔥 Lead Quente: ${nomeDo(lead)}${r.motivo ? ` — ${r.motivo}` : ""}`);
  }

  /** Encontra o lead pelo telefone (não duplica — decisão #94) ou cadastra um novo. */
  private async leadDoAnuncio(a: { usuarioId: string; telefone: string; nome: string }) {
    const quem = await prisma.usuario.findUnique({ where: { id: a.usuarioId }, include: { empresa: true } });
    if (!quem) return null;
    const onde = quem.empresaId ? { empresaId: quem.empresaId, telefone: a.telefone } : { usuarioId: quem.id, telefone: a.telefone };
    const incluir = { usuario: { include: { empresa: true } } } as const;
    const existente = await prisma.lead.findFirst({ where: onde, include: incluir });
    if (existente) {
      // Pediu para sair antes, mas agora pediu contato: o bloqueio sai (decisão #94, item 2)
      return prisma.lead.update({
        where: { id: existente.id },
        data: {
          ativo: true,
          ...(existente.status === StatusLead.PEDIU_SAIR ? { status: StatusLead.EM_CONVERSA, pediuSairEm: null } : {}),
          ...(!existente.nome && a.nome ? { nome: a.nome } : {}),
        },
        include: incluir,
      });
    }
    const empresarial = quem.empresa?.modulo === Modulo.EMPRESARIAL;
    const [codigo] = await reservarCodigos(prisma, empresarial ? "lead_empresa" : "lead_individual", 1);
    const novo = await prisma.lead.create({
      data: { codigo: codigo!, nome: a.nome, telefone: a.telefone, usuarioId: quem.id, empresaId: quem.empresaId, codigoUsuario: quem.codigo ?? "", codigoEmpresa: quem.empresa?.codigo ?? null },
      include: incluir,
    });
    // Limite de leads: o lead de anúncio entra mesmo assim e o usuário é avisado (decisão #94, item 3)
    const acima = await this.acimaDoLimite(quem);
    if (acima) await this.avisarUsuario(quem, `ℹ️ FilaPro Leads: o lead de anúncio ${nomeDo(novo)} foi cadastrado mesmo com o ${acima} atingido.`);
    return novo;
  }

  private async acimaDoLimite(u: { id: string; limiteLeads: number | null; empresaId: string | null; empresa: { limiteLeads: number | null } | null }) {
    if (u.limiteLeads != null && (await prisma.lead.count({ where: { usuarioId: u.id } })) > u.limiteLeads) return `limite de ${u.limiteLeads} leads do usuário`;
    if (u.empresaId && u.empresa?.limiteLeads != null && (await prisma.lead.count({ where: { empresaId: u.empresaId } })) > u.empresa.limiteLeads) return `limite de ${u.empresa.limiteLeads} leads da conta`;
    return null;
  }

  /** Atende os leads de anúncio que ficaram para trás (serviço fora do ar, WhatsApp desconectado, IA falhou). */
  async varrerAnuncios() {
    const pendentes = await prisma.leadAnuncio.findMany({
      where: { status: { in: [StatusAnuncio.RECEBIDO, StatusAnuncio.AGUARDANDO_WHATSAPP] }, recebidoEm: { lt: new Date(this.agora().getTime() - 30_000) } },
      orderBy: { recebidoEm: "asc" },
      take: 50,
    });
    for (const p of pendentes) await this.atenderAnuncio(p.id).catch((e) => this.log.error({ e, id: p.id }, "falha ao atender lead de anúncio"));
  }

  /** WhatsApp reconectou: leads de anúncio que esperavam e respostas de campanha sem resposta (decisão #94, item 9). */
  async aoConectar(usuarioId: string) {
    // Só os leads deste usuário (o lead pode ser de outro usuário da empresa — quem cadastrou primeiro)
    const esperando = await prisma.leadAnuncio.findMany({ where: { status: StatusAnuncio.AGUARDANDO_WHATSAPP }, select: { id: true, leadId: true } });
    const ids = esperando.map((e) => e.leadId).filter((x): x is string => !!x);
    const meus = new Set((await prisma.lead.findMany({ where: { id: { in: ids }, usuarioId }, select: { id: true } })).map((l) => l.id));
    for (const p of esperando) if (p.leadId && meus.has(p.leadId)) await this.atenderAnuncio(p.id).catch(() => undefined);
    const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!u?.iaConversas) return;
    const desde = new Date(this.agora().getTime() - HORAS_RECONEXAO * 3600_000);
    const leads = await prisma.lead.findMany({
      where: { usuarioId, iaPausada: false, status: { not: StatusLead.PEDIU_SAIR }, ultimaMensagemEm: { gte: desde } },
      select: { id: true, mensagens: { orderBy: { criadoEm: "desc" }, take: 1, select: { autor: true, tipo: true } } },
    });
    for (const l of leads) {
      const ultima = l.mensagens[0];
      if (ultima?.autor !== AutorMensagem.LEAD) continue;
      this.agendar(l.id, () => (ultima.tipo === "audio" ? this.responderAudio(l.id) : this.responder(l.id)));
    }
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
