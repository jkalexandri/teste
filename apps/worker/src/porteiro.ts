// Porteiro das aberturas automáticas de conexão (decisão #154 — M5 da auditoria do Módulo 4).
// Ao ligar o serviço e depois de uma queda geral, todos os números tentariam abrir ao mesmo tempo: rajada de conexões do mesmo IP
// (o WhatsApp pode limitar) e pico de CPU/memória na VPS. O porteiro deixa abrir no máximo `concorrencia` por vez, com
// `intervaloMs` entre o início de uma abertura e a próxima, e atende primeiro quem tem prioridade menor.
// O que o usuário faz (Conectar, Tentar agora, QR, Desconectar) NÃO passa por aqui: é imediato.

export const CONCORRENCIA_PADRAO = 2;
export const INTERVALO_PADRAO_MS = 1500;

type Item = { prioridade: number; ordem: number; iniciar: () => void };

export class Porteiro {
  private fila: Item[] = [];
  private ativos = 0;
  private ultimoInicio = -Infinity;
  private contador = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private agendado = false;
  readonly concorrencia: number;
  readonly intervaloMs: number;

  constructor(o: { concorrencia?: number; intervaloMs?: number } = {}) {
    this.concorrencia = o.concorrencia ?? CONCORRENCIA_PADRAO;
    this.intervaloMs = o.intervaloMs ?? INTERVALO_PADRAO_MS;
  }

  /** Quantas aberturas estão esperando a vez */
  esperando() { return this.fila.length; }

  /**
   * Entra na fila e roda `fn` quando for a vez (menor prioridade primeiro; a mesma prioridade, por ordem de chegada).
   * Resolve (ou rejeita) com o resultado de `fn`; um erro numa abertura não trava a fila.
   */
  executar<T>(prioridade: number, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.fila.push({
        prioridade, ordem: this.contador++,
        iniciar: () => {
          this.ativos++;
          fn().then(resolve, reject).finally(() => { this.ativos--; this.drenar(); });
        },
      });
      // Junta os pedidos do mesmo instante antes de escolher: sem isso o PRIMEIRO pedido começaria na hora e a prioridade
      // não valeria para ele (ao ligar o serviço, o da plataforma tem que sair primeiro mesmo que não seja o 1º da lista)
      if (!this.agendado) { this.agendado = true; queueMicrotask(() => { this.agendado = false; this.drenar(); }); }
    });
  }

  private drenar() {
    if (this.timer) return; // já há um relógio esperando o intervalo
    while (this.fila.length && this.ativos < this.concorrencia) {
      const espera = this.ultimoInicio + this.intervaloMs - Date.now();
      if (espera > 0) { this.timer = setTimeout(() => { this.timer = null; this.drenar(); }, espera); return; }
      // Próximo da fila: menor prioridade; empate, o que chegou primeiro
      let melhor = 0;
      for (let i = 1; i < this.fila.length; i++) {
        const a = this.fila[i]!, b = this.fila[melhor]!;
        if (a.prioridade < b.prioridade || (a.prioridade === b.prioridade && a.ordem < b.ordem)) melhor = i;
      }
      const [item] = this.fila.splice(melhor, 1);
      this.ultimoInicio = Date.now();
      item!.iniciar();
    }
  }

  /** Para os testes e o desligamento: esquece o relógio (a fila pendente fica; o processo vai encerrar). */
  parar() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
