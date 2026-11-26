// Acompanhamento do tamanho das chaves do WhatsApp (decisão #155 — B3 da auditoria do Módulo 4).
// A tabela `WhatsappChave` guarda uma linha por contato/sessão e só cresce com a exposição do número (no seu uso real, ~88% é
// "lid-mapping": o mapa de quem é quem de TODO contato que o número vê). Aqui só MEDE e AVISA — nada é apagado, porque
// apagar chave do WhatsApp pode quebrar a sessão.
//   - Resumo semanal nos Logs do Super Admin, uma linha por número: chaves, tamanho e o tipo que mais ocupa.
//   - Aviso quando um número passa de 100 mil chaves ou 25 MB, ou o total passa de 150 MB (no máximo 1 por semana por número).
import type { Logger } from "pino";
import { prisma } from "@filapro/db";

export const LIMITE_CHAVES = 100_000;
export const LIMITE_BYTES = 25 * 1024 * 1024;
export const LIMITE_TOTAL_BYTES = 150 * 1024 * 1024;
const SEMANA_MS = 7 * 24 * 3600_000;
export const INTERVALO_CHAVES_MS = 6 * 3600_000;

type Opcoes = { agora?: () => Date; limiteChaves?: number; limiteBytes?: number; limiteTotalBytes?: number };

const mb = (bytes: number) => (bytes / 1024 / 1024).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const milhar = (n: number) => n.toLocaleString("pt-BR");

export class VigiaChaves {
  private laco: ReturnType<typeof setInterval> | null = null;
  constructor(private log: Logger, private o: Opcoes = {}) {}

  private agora() { return this.o.agora?.() ?? new Date(); }

  /** Confere logo depois de ligar (2 min, sem competir com a reconexão dos números) e depois a cada 6 h; cada número só gera 1 resumo por semana. */
  iniciar() {
    setTimeout(() => void this.verificar().catch((e) => this.log.error({ e }, "falha ao medir as chaves do WhatsApp")), 120_000).unref();
    this.laco = setInterval(() => void this.verificar().catch((e) => this.log.error({ e }, "falha ao medir as chaves do WhatsApp")), INTERVALO_CHAVES_MS);
  }
  parar() { if (this.laco) clearInterval(this.laco); }

  async verificar() {
    const agora = this.agora();
    const desde = new Date(agora.getTime() - SEMANA_MS);
    const linhas = await prisma.$queryRaw<{ sessaoId: string; tipo: string; n: number; bytes: number }[]>`
      select "sessaoId", tipo, count(*)::int as n, coalesce(sum(length(valor)), 0)::float8 as bytes from "WhatsappChave" group by 1, 2`;
    if (!linhas.length) return { resumos: 0, avisos: 0 };
    const porSessao = new Map<string, { n: number; bytes: number; maior: { tipo: string; n: number } }>();
    for (const l of linhas) {
      const s = porSessao.get(l.sessaoId) ?? { n: 0, bytes: 0, maior: { tipo: "", n: 0 } };
      s.n += l.n; s.bytes += l.bytes;
      if (l.n > s.maior.n) s.maior = { tipo: l.tipo, n: l.n };
      porSessao.set(l.sessaoId, s);
    }
    const sessoes = await prisma.whatsappSessao.findMany({ where: { id: { in: [...porSessao.keys()] } }, select: { id: true, apelido: true, usuario: { select: { nome: true, email: true } } } });
    const nomeDe = new Map(sessoes.map((s) => [s.id, s.id === "plataforma" ? "plataforma" : `${s.usuario ? `${s.usuario.nome} (${s.usuario.email})` : s.id}${s.apelido ? ` — ${s.apelido}` : ""}`]));
    let resumos = 0, avisos = 0;
    const jaFoi = async (prefixo: string) => (await prisma.log.count({ where: { tipo: "WHATSAPP", empresaId: null, usuarioId: null, quem: "Sistema", criadoEm: { gte: desde }, texto: { startsWith: prefixo } } })) > 0;
    const registrar = (texto: string) => prisma.log.create({ data: { empresaId: null, usuarioId: null, quem: "Sistema", tipo: "WHATSAPP", texto: texto.slice(0, 500) } });
    let totalBytes = 0;
    for (const [id, s] of porSessao) {
      totalBytes += s.bytes;
      const nome = nomeDe.get(id);
      if (!nome) continue; // sessão apagada
      const resumo = `Chaves do WhatsApp (${nome}): `;
      if (!(await jaFoi(resumo))) { await registrar(`${resumo}${milhar(s.n)} chaves, ${mb(s.bytes)} MB; maior tipo: ${s.maior.tipo} (${milhar(s.maior.n)})`); resumos++; }
      if (s.n >= (this.o.limiteChaves ?? LIMITE_CHAVES) || s.bytes >= (this.o.limiteBytes ?? LIMITE_BYTES)) {
        const aviso = `Atenção: chaves do WhatsApp de ${nome} chegaram a `;
        if (!(await jaFoi(aviso))) { await registrar(`${aviso}${milhar(s.n)} chaves (${mb(s.bytes)} MB). Está crescendo mais que o esperado: avise o desenvolvedor antes de ficar pesado.`); avisos++; }
      }
    }
    if (totalBytes >= (this.o.limiteTotalBytes ?? LIMITE_TOTAL_BYTES)) {
      const aviso = "Atenção: o total das chaves do WhatsApp chegou a ";
      if (!(await jaFoi(aviso))) { await registrar(`${aviso}${mb(totalBytes)} MB. Está crescendo mais que o esperado: avise o desenvolvedor antes de ficar pesado.`); avisos++; }
    }
    return { resumos, avisos };
  }
}
