// Modo manutenção (decisão #103): durante a atualização o serviço não envia campanhas,
// segura as respostas da IA e deixa os leads de anúncios guardados para depois.
import { prisma } from "@filapro/db";

let cache = { ligada: false, em: 0 };

/** Consulta o banco no máximo a cada 5 s. Se o banco falhar (ex.: no meio da migração), mantém o último estado. */
export async function emManutencao(): Promise<boolean> {
  if (Date.now() - cache.em < 5000) return cache.ligada;
  try {
    const m = await prisma.manutencao.findUnique({ where: { id: "geral" } });
    cache = { ligada: !!m?.ligada, em: Date.now() };
  } catch {
    cache.em = Date.now();
  }
  return cache.ligada;
}

/** Para os testes: esquece o estado guardado. */
export function limparCacheManutencao() { cache = { ligada: false, em: 0 }; }
