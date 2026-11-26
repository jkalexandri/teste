// Fila de saída do número da plataforma (decisão #143 — falha A7 da auditoria do Módulo 4).
// Tudo o que o sistema manda pelo número da plataforma passa por aqui:
// - Cadência: 5 a 10 s (aleatório) entre uma mensagem e a outra — evita rajada de um chip só (risco de bloqueio).
// - Limite: 200 mensagens por dia (dia de Brasília). Prioridade ALTA (Super Admin, suporte, segurança) nunca espera o limite;
//   NORMAL (avisos aos usuários, links de renovação) espera o dia seguinte.
// - Número fora do ar: a mensagem fica guardada e sai na volta; passou de 6 h, expira (ninguém recebe aviso velho).
import type { Logger } from "pino";
import { prisma } from "@filapro/db";
import { paraJid } from "./numero.js";

/** Mesmos valores em apps/web/lib/fila-plataforma.ts (tela Número da plataforma). */
export const LIMITE_DIARIO = 200;
export const INTERVALO_MIN_MS = 5_000;
export const INTERVALO_MAX_MS = 10_000;
export const VALIDADE_MS = 6 * 60 * 60_000;
const GUARDAR_HISTORICO_MS = 3 * 24 * 60 * 60_000;
const TENTATIVAS_MAX = 3;
const DIA_MS = 24 * 60 * 60_000;
/** Brasília é UTC-3 o ano todo (sem horário de verão desde 2019). */
const FUSO_MS = 3 * 60 * 60_000;

export type Prioridade = "ALTA" | "NORMAL";
export type Envio = { ok: boolean; mensagem: string };

/** Começo do dia de Brasília (em UTC) que contém `agora`. */
export function inicioDoDia(agora: Date) {
  return new Date(Math.floor((agora.getTime() - FUSO_MS) / DIA_MS) * DIA_MS + FUSO_MS);
}

type Opcoes = {
  /** Envia o texto pelo número da plataforma (nos testes, falso) */
  enviarTexto: (para: string, texto: string) => Promise<Envio>;
  /** O número da plataforma está conectado? */
  conectado: () => boolean;
  agora?: () => Date;
  /** Sorteia o intervalo (nos testes, fixo) */
  intervalo?: () => number;
  limite?: number;
  validadeMs?: number;
};

export class FilaPlataforma {
  private laco: ReturnType<typeof setInterval> | null = null;
  private ocupada = false;
  private proximoEm = 0;
  private ultimaLimpeza = 0;

  constructor(private log: Logger, private o: Opcoes) {}

  private agora() { return this.o.agora?.() ?? new Date(); }
  private limite() { return this.o.limite ?? LIMITE_DIARIO; }

  iniciar() { this.laco = setInterval(() => void this.processar().catch((e) => this.log.error({ e }, "falha na fila da plataforma")), 2_000); }
  parar() { if (this.laco) clearInterval(this.laco); }

  /** Põe a mensagem na fila. Número inválido é recusado na hora. Devolve o id para acompanhar. */
  async enfileirar(para: string, texto: string, prioridade: Prioridade = "NORMAL"): Promise<{ ok: boolean; mensagem: string; id?: string }> {
    if (!paraJid(para)) return { ok: false, mensagem: "Número inválido." };
    const agora = this.agora();
    const m = await prisma.mensagemPlataforma.create({ data: { para, texto, prioridade, expiraEm: new Date(agora.getTime() + (this.o.validadeMs ?? VALIDADE_MS)) } });
    return { ok: true, mensagem: "Mensagem na fila.", id: m.id };
  }

  /**
   * Espera a mensagem sair (botões de teste da tela): devolve o resultado real.
   * Com o número desconectado, ou se demorar demais, a mensagem de teste é CANCELADA (não fica guardada para sair depois).
   */
  async aguardar(id: string, ateMs = 20_000): Promise<Envio> {
    const cancelar = async (motivo: string): Promise<Envio> => {
      await prisma.mensagemPlataforma.updateMany({ where: { id, situacao: "PENDENTE" }, data: { situacao: "EXPIRADA", erro: motivo } });
      return { ok: false, mensagem: motivo };
    };
    const fim = Date.now() + ateMs;
    while (Date.now() < fim) {
      const m = await prisma.mensagemPlataforma.findUnique({ where: { id } });
      if (!m) return { ok: false, mensagem: "Mensagem não encontrada." };
      if (m.situacao === "ENVIADA") return { ok: true, mensagem: "Mensagem enviada." };
      if (m.situacao === "FALHOU") return { ok: false, mensagem: m.erro || "Não foi possível enviar." };
      if (m.situacao === "EXPIRADA") return { ok: false, mensagem: m.erro || "A mensagem expirou sem sair." };
      if (!this.o.conectado()) return cancelar("O número da plataforma não está conectado.");
      await new Promise((r) => setTimeout(r, 300));
    }
    return cancelar("O número da plataforma está ocupado com outras mensagens. Tente de novo em instantes.");
  }

  async enviadasHoje() {
    return prisma.mensagemPlataforma.count({ where: { situacao: "ENVIADA", enviadaEm: { gte: inicioDoDia(this.agora()) } } });
  }

  /** Um passo: expira as velhas e, se der a hora, envia a próxima da fila (no máximo uma por vez). */
  async processar() {
    if (this.ocupada) return;
    this.ocupada = true;
    try {
      const agora = this.agora();
      await prisma.mensagemPlataforma.updateMany({ where: { situacao: "PENDENTE", expiraEm: { lt: agora } }, data: { situacao: "EXPIRADA", erro: "Expirou sem sair (número fora do ar ou limite do dia)" } });
      // Limpeza do histórico (a cada hora)
      if (agora.getTime() - this.ultimaLimpeza > 60 * 60_000) {
        this.ultimaLimpeza = agora.getTime();
        await prisma.mensagemPlataforma.deleteMany({ where: { situacao: { not: "PENDENTE" }, criadoEm: { lt: new Date(agora.getTime() - GUARDAR_HISTORICO_MS) } } });
      }
      if (!this.o.conectado()) return; // fica guardada; sai na volta
      if (agora.getTime() < this.proximoEm) return; // cadência
      const alta = await prisma.mensagemPlataforma.findFirst({ where: { situacao: "PENDENTE", prioridade: "ALTA" }, orderBy: { criadoEm: "asc" } });
      let m = alta;
      if (!m) {
        // NORMAL só enquanto não passou do limite do dia
        if ((await this.enviadasHoje()) >= this.limite()) return;
        m = await prisma.mensagemPlataforma.findFirst({ where: { situacao: "PENDENTE" }, orderBy: { criadoEm: "asc" } });
      }
      if (!m) return;
      const r = await this.o.enviarTexto(m.para, m.texto).catch((e: unknown) => ({ ok: false, mensagem: String((e as Error)?.message || e) }));
      this.proximoEm = this.agora().getTime() + (this.o.intervalo?.() ?? INTERVALO_MIN_MS + Math.random() * (INTERVALO_MAX_MS - INTERVALO_MIN_MS));
      if (r.ok) {
        await prisma.mensagemPlataforma.update({ where: { id: m.id }, data: { situacao: "ENVIADA", enviadaEm: this.agora() } });
        return;
      }
      // Sem conexão: continua pendente (sem gastar tentativa). Outro erro: tenta até 3 vezes e desiste.
      if (/não conectado/i.test(r.mensagem)) return;
      const definitiva = /não tem WhatsApp|inválido/i.test(r.mensagem) || m.tentativas + 1 >= TENTATIVAS_MAX;
      await prisma.mensagemPlataforma.update({ where: { id: m.id }, data: { tentativas: { increment: 1 }, erro: r.mensagem, ...(definitiva ? { situacao: "FALHOU" } : {}) } });
      this.log.warn({ id: m.id, erro: r.mensagem, definitiva }, "mensagem da plataforma não enviada");
    } finally {
      this.ocupada = false;
    }
  }
}
