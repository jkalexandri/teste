// Contador de limites em memória (decisão #105; teto de chaves na decisão #163 — S8 do Módulo 1).
// O site roda num processo só (pm2): o contador em memória é rápido e não vira carga no banco numa inundação.
// LIMITAÇÃO CONHECIDA: reiniciar o site zera os contadores. As proteções de alto valor (bloqueio de conta, recuperação de senha,
// verificação em duas etapas) ficam no banco (tabela TentativaLogin). Se o site passar a rodar em MAIS DE UM processo, estes limites
// precisam ir para o banco (ou outro armazenamento compartilhado), senão cada processo teria o seu contador.
const batidas = new Map<string, number[]>();
/** Teto de chaves em memória (decisão #163): passou disso, saem as mais antigas — memória e processador ficam limitados mesmo numa inundação. */
export const MAX_CHAVES = 20_000;

/** true = pode; false = passou do limite (máximo "max" vezes em "janelaMs"). */
export function dentroDoLimite(chave: string, max: number, janelaMs: number) {
  const agora = Date.now();
  const l = (batidas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  const pode = l.length < max;
  if (pode) l.push(agora);
  // Reinsere no fim do mapa (o mais antigo fica no começo) e corta o excesso
  batidas.delete(chave);
  batidas.set(chave, l);
  while (batidas.size > MAX_CHAVES) batidas.delete(batidas.keys().next().value as string);
  return pode;
}

/** Só para os testes. */
export const _limites = { tamanho: () => batidas.size, limpar: () => batidas.clear() };

