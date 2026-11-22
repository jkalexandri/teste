// Preços dos modelos Claude em dólar por 1 milhão de tokens (tabela oficial da Anthropic em nov/2026).
// O Super Admin pode ajustar no menu; para outros provedores ele informa os preços.
export const MODELOS_CLAUDE = [
  { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5 (mais barato)", entrada: 0.1, saida: 0.5 },
  { id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5 (intermediário)", entrada: 2, saida: 10 },
  { id: "claude-opus-5-5", nome: "Claude Opus 5.5 (mais capaz)", entrada: 4, saida: 20 },
] as const;

export const PADRAO = { provedor: "anthropic" as const, modelo: "claude-haiku-5-5", entrada: 0.1, saida: 0.5 };

/**
 * Custo em dólar. Leitura de cache custa 10% do preço de entrada e gravação de cache 125%
 * (regras da Anthropic); nos outros provedores o cache vem zerado.
 */
export function custoUsd(uso: { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }, preco: { entrada: number; saida: number }) {
  return (uso.entrada * preco.entrada + uso.saida * preco.saida + uso.cacheLeitura * preco.entrada * 0.1 + uso.cacheEscrita * preco.entrada * 1.25) / 1_000_000;
}
