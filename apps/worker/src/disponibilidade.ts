// Disponibilidade (decisão #109): a cada minuto no ar, soma 1 minuto na hora atual. Apaga o que passou de 35 dias.
import type { Logger } from "pino";
import { prisma } from "@filapro/db";

export class Disponibilidade {
  private relogio: ReturnType<typeof setInterval> | null = null;
  constructor(private log: Logger) {}

  async marcar(agora = new Date()) {
    const hora = new Date(agora);
    hora.setUTCMinutes(0, 0, 0);
    await prisma.$executeRaw`INSERT INTO "Disponibilidade"(hora, minutos) VALUES (${hora}, 1)
      ON CONFLICT (hora) DO UPDATE SET minutos = LEAST(60, "Disponibilidade".minutos + 1)`;
  }

  iniciar() {
    const tic = () => void this.marcar().catch((e) => this.log.warn({ e }, "falha ao registrar disponibilidade"));
    tic();
    this.relogio = setInterval(tic, 60_000);
    // Limpeza diária
    setInterval(() => void prisma.disponibilidade.deleteMany({ where: { hora: { lt: new Date(Date.now() - 35 * 86400_000) } } }).catch(() => undefined), 24 * 3600_000);
  }

  parar() { if (this.relogio) clearInterval(this.relogio); this.relogio = null; }
}
