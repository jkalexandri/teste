// Motor de disparos (etapa 8b — prompt seção 9, decisões #57, #64–#69).
// Fila guardada no PostgreSQL: cada campanha EM_ANDAMENTO tem envios PENDENTES. Um "corredor" por
// remetente (o WhatsApp de cada usuário) envia um de cada vez, respeitando o Antibloqueio.
// Tudo é relido do banco a cada envio: pausar/cancelar na tela vale na hora, e se o serviço
// reiniciar a campanha continua de onde parou, sem repetir quem já recebeu.
import { join } from "node:path";
import type { Logger } from "pino";
import { prisma, Cargo, StatusCampanha, StatusEnvio, StatusLead } from "@filapro/db";
// Regras puras compartilhadas com o site (import direto do arquivo: funciona igual em ESM e CJS)
import { numeroDeAvisos } from "./avisos.js";
import { MODOS, MAX_SEM_RESPOSTA_30D, PALAVRAS_SAIR, agoraSP, dentroDaJanela, limiteAquecimento, montarMensagem, saudacao } from "@filapro/db/src/envio.ts";

export type Conteudo = { texto: string; anexo?: { caminho: string; tipo: string; nome: string } };

/** O que o motor precisa do WhatsApp (o real é o GerenciadorSessoes; nos testes, um falso). */
export interface Remetente {
  conectado(sessaoId: string): boolean;
  /** Devolve o JID se o número tem WhatsApp, ou null. */
  verificarNumero(sessaoId: string, telefone: string): Promise<string | null>;
  digitando(sessaoId: string, jid: string, ms: number): Promise<void>;
  enviar(sessaoId: string, jid: string, conteudo: Conteudo): Promise<void>;
}

export type ResultadoPasso = { acao: "enviou" | "pulou" | "falhou" | "aguardar" | "nada"; esperaMs: number; motivo?: string };

export const MOTIVO_DESCONECTADO = "Pausada automaticamente: WhatsApp desconectado. Volta sozinha quando reconectar.";
export const MOTIVO_JANELA = "Aguardando janela de envio";
const MOTIVO_LIMITE_DIA = "Limite diário do número atingido — continua no próximo dia de envio";
const MAX_FALHAS_SEGUIDAS = 5;
const MIN_AMOSTRA_SEM_WHATSAPP = 20;
const MAX_SEM_WHATSAPP = 0.3;
const DIA = 86_400_000;

type Estado = { falhasSeguidas: number; noBloco: number; alvoBloco: number | null };

export class MotorDisparos {
  private correndo = new Set<string>();
  private estados = new Map<string, Estado>();
  private relogio: ReturnType<typeof setInterval> | null = null;

  constructor(
    private remetente: Remetente,
    private log: Logger,
    private opcoes: {
      pastaArquivos: string;
      dormir?: (ms: number) => Promise<void>;
      agora?: () => Date;
      sorteio?: () => number;
      /** Só no script de teste real (fora do horário comercial): ignora a janela de envio. */
      ignorarJanela?: boolean;
      /** Envia um aviso pelo WhatsApp da plataforma (decisão #70). */
      notificar?: (para: string, texto: string) => Promise<unknown>;
      /** Mensagem de campanha enviada: guarda no histórico da conversa (etapa 10). */
      aoEnviar?: (leadId: string | null, conteudo: Conteudo, arquivoId: string | null) => Promise<unknown>;
    },
  ) {}

  private agora() { return this.opcoes.agora?.() ?? new Date(); }
  private sorteio() { return this.opcoes.sorteio?.() ?? Math.random(); }
  private dormir(ms: number) { return this.opcoes.dormir ? this.opcoes.dormir(ms) : new Promise<void>((r) => setTimeout(r, ms)); }
  private estado(u: string) {
    let e = this.estados.get(u);
    if (!e) this.estados.set(u, (e = { falhasSeguidas: 0, noBloco: 0, alvoBloco: null }));
    return e;
  }

  /** Liga o motor: confere a fila a cada 15 s. */
  iniciar() {
    if (this.relogio) return;
    this.relogio = setInterval(() => void this.ciclo().catch((e) => this.log.error({ e }, "falha no ciclo de disparos")), 15_000);
    void this.ciclo().catch((e) => this.log.error({ e }, "falha no ciclo de disparos"));
  }
  parar() { if (this.relogio) clearInterval(this.relogio); this.relogio = null; }

  /** Um ciclo: ativa agendadas, retoma as pausadas por desconexão e garante um corredor por remetente. */
  async ciclo() {
    const agora = this.agora();
    await prisma.campanha.updateMany({
      where: { status: StatusCampanha.AGENDADA, agendadaPara: { lte: agora } },
      data: { status: StatusCampanha.EM_ANDAMENTO, iniciadaEm: agora },
    });
    // Pausadas por queda do WhatsApp voltam sozinhas quando ele reconecta
    const autoPausadas = await prisma.campanha.findMany({ where: { status: StatusCampanha.PAUSADA, motivo: MOTIVO_DESCONECTADO }, select: { id: true, usuarioId: true } });
    for (const c of autoPausadas) {
      if (this.remetente.conectado(c.usuarioId)) await prisma.campanha.update({ where: { id: c.id }, data: { status: StatusCampanha.EM_ANDAMENTO, motivo: null } });
    }
    const remetentes = await prisma.campanha.findMany({ where: { status: StatusCampanha.EM_ANDAMENTO }, select: { usuarioId: true }, distinct: ["usuarioId"] });
    for (const { usuarioId } of remetentes) if (!this.correndo.has(usuarioId)) void this.correr(usuarioId);
  }

  /** Corredor de um remetente: envia até acabar a fila (ou até ter que esperar a janela). */
  private async correr(usuarioId: string) {
    this.correndo.add(usuarioId);
    try {
      for (;;) {
        const r = await this.passo(usuarioId);
        if (r.acao === "nada") break;
        await this.dormir(r.esperaMs);
      }
    } catch (e) {
      this.log.error({ e, usuarioId }, "corredor de disparos parou com erro");
    } finally {
      this.correndo.delete(usuarioId);
    }
  }

  /** Um passo da fila de um remetente. Público para os testes. */
  async passo(usuarioId: string): Promise<ResultadoPasso> {
    const agora = this.agora();
    const campanhas = await prisma.campanha.findMany({
      where: { usuarioId, status: StatusCampanha.EM_ANDAMENTO },
      orderBy: [{ iniciadaEm: "asc" }, { criadoEm: "asc" }],
      include: { arquivo: true, usuario: { include: { empresa: true } } },
    });
    const c = campanhas[0];
    if (!c) return { acao: "nada", esperaMs: 0 };
    const ids = campanhas.map((x) => x.id);

    // 1) WhatsApp conectado? Se não, pausa e volta sozinha quando reconectar.
    if (!this.remetente.conectado(usuarioId)) {
      await prisma.campanha.updateMany({ where: { id: { in: ids } }, data: { status: StatusCampanha.PAUSADA, motivo: MOTIVO_DESCONECTADO } });
      await this.avisar(c.id, "desconectado", `⏸️ FilaPro Leads: a campanha "${c.assunto}" foi pausada porque o seu WhatsApp desconectou. Ela volta sozinha quando ele reconectar. Se não voltar, abra o FilaPro Leads → WhatsApp e leia o QR Code.`);
      return { acao: "nada", esperaMs: 0, motivo: "desconectado" };
    }

    // 2) Janela de envio: segunda a sábado, sem feriados, dentro da faixa global (decisão #65)
    const global = await prisma.configEnvio.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
    const u = c.usuario;
    const janela = u.cargo === Cargo.SUPERADMIN || !u.empresa
      ? { inicio: global.janelaInicioSuperAdmin, fim: global.janelaFimSuperAdmin }
      : { inicio: u.empresa.janelaInicio, fim: u.empresa.janelaFim };
    const j = dentroDaJanela(janela, global, agora);
    if (!j.pode && !this.opcoes.ignorarJanela) {
      await prisma.campanha.updateMany({ where: { id: { in: ids }, OR: [{ motivo: null }, { motivo: { not: MOTIVO_JANELA } }] }, data: { motivo: MOTIVO_JANELA } });
      return { acao: "aguardar", esperaMs: 60_000, motivo: j.motivo };
    }

    // 3) Limites do número: por dia (com aquecimento de número novo) e por hora (decisão #64)
    const m = MODOS[c.modo];
    const sessao = await prisma.whatsappSessao.findUnique({ where: { id: usuarioId } });
    const diasConectado = sessao?.primeiraConexaoEm ? Math.floor((agora.getTime() - sessao.primeiraConexaoEm.getTime()) / DIA) : 0;
    const limiteDia = Math.min(m.porDia, limiteAquecimento(diasConectado) ?? Infinity);
    const inicioDia = inicioDoDiaSP(agora);
    const [hoje, ultimaHora] = await Promise.all([
      prisma.envio.count({ where: { campanha: { usuarioId }, status: StatusEnvio.ENVIADO, enviadoEm: { gte: inicioDia } } }),
      prisma.envio.count({ where: { campanha: { usuarioId }, status: StatusEnvio.ENVIADO, enviadoEm: { gte: new Date(agora.getTime() - 3_600_000) } } }),
    ]);
    if (hoje >= limiteDia) {
      await prisma.campanha.updateMany({ where: { id: { in: ids } }, data: { motivo: `${MOTIVO_LIMITE_DIA} (${limiteDia}/dia)` } });
      // Não pausa (decisão #70): continua sozinha no próximo dia de envio; só avisa.
      await this.avisar(c.id, "limite-dia", `ℹ️ FilaPro Leads: o seu número atingiu o limite de ${limiteDia} envios de hoje (proteção contra bloqueio). A campanha "${c.assunto}" continua sozinha no próximo dia de envio.`);
      return { acao: "aguardar", esperaMs: 10 * 60_000, motivo: "limite diário" };
    }
    if (ultimaHora >= m.porHora) return { acao: "aguardar", esperaMs: 60_000, motivo: "limite por hora" };

    // 4) Teste grátis: limite de disparos (decisão #34)
    if (u.empresa?.limiteDisparos != null) {
      const usados = await prisma.envio.count({ where: { campanha: { empresaId: u.empresa.id }, status: StatusEnvio.ENVIADO } });
      if (usados >= u.empresa.limiteDisparos) {
        await this.pausar(c.id, `Limite de ${u.empresa.limiteDisparos} disparos do teste grátis atingido.`);
        return { acao: "aguardar", esperaMs: 0 };
      }
    }

    // 5) Próximo da fila
    const envio = await prisma.envio.findFirst({ where: { campanhaId: c.id, status: StatusEnvio.PENDENTE }, orderBy: { ordem: "asc" }, include: { lead: true } });
    if (!envio) {
      await prisma.campanha.update({ where: { id: c.id }, data: { status: StatusCampanha.CONCLUIDA, concluidaEm: agora, motivo: null } });
      this.log.info({ campanha: c.id }, "campanha concluída");
      return { acao: "aguardar", esperaMs: 0 };
    }
    if (c.motivo === MOTIVO_JANELA || c.motivo?.startsWith(MOTIVO_LIMITE_DIA)) await prisma.campanha.update({ where: { id: c.id }, data: { motivo: null } });

    // 6) Regras do lead
    const pular = await this.motivoParaPular(usuarioId, envio, c.bloqueio24h, agora);
    if (pular) {
      await prisma.envio.update({ where: { id: envio.id }, data: { status: StatusEnvio.PULADO, motivo: pular } });
      return { acao: "pulou", esperaMs: 0, motivo: pular };
    }

    // 7) O número tem WhatsApp? (decisão #64)
    let jid: string | null;
    try {
      jid = await this.remetente.verificarNumero(usuarioId, envio.telefone);
    } catch (e) {
      return this.falha(usuarioId, c.id, envio.id, e);
    }
    if (!jid) {
      await prisma.envio.update({ where: { id: envio.id }, data: { status: StatusEnvio.PULADO, motivo: "Sem WhatsApp" } });
      await this.conferirSemWhatsapp(c.id);
      return { acao: "pulou", esperaMs: 2_000, motivo: "sem WhatsApp" };
    }

    // 8) Monta o texto: versão sorteada (Randomização), saudação variada, data/hora e descadastro
    const versoes = [c.mensagem, ...c.variacoes].map((t, i) => ({ t, i })).filter((x) => x.t.trim());
    const escolhida = c.randomizar ? versoes[Math.floor(this.sorteio() * versoes.length)] ?? versoes[0]! : versoes[0]!;
    const texto = montarMensagem(escolhida.t, {
      nome: envio.nome,
      saudacao: saudacao(this.sorteio() * 3, agoraSP(agora).minutos),
      descadastro: c.descadastro,
      textoDescadastro: c.textoDescadastro,
      incluirDataHora: c.incluirDataHora,
      quando: agora,
    });
    const anexo = c.arquivo ? { caminho: join(this.opcoes.pastaArquivos, c.arquivo.id), tipo: c.arquivo.tipo, nome: c.arquivo.nome } : undefined;

    // 9) "Digitando…" proporcional ao texto, e envia
    try {
      await this.remetente.digitando(usuarioId, jid, Math.min(8_000, 1_500 + texto.length * 40));
      await this.remetente.enviar(usuarioId, jid, { texto, anexo });
    } catch (e) {
      return this.falha(usuarioId, c.id, envio.id, e);
    }
    await prisma.envio.update({ where: { id: envio.id }, data: { status: StatusEnvio.ENVIADO, enviadoEm: this.agora(), versao: escolhida.i, motivo: null } });
    await this.opcoes.aoEnviar?.(envio.leadId, { texto, anexo }, c.arquivo?.id ?? null).catch((e) => this.log.warn({ e }, "histórico da conversa não gravado"));
    if (await this.conferirSemWhatsapp(c.id)) return { acao: "enviou", esperaMs: 0 };

    // 10) Ritmo: intervalo sorteado; pausa maior a cada bloco de tamanho variável (±10%)
    const e = this.estado(usuarioId);
    e.falhasSeguidas = 0;
    e.noBloco++;
    e.alvoBloco ??= Math.round(m.bloco * (0.9 + this.sorteio() * 0.2));
    if (e.noBloco >= e.alvoBloco) {
      e.noBloco = 0;
      e.alvoBloco = null;
      return { acao: "enviou", esperaMs: m.esperaMin * 60_000, motivo: "pausa entre blocos" };
    }
    return { acao: "enviou", esperaMs: Math.round((m.segMin + this.sorteio() * (m.segMax - m.segMin)) * 1000) };
  }

  /** Lead inativo, que pediu para sair, bloqueio 24h ou 2 mensagens sem resposta em 30 dias. */
  private async motivoParaPular(usuarioId: string, envio: { telefone: string; leadId: string | null; lead: { ativo: boolean; status: StatusLead; ultimaRespostaEm: Date | null } | null }, bloqueio24h: boolean, agora: Date) {
    if (envio.lead && !envio.lead.ativo) return "Lead inativo";
    if (envio.lead?.status === StatusLead.PEDIU_SAIR) return "Pediu para sair";
    if (bloqueio24h) {
      const recente = await prisma.envio.count({ where: { telefone: envio.telefone, status: StatusEnvio.ENVIADO, enviadoEm: { gte: new Date(agora.getTime() - DIA) }, campanha: { usuarioId } } });
      if (recente > 0) return "Bloqueio 24h";
    }
    const desde = new Date(Math.max(agora.getTime() - 30 * DIA, envio.lead?.ultimaRespostaEm?.getTime() ?? 0));
    const semResposta = await prisma.envio.count({ where: { telefone: envio.telefone, status: StatusEnvio.ENVIADO, enviadoEm: { gt: desde }, campanha: { usuarioId } } });
    if (semResposta >= MAX_SEM_RESPOSTA_30D) return "2 mensagens sem resposta em 30 dias";
    return null;
  }

  /** Mais de 30% dos números sem WhatsApp (com pelo menos 20 processados) pausa a campanha (decisão #64). */
  private async conferirSemWhatsapp(campanhaId: string) {
    const [semWa, processados] = await Promise.all([
      prisma.envio.count({ where: { campanhaId, motivo: "Sem WhatsApp" } }),
      prisma.envio.count({ where: { campanhaId, status: { not: StatusEnvio.PENDENTE } } }),
    ]);
    if (processados >= MIN_AMOSTRA_SEM_WHATSAPP && semWa / processados > MAX_SEM_WHATSAPP) {
      const atual = await prisma.campanha.findUnique({ where: { id: campanhaId }, select: { motivo: true } });
      if (atual?.motivo?.includes("não têm WhatsApp")) return false; // já avisou; o usuário decidiu retomar
      await this.pausar(campanhaId, `Pausada automaticamente: ${Math.round((semWa / processados) * 100)}% dos números não têm WhatsApp. Confira a lista antes de retomar.`);
      return true;
    }
    return false;
  }

  private async falha(usuarioId: string, campanhaId: string, envioId: string, erro: unknown): Promise<ResultadoPasso> {
    const msg = erro instanceof Error ? erro.message : String(erro);
    await prisma.envio.update({ where: { id: envioId }, data: { status: StatusEnvio.FALHOU, motivo: msg.slice(0, 200) } });
    const e = this.estado(usuarioId);
    e.falhasSeguidas++;
    this.log.warn({ usuarioId, campanhaId, erro: msg }, "falha no envio");
    if (e.falhasSeguidas >= MAX_FALHAS_SEGUIDAS) {
      e.falhasSeguidas = 0;
      await this.pausar(campanhaId, `Pausada automaticamente: ${MAX_FALHAS_SEGUIDAS} falhas seguidas. Confira o WhatsApp antes de retomar.`);
    }
    return { acao: "falhou", esperaMs: 10_000, motivo: msg };
  }

  private async pausar(campanhaId: string, motivo: string) {
    this.log.warn({ campanhaId, motivo }, "campanha pausada automaticamente");
    const c = await prisma.campanha.update({ where: { id: campanhaId }, data: { status: StatusCampanha.PAUSADA, motivo } });
    await this.avisar(campanhaId, "pausa", `⏸️ FilaPro Leads: a campanha "${c.assunto}" foi pausada. ${motivo.replace(/^Pausada automaticamente:\s*/, "")}`);
  }

  /**
   * Aviso ao usuário pelo WhatsApp da plataforma (decisão #70), no máximo uma vez por dia
   * para cada tipo de aviso e campanha. Destino: WhatsApp do usuário; no Super Admin, o número de avisos.
   */
  private async avisar(campanhaId: string, tipo: string, texto: string) {
    if (!this.opcoes.notificar) return;
    const c = await prisma.campanha.findUnique({ where: { id: campanhaId }, include: { usuario: true } });
    if (!c) return;
    // Padrão: 1 aviso por dia de cada tipo. "Avisar sempre" (escolhido ao iniciar/agendar — decisão #71):
    // cada problema gera um aviso; o limite diário continua 1 por dia (só acontece uma vez por dia).
    const dia = agoraSP(this.agora()).data;
    const chave = c.avisarSempre && tipo !== "limite-dia" ? `${tipo}|${dia}|${this.agora().getTime()}` : `${tipo}|${dia}`;
    if (c.ultimoAviso === chave) return;
    await prisma.campanha.update({ where: { id: campanhaId }, data: { ultimoAviso: chave } });
    // Número de avisos do usuário (tela Avisos — etapa 10b); sem ele, o WhatsApp do cadastro
    const numero = await numeroDeAvisos(c.usuario);
    if (!numero) return;
    await this.opcoes.notificar(numero, texto).catch((e) => this.log.warn({ e, campanhaId }, "aviso pelo WhatsApp não enviado"));
  }

  /**
   * Mensagem recebida de um lead (decisões #57 e #64):
   * marca a resposta; SAIR/PARAR/STOP → "Pediu para sair"; senão Novo → "Em conversa";
   * e tira o lead da fila das campanhas desse remetente.
   */
  async registrarResposta(usuarioId: string, telefone: string, texto: string) {
    const leads = await prisma.lead.findMany({ where: { usuarioId, telefone } });
    if (!leads.length) return;
    const agora = this.agora();
    const palavra = texto.trim().toUpperCase().replace(/[^A-ZÇÃÕÁÉÍÓÚ]/g, "");
    const sair = PALAVRAS_SAIR.includes(palavra);
    for (const l of leads) {
      await prisma.lead.update({
        where: { id: l.id },
        data: {
          ultimaRespostaEm: agora,
          ...(sair ? { status: StatusLead.PEDIU_SAIR, pediuSairEm: agora } : l.status === StatusLead.NOVO ? { status: StatusLead.EM_CONVERSA } : {}),
        },
      });
      await prisma.envio.updateMany({
        where: { leadId: l.id, status: StatusEnvio.PENDENTE, campanha: { status: { in: [StatusCampanha.EM_ANDAMENTO, StatusCampanha.PAUSADA, StatusCampanha.AGENDADA] } } },
        data: { status: StatusEnvio.PULADO, motivo: sair ? "Pediu para sair" : "Respondeu" },
      });
    }
    this.log.info({ usuarioId, sair }, "resposta de lead registrada");
  }
}

/** Meia-noite de hoje em São Paulo (UTC−3), como Date. */
function inicioDoDiaSP(agora: Date) {
  return new Date(`${agoraSP(agora).data}T00:00:00-03:00`);
}
