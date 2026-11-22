// Números dos disparos para os painéis (etapa 8c — prompt seção 11, decisão #64).
// Tudo calculado a partir da fila (tabela Envio) e dos leads: sem números inventados.
import "server-only";
import { prisma, Prisma } from "@filapro/db";

export type Metricas = {
  enviados: number;       // total enviado
  enviadosHoje: number;   // enviados desde a meia-noite (horário de Brasília)
  fila: number;           // pendentes em campanhas em andamento, agendadas ou pausadas
  bloqueados24h: number;  // contatos protegidos pelo Bloqueio 24h (não receberam de novo antes de 24 h)
  qualificados: number;   // leads qualificados pela IA (etapa 10)
  campanhas: number;      // campanhas criadas (sem contar rascunhos)
  leads: number;
};
export const VAZIO: Metricas = { enviados: 0, enviadosHoje: 0, fila: 0, bloqueados24h: 0, qualificados: 0, campanhas: 0, leads: 0 };

/** Meia-noite de hoje em São Paulo. */
export function inicioDeHoje() {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${d}T00:00:00-03:00`);
}

/** Métricas por usuário (chave = id do usuário). */
export async function metricasPorUsuario(usuarioIds: string[]): Promise<Map<string, Metricas>> {
  const mapa = new Map<string, Metricas>();
  if (!usuarioIds.length) return mapa;
  const ids = Prisma.join(usuarioIds);
  const hoje = inicioDeHoje();
  const [envios, camp, leads] = await Promise.all([
    prisma.$queryRaw<{ u: string; enviados: bigint; hoje: bigint; fila: bigint; bloq: bigint }[]>`
      SELECT c."usuarioId" AS u,
        count(*) FILTER (WHERE e.status = 'ENVIADO') AS enviados,
        count(*) FILTER (WHERE e.status = 'ENVIADO' AND e."enviadoEm" >= ${hoje}) AS hoje,
        count(*) FILTER (WHERE e.status = 'PENDENTE' AND c.status IN ('EM_ANDAMENTO','AGENDADA','PAUSADA')) AS fila,
        count(*) FILTER (WHERE e.status = 'PULADO' AND e.motivo = 'Bloqueio 24h') AS bloq
      FROM "Envio" e JOIN "Campanha" c ON c.id = e."campanhaId"
      WHERE c."usuarioId" IN (${ids})
      GROUP BY c."usuarioId"`,
    prisma.campanha.groupBy({ by: ["usuarioId"], where: { usuarioId: { in: usuarioIds }, status: { not: "RASCUNHO" } }, _count: { _all: true } }),
    prisma.$queryRaw<{ u: string; total: bigint; qualif: bigint }[]>`
      SELECT "usuarioId" AS u, count(*) AS total, count(*) FILTER (WHERE qualificacao IS NOT NULL) AS qualif
      FROM "Lead" WHERE "usuarioId" IN (${ids}) GROUP BY "usuarioId"`,
  ]);
  const pegar = (u: string) => {
    let m = mapa.get(u);
    if (!m) mapa.set(u, (m = { ...VAZIO }));
    return m;
  };
  for (const r of envios) Object.assign(pegar(r.u), { enviados: Number(r.enviados), enviadosHoje: Number(r.hoje), fila: Number(r.fila), bloqueados24h: Number(r.bloq) });
  for (const r of camp) pegar(r.usuarioId).campanhas = r._count._all;
  for (const r of leads) Object.assign(pegar(r.u), { leads: Number(r.total), qualificados: Number(r.qualif) });
  return mapa;
}

/** Soma as métricas de vários usuários (empresa, total geral). */
export function somar(lista: Metricas[]): Metricas {
  return lista.reduce((a, m) => ({
    enviados: a.enviados + m.enviados, enviadosHoje: a.enviadosHoje + m.enviadosHoje, fila: a.fila + m.fila,
    bloqueados24h: a.bloqueados24h + m.bloqueados24h, qualificados: a.qualificados + m.qualificados,
    campanhas: a.campanhas + m.campanhas, leads: a.leads + m.leads,
  }), { ...VAZIO });
}

// ===================== Saúde do número (decisão #64) =====================

export type Saude = {
  nivel: "bom" | "atencao" | "ruim" | "poucos-dados";
  rotulo: string;
  enviados7d: number;
  taxaResposta: number; // %
  taxaFalha: number;    // %
  taxaSair: number;     // %
  taxaSemWhatsapp: number; // %
  dicas: string[];
};

/** Limites usados para classificar a saúde (últimos 7 dias). */
export const LIMITES_SAUDE = {
  minimoEnvios: 20,
  falha: { atencao: 5, ruim: 10 },
  sair: { atencao: 1, ruim: 3 },
  semWhatsapp: { atencao: 15, ruim: 30 },
  respostaBaixa: 5,
};

export async function saudeDoNumero(usuarioId: string): Promise<Saude> {
  const desde = new Date(Date.now() - 7 * 86_400_000);
  const [r] = await prisma.$queryRaw<{ enviados: bigint; falhas: bigint; semwa: bigint; respostas: bigint; sairam: bigint }[]>`
    SELECT
      count(*) FILTER (WHERE e.status = 'ENVIADO') AS enviados,
      count(*) FILTER (WHERE e.status = 'FALHOU') AS falhas,
      count(*) FILTER (WHERE e.motivo = 'Sem WhatsApp') AS semwa,
      count(*) FILTER (WHERE e.status = 'ENVIADO' AND l."ultimaRespostaEm" > e."enviadoEm") AS respostas,
      count(*) FILTER (WHERE e.status = 'ENVIADO' AND l.status = 'PEDIU_SAIR' AND l."pediuSairEm" > e."enviadoEm") AS sairam
    FROM "Envio" e
    JOIN "Campanha" c ON c.id = e."campanhaId"
    LEFT JOIN "Lead" l ON l.id = e."leadId"
    WHERE c."usuarioId" = ${usuarioId} AND e."criadoEm" >= ${desde} AND e.status <> 'PENDENTE'`;
  const enviados = Number(r?.enviados ?? 0), falhas = Number(r?.falhas ?? 0), semwa = Number(r?.semwa ?? 0);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const s: Saude = {
    nivel: "bom", rotulo: "Boa", enviados7d: enviados,
    taxaResposta: pct(Number(r?.respostas ?? 0), enviados),
    taxaFalha: pct(falhas, enviados + falhas),
    taxaSair: pct(Number(r?.sairam ?? 0), enviados),
    taxaSemWhatsapp: pct(semwa, enviados + falhas + semwa),
    dicas: [],
  };
  if (enviados < LIMITES_SAUDE.minimoEnvios) return { ...s, nivel: "poucos-dados", rotulo: "Poucos dados" };
  const L = LIMITES_SAUDE;
  const ruim = s.taxaFalha > L.falha.ruim || s.taxaSair > L.sair.ruim || s.taxaSemWhatsapp > L.semWhatsapp.ruim;
  const atencao = s.taxaFalha > L.falha.atencao || s.taxaSair > L.sair.atencao || s.taxaSemWhatsapp > L.semWhatsapp.atencao || s.taxaResposta < L.respostaBaixa;
  if (s.taxaSair > L.sair.atencao) s.dicas.push("Muitos leads pedindo para sair: revise a mensagem e a lista.");
  if (s.taxaSemWhatsapp > L.semWhatsapp.atencao) s.dicas.push("Muitos números sem WhatsApp: confira a origem da lista.");
  if (s.taxaFalha > L.falha.atencao) s.dicas.push("Muitas falhas de envio: confira a conexão do WhatsApp.");
  if (s.taxaResposta < L.respostaBaixa) s.dicas.push("Poucas respostas: personalize mais a mensagem e evite links no primeiro contato.");
  if (ruim || atencao) s.dicas.push("Use o modo Conservador nas próximas campanhas.");
  return ruim ? { ...s, nivel: "ruim", rotulo: "Ruim" } : atencao ? { ...s, nivel: "atencao", rotulo: "Atenção" } : s;
}

export const COR_SAUDE: Record<Saude["nivel"], { fundo: string; cor: string }> = {
  bom: { fundo: "var(--primary-soft)", cor: "#087a44" },
  atencao: { fundo: "#fff7e0", cor: "#8a5a00" },
  ruim: { fundo: "#ffeef0", cor: "#9e1d2f" },
  "poucos-dados": { fundo: "var(--surface-3)", cor: "var(--muted)" },
};
