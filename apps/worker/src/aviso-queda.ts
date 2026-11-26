// Aviso de número caído (decisão #142 — falha A6 da auditoria do Módulo 4).
// - 3 min fora (ainda "Reconectando") → avisa que caiu; voltou depois de avisar → avisa que voltou.
// - 2 h fora → avisa que está com problema (a tela mostra o selo "Com problema").
// - Desconectou de vez (pelo celular, bloqueado, aberto em outro lugar, sessão inválida) → avisa na hora, com o motivo.
// Quedas de menos de 3 min não avisam. Cada aviso sai uma vez por queda: a marca fica no banco (não repete após reiniciar).
// Avisos sempre ligados; vão para o dono do número e, com "[Nome]", para o Admin da Empresa.
// Número da plataforma (decisão #143 — A7): o alerta vai ao Super Admin por notificação no celular e e-mail
// (não pelo WhatsApp, que é justamente o que caiu); a tela Número da plataforma mostra o selo "Com problema".
import type { Logger } from "pino";
import { prisma, StatusWhatsapp } from "@filapro/db";
import { SESSAO_PLATAFORMA } from "./sessoes.js";

export const AVISO_QUEDA_MS = 3 * 60_000;
export const AVISO_PROBLEMA_MS = 2 * 60 * 60_000;
const INTERVALO_MS = 30_000;

/** Alerta do número da plataforma: notificação no celular e e-mail de cada Super Admin ativo. */
export type EnviarAlertaSuper = (texto: string) => Promise<void>;

/** Envia o aviso ao dono do número e ao Admin da Empresa dele (Avisador.avisarSempre). */
export type EnviarAviso = (donoId: string, texto: string) => Promise<void>;

/** Hora no horário de Brasília (HH:MM). */
export function horaBrasilia(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Tempo fora em texto: "12 min" ou "2 h 5 min". */
export function tempoFora(ms: number) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/** Nome do número no aviso: o apelido; sem apelido, o número; sem número, "principal"/"extra". */
export function nomeDoNumero(s: { id: string; usuarioId: string | null; apelido: string; numero: string | null }) {
  if (s.id === SESSAO_PLATAFORMA) return "número da plataforma";
  if (s.apelido) return s.apelido;
  const m = s.numero?.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  if (m) return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
  if (s.numero) return `+${s.numero}`;
  return s.id === s.usuarioId ? "principal" : "extra";
}

const plataforma = (s: { id: string }) => s.id === SESSAO_PLATAFORMA;

export class AvisoQueda {
  private laco: ReturnType<typeof setInterval> | null = null;

  constructor(
    private log: Logger,
    private enviar: EnviarAviso,
    private opcoes: { agora?: () => Date; enviarSuper?: EnviarAlertaSuper } = {},
  ) {}

  private agora() { return this.opcoes.agora?.() ?? new Date(); }

  iniciar() { this.laco = setInterval(() => void this.verificar().catch((e) => this.log.error({ e }, "falha ao verificar quedas")), INTERVALO_MS); }
  parar() { if (this.laco) clearInterval(this.laco); }

  /** Confere os números em "Reconectando": avisa com 3 min e com 2 h fora (uma vez cada por queda). */
  async verificar() {
    const agora = this.agora();
    const base = { status: StatusWhatsapp.RECONECTANDO, bloqueada: false, OR: [{ usuarioId: { not: null } }, { id: SESSAO_PLATAFORMA }] };
    const caidos = await prisma.whatsappSessao.findMany({
      where: { AND: [base, { quedaEm: { lte: new Date(agora.getTime() - AVISO_QUEDA_MS) } }, { OR: [{ avisoQuedaEm: null }, { avisoProblemaEm: null }] }] },
      select: { id: true, usuarioId: true, apelido: true, numero: true, quedaEm: true, avisoQuedaEm: true, avisoProblemaEm: true },
    });
    for (const s of caidos) {
      const fora = agora.getTime() - s.quedaEm!.getTime();
      const nome = nomeDoNumero(s);
      // 2 h fora: o aviso de problema já diz tudo; a marca da queda também é gravada (o "voltou" sai depois)
      if (fora >= AVISO_PROBLEMA_MS && !s.avisoProblemaEm) {
        if (!(await this.marcar(s.id, { avisoProblemaEm: null }, { avisoProblemaEm: agora, avisoQuedaEm: s.avisoQuedaEm ?? agora }))) continue;
        await this.avisar(s, plataforma(s)
          ? `🔴 FilaPro Leads: o ${nome} está fora há 2 horas. Pedidos, renovações e avisos ficam na fila e expiram em 6 h. Abra Número da plataforma e toque em Tentar agora; se não voltar, confira o celular dele.`
          : `🔴 FilaPro Leads: seu WhatsApp "${nome}" está fora há 2 horas. Abra FilaPro Leads → WhatsApp e toque em Tentar agora. Se não voltar, confira o celular (internet ligada e WhatsApp aberto).`);
        continue;
      }
      if (!s.avisoQuedaEm && fora < AVISO_PROBLEMA_MS) {
        if (!(await this.marcar(s.id, { avisoQuedaEm: null }, { avisoQuedaEm: agora }))) continue;
        await this.avisar(s, plataforma(s)
          ? `⚠️ FilaPro Leads: o ${nome} caiu às ${horaBrasilia(s.quedaEm!)} e ainda não voltou. O sistema continua tentando sozinho; os avisos ficam na fila e saem quando voltar.`
          : `⚠️ FilaPro Leads: seu WhatsApp "${nome}" caiu às ${horaBrasilia(s.quedaEm!)} e ainda não voltou. O sistema continua tentando sozinho; campanhas e respostas da IA esperam.`);
      }
    }
  }

  /** Grava a marca só se ainda não estava gravada (dois avisos iguais nunca saem). */
  private async marcar(id: string, semMarca: { avisoQuedaEm?: null; avisoProblemaEm?: null }, dados: { avisoQuedaEm?: Date; avisoProblemaEm?: Date }) {
    const r = await prisma.whatsappSessao.updateMany({ where: { id, status: StatusWhatsapp.RECONECTANDO, ...semMarca }, data: dados });
    return r.count === 1;
  }

  /** Chamado quando o número reconecta: avisa que voltou só se já tinha avisado da queda. */
  async voltou(s: { id: string; usuarioId: string | null; apelido: string; numero: string | null; quedaEm: Date | null; avisoQuedaEm: Date | null }) {
    if ((!s.usuarioId && !plataforma(s)) || !s.avisoQuedaEm || !s.quedaEm) return;
    const agora = this.agora();
    const fora = `voltou às ${horaBrasilia(agora)} (ficou ${tempoFora(agora.getTime() - s.quedaEm.getTime())} fora)`;
    await this.avisar(s, plataforma(s) ? `✅ FilaPro Leads: o ${nomeDoNumero(s)} ${fora}. Os avisos da fila estão saindo.` : `✅ FilaPro Leads: seu WhatsApp "${nomeDoNumero(s)}" ${fora}.`);
  }

  /** Chamado quando o número desconecta de vez (sem voltar sozinho): avisa na hora, com o motivo. */
  async desconectou(s: { id: string; usuarioId: string | null; apelido: string; numero: string | null }, motivo: string) {
    if (!s.usuarioId && !plataforma(s)) return;
    await this.avisar(s, plataforma(s)
      ? `⛔ FilaPro Leads: o ${nomeDoNumero(s)} foi desconectado às ${horaBrasilia(this.agora())}. ${motivo} Abra Número da plataforma e leia o QR Code de novo. Até lá, os avisos ficam na fila (expiram em 6 h).`
      : `⛔ FilaPro Leads: seu WhatsApp "${nomeDoNumero(s)}" foi desconectado às ${horaBrasilia(this.agora())}. ${motivo} Abra FilaPro Leads → WhatsApp. Até conectar de novo, campanhas e respostas da IA ficam paradas.`);
  }

  /** Número de usuário → dono (e Admin da Empresa); número da plataforma → Super Admin (celular + e-mail). */
  private async avisar(s: { id: string; usuarioId: string | null }, texto: string) {
    if (plataforma(s)) await this.opcoes.enviarSuper?.(texto).catch((e) => this.log.warn({ e }, "alerta da plataforma não enviado"));
    else await this.enviar(s.usuarioId!, texto).catch((e) => this.log.warn({ e }, "aviso de queda não enviado"));
  }
}
