// Encerra o atendimento do suporte por inatividade do cliente (decisão #156).
// Depois de uma resposta do Suporte (Super Admin) ou de uma resposta NORMAL da IA, se o cliente não escrever nada por 10 minutos,
// o atendimento é encerrado: uma mensagem do sistema no chat e a conversa ganha o selo "Encerrada" no Atendimento.
// A próxima mensagem do cliente (ou do Super Admin) reabre sozinha, como um novo atendimento.
// NUNCA encerra enquanto o cliente espera o atendente (a IA passou o caso e ninguém respondeu ainda): ali a vez é do Super Admin.
// Só olha conversas ativas nas últimas 24 h: as antigas não são fechadas em massa. Não notifica ninguém.
import type { Logger } from "pino";
import { prisma } from "@filapro/db";

export const INATIVIDADE_MS = 10 * 60_000;
export const JANELA_ATIVA_MS = 24 * 3600_000;
export const INTERVALO_ENCERRAR_MS = 60_000;
export const TEXTO_ENCERRADO = "Atendimento encerrado por inatividade. Se precisar, é só escrever de novo.";
/** Motivo que NÃO significa "esperando o atendente": o Super Admin já está com a conversa */
const MOTIVO_ASSUMIDA = "Assumida pelo Super Admin";

type Opcoes = { agora?: () => Date; inatividadeMs?: number };

export class EncerradorSuporte {
  private laco: ReturnType<typeof setInterval> | null = null;
  constructor(private log: Logger, private o: Opcoes = {}) {}

  private agora() { return this.o.agora?.() ?? new Date(); }

  iniciar() { this.laco = setInterval(() => void this.verificar().catch((e) => this.log.error({ e }, "falha ao encerrar atendimentos do suporte")), INTERVALO_ENCERRAR_MS); }
  parar() { if (this.laco) clearInterval(this.laco); }

  /** Encerra quem passou do limite. Devolve quantos encerrou. */
  async verificar(): Promise<number> {
    const agora = this.agora();
    const limite = new Date(agora.getTime() - (this.o.inatividadeMs ?? INATIVIDADE_MS));
    const candidatas = await prisma.suporteConversa.findMany({
      where: { encerradaEm: null, ultimaMensagemEm: { gte: new Date(agora.getTime() - JANELA_ATIVA_MS) } },
      select: { id: true, usuarioId: true, ultimaMensagemEm: true, iaPausada: true, iaPausaMotivo: true, mensagens: { orderBy: { criadoEm: "desc" }, take: 1, select: { autor: true, criadoEm: true } } },
    });
    let n = 0;
    for (const c of candidatas) {
      const ultima = c.mensagens[0];
      if (!ultima || ultima.criadoEm > limite) continue; // recente (ainda dentro dos 10 min)
      // A vez é do cliente? Última mensagem do Suporte, ou resposta normal da IA. Cliente esperando atendente: nunca encerra.
      const vezDoCliente = ultima.autor === "SUPORTE" || (ultima.autor === "IA" && !(c.iaPausada && c.iaPausaMotivo !== MOTIVO_ASSUMIDA));
      if (!vezDoCliente) continue;
      // Fecha só se nada mudou desde a leitura (o cliente pode ter escrito agora): condição no próprio update
      const r = await prisma.suporteConversa.updateMany({ where: { id: c.id, encerradaEm: null, ultimaMensagemEm: c.ultimaMensagemEm }, data: { encerradaEm: agora } });
      if (r.count !== 1) continue;
      await prisma.suporteMensagem.create({ data: { conversaId: c.id, autor: "SISTEMA", autorId: "sistema", texto: TEXTO_ENCERRADO, tipo: "texto", criadoEm: agora } });
      this.log.info({ usuarioId: c.usuarioId }, "atendimento do suporte encerrado por inatividade");
      n++;
    }
    return n;
  }
}
