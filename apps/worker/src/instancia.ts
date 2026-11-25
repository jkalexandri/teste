// Só um serviço 24/7 por vez (decisão #133 — falha C2 da auditoria do Módulo 4).
// Dois serviços abrindo os mesmos números fazem o WhatsApp derrubar as conexões ("aberto em outro lugar").
// O serviço que está no ar registra isso no banco e confirma a cada 20 s; outro só assume quando
// este libera (desligamento normal) ou para de confirmar por 60 s (travou ou caiu sem liberar).
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { prisma } from "@filapro/db";

const REGISTRO = "servico24h";
export const BATIMENTO_MS = 20_000;
export const LIMITE_MS = 60_000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Instancia {
  readonly id = randomUUID();
  private relogio: ReturnType<typeof setInterval> | null = null;

  constructor(private log: Logger, private opcoes: { esperaMs?: number; batimentoMs?: number; limiteMs?: number; /** só nos testes */ registro?: string } = {}) {}

  private get registro() { return this.opcoes.registro ?? REGISTRO; }

  /** Assume (ou confirma) o registro. true = este serviço é o que está no ar. Feito numa única operação no banco. */
  async tentarAssumir(agora = new Date()): Promise<boolean> {
    const vencido = new Date(agora.getTime() - (this.opcoes.limiteMs ?? LIMITE_MS));
    const n = await prisma.$executeRaw`
      INSERT INTO "ServicoInstancia"(id, dono, "vistoEm") VALUES (${this.registro}, ${this.id}, ${agora})
      ON CONFLICT (id) DO UPDATE SET dono = EXCLUDED.dono, "vistoEm" = EXCLUDED."vistoEm"
      WHERE "ServicoInstancia".dono = EXCLUDED.dono OR "ServicoInstancia"."vistoEm" < ${vencido}`;
    return n === 1;
  }

  /** Espera a vez: enquanto outro serviço estiver no ar, não abre nenhum número. */
  async aguardarVez() {
    let avisou = false;
    while (!(await this.tentarAssumir())) {
      if (!avisou) this.log.warn("Já existe um serviço 24/7 rodando com este banco: aguardando ele parar (nenhum número é aberto).");
      avisou = true;
      await dormir(this.opcoes.esperaMs ?? 10_000);
    }
    this.log.info({ instancia: this.id }, "serviço 24/7 assumiu (único no ar)");
  }

  /** Confirma a cada 20 s. Se outro assumir (este ficou travado mais de 60 s), chama `aoPerder`. */
  iniciarBatimento(aoPerder: () => void) {
    this.relogio = setInterval(() => {
      void this.tentarAssumir().then((ok) => {
        if (!ok) { this.log.fatal("outro serviço 24/7 assumiu: este vai parar"); aoPerder(); }
      }).catch((e) => this.log.warn({ e }, "falha ao confirmar o serviço no ar"));
    }, this.opcoes.batimentoMs ?? BATIMENTO_MS);
  }

  /** Desligamento normal: libera na hora para o próximo serviço assumir sem esperar. */
  async liberar() {
    if (this.relogio) clearInterval(this.relogio);
    this.relogio = null;
    await prisma.servicoInstancia.deleteMany({ where: { id: this.registro, dono: this.id } }).catch(() => undefined);
  }
}
