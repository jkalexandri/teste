// Vigia do atendimento por IA (decisão #149): a cada minuto confere o estado dos 4 pontos (Leads, Campanhas, Suporte,
// Visitante) e avisa o Super Admin UMA vez a cada mudança: ficou amarelo (falta de chave ou falhas), ficou vermelho
// (desligado) ou voltou ao verde. Manutenção NÃO avisa (acontece a cada atualização do sistema).
// Quando um ponto sai de "desligado" (vermelho) para ligado, chama `aoReligar` para a IA atender quem ficou esperando.
import type { Logger } from "pino";
import { prisma } from "@filapro/db";
import { statusAtendimentoIA, corDeAviso, ROTULO_PONTO, type CorIA, type PontoIA, type StatusPonto } from "@filapro/ia/src/status-atendimento.ts";

export const INTERVALO_VIGIA_MS = 60_000;

const ICONE: Record<CorIA, string> = { VERDE: "🟢", AMARELO: "🟡", VERMELHO: "🔴" };

type Opcoes = {
  /** Avisa o Super Admin (WhatsApp de avisos + celular) */
  avisar: (texto: string) => Promise<void>;
  /** Ponto religado pelo Super Admin: atender quem ficou esperando */
  aoReligar?: (ponto: PontoIA) => Promise<void>;
  agora?: () => Date;
};

/** "Leads, Suporte e Visitante não Cliente" */
const lista = (pontos: StatusPonto[]) => pontos.map((p) => p.rotulo).reduce((t, r, i, a) => (i === 0 ? r : i === a.length - 1 ? `${t} e ${r}` : `${t}, ${r}`), "");

export class VigiaIA {
  private laco: ReturnType<typeof setInterval> | null = null;
  constructor(private log: Logger, private op: Opcoes) {}

  private agora() { return this.op.agora?.() ?? new Date(); }

  iniciar() {
    void this.verificar().catch((e) => this.log.error({ e }, "falha ao conferir o atendimento por IA"));
    this.laco = setInterval(() => void this.verificar().catch((e) => this.log.error({ e }, "falha ao conferir o atendimento por IA")), INTERVALO_VIGIA_MS);
  }
  parar() { if (this.laco) clearInterval(this.laco); }

  async verificar() {
    const status = await statusAtendimentoIA(this.agora());
    const anteriores = new Map((await prisma.estadoIAPonto.findMany()).map((e) => [e.ponto, e.estado as CorIA]));
    const mudou: { s: StatusPonto; de: CorIA; para: CorIA }[] = [];
    for (const s of status) {
      const para = corDeAviso(s);
      const de = anteriores.get(s.ponto);
      // Primeira vez que vê o ponto (instalação nova): só guarda, não avisa
      await prisma.estadoIAPonto.upsert({ where: { ponto: s.ponto }, create: { ponto: s.ponto, estado: para }, update: de === para ? {} : { estado: para, desde: this.agora() } });
      if (de && de !== para) mudou.push({ s, de, para });
    }
    // Um aviso por tipo de mudança (os 3 pontos de conversa falham juntos: uma mensagem só)
    const hora = this.agora().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    for (const para of ["VERMELHO", "AMARELO", "VERDE"] as CorIA[]) {
      const grupo = mudou.filter((m) => m.para === para);
      if (!grupo.length) continue;
      const pontos = grupo.map((g) => g.s);
      const plural = pontos.length > 1;
      let texto: string;
      if (para === "VERMELHO") texto = `${ICONE[para]} FilaPro Leads: ${plural ? "as IAs de" : "a IA de"} ${lista(pontos)} ${plural ? "foram desligadas" : "foi desligada"} às ${hora}.`;
      else if (para === "AMARELO") texto = `${ICONE[para]} FilaPro Leads: ${plural ? "as IAs de" : "a IA de"} ${lista(pontos)} ${plural ? "estão" : "está"} com atenção às ${hora} — ${pontos[0]!.texto.replace(/^Atenção: /, "")}. Veja em Inteligência Artificial.`;
      else texto = `${ICONE[para]} FilaPro Leads: ${plural ? "as IAs de" : "a IA de"} ${lista(pontos)} ${plural ? "voltaram" : "voltou"} ao normal às ${hora}.`;
      await this.op.avisar(texto).catch((e) => this.log.warn({ e }, "aviso do atendimento por IA não enviado"));
    }
    // Religou (estava desligado e agora não está): a IA atende quem ficou esperando
    for (const m of mudou) if (m.de === "VERMELHO" && m.para !== "VERMELHO") await this.op.aoReligar?.(m.s.ponto).catch((e) => this.log.error({ e, ponto: m.s.ponto }, "falha ao atender quem esperava na religação"));
    return mudou.map((m) => ({ ponto: m.s.ponto, de: m.de, para: m.para }));
  }
}

export { ROTULO_PONTO };
