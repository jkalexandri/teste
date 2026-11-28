// Textos entre colchetes que ainda precisam ser trocados (decisão #181). Sem dependências: usado pelo campo de texto grande e testável à parte.

/** Trechos entre colchetes de um texto, como [NOME DA IA] (um por vez, sem repetir). */
export const trechos = (t: string) => [...new Set(t.match(/\[[^\]\n]+\]/g) ?? [])];

/**
 * Trechos que ainda precisam ser trocados (decisão #181). Com texto sugestão, só valem os colchetes QUE VIERAM DO MODELO e continuam no texto
 * (colchetes que a própria pessoa escreveu não são avisados — antes qualquer [ ] disparava o aviso, mesmo quando ela já tinha trocado o modelo).
 * Sem texto sugestão, qualquer trecho entre colchetes conta.
 */
export function colchetesPendentes(texto: string, sugestao?: string): string[] {
  const noTexto = trechos(texto);
  if (!sugestao) return noTexto;
  const doModelo = new Set(trechos(sugestao));
  return noTexto.filter((c) => doModelo.has(c));
}
