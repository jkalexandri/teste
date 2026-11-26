// Chaves gerais da IA por ponto de atendimento (decisão #149): o Super Admin liga/desliga Leads, Campanhas, Suporte e Visitante.
// Consulta o banco no máximo a cada 5 s (como a manutenção). Se o banco falhar, mantém o último estado.
import { prisma } from "@filapro/db";
import { CAMPO_PONTO, type PontoIA } from "@filapro/ia/src/status-atendimento.ts";

let cache: { dados: Record<PontoIA, boolean> | null; em: number } = { dados: null, em: 0 };

async function ler(): Promise<Record<PontoIA, boolean>> {
  if (cache.dados && Date.now() - cache.em < 5000) return cache.dados;
  try {
    const v = await prisma.configVenda.findUnique({ where: { id: "config" } });
    // Sem registro de configuração: valores de fábrica (Suporte desligado; os outros ligados)
    cache = { dados: { LEADS: v?.[CAMPO_PONTO.LEADS] ?? true, CAMPANHAS: v?.[CAMPO_PONTO.CAMPANHAS] ?? true, SUPORTE: v?.[CAMPO_PONTO.SUPORTE] ?? false, VISITANTE: v?.[CAMPO_PONTO.VISITANTE] ?? true }, em: Date.now() };
  } catch {
    cache.em = Date.now();
    cache.dados ??= { LEADS: true, CAMPANHAS: true, SUPORTE: false, VISITANTE: true };
  }
  return cache.dados!;
}

/** A IA deste ponto está ligada pelo Super Admin? */
export async function pontoLigado(ponto: PontoIA): Promise<boolean> {
  return (await ler())[ponto];
}

/** Para os testes: esquece o estado guardado. */
export function limparCacheIA() { cache = { dados: null, em: 0 }; }

/** Texto de quando um lead de anúncio fica sem IA porque o ponto Leads está desligado (religar procura por ele) */
export const ERRO_LEADS_PLATAFORMA = "IA desligada pela plataforma: responda pela tela Conversas IA.";
