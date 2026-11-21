// Telefones dos leads (decisão #55).
// - 10 ou 11 dígitos = Brasil (DDD + número): coloca o 55 sozinho.
// - Com "+" ou "00" na frente = número internacional (código do país + número).
// - 12 ou 13 dígitos começando com 55 = Brasil já com o código do país.
// Guardamos só dígitos, com o código do país (ex.: 5511987654321).

/** Devolve o telefone só com dígitos e código do país, ou "" se for inválido. */
export function normalizarTelefone(entrada: unknown): string {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return "";
  const internacional = bruto.startsWith("+") || bruto.startsWith("00");
  let d = bruto.replace(/\D/g, "");
  if (bruto.startsWith("00")) d = d.slice(2);

  if (internacional) {
    if (d.startsWith("55")) return brasilValido(d.slice(2)) ? d : "";
    return d.length >= 8 && d.length <= 15 ? d : "";
  }
  if (d.length === 10 || d.length === 11) return brasilValido(d) ? "55" + d : "";
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return brasilValido(d.slice(2)) ? d : "";
  return "";
}

/** DDD válido (11–99) + fixo (8 dígitos, começa com 2–5) ou celular (9 dígitos, começa com 9). */
function brasilValido(semPais: string) {
  if (!/^\d{10,11}$/.test(semPais)) return false;
  const ddd = Number(semPais.slice(0, 2));
  if (ddd < 11 || ddd > 99 || semPais[0] === "0" || semPais[1] === "0") return false;
  const num = semPais.slice(2);
  return num.length === 9 ? num[0] === "9" : /^[2-5]/.test(num);
}

/** Para exibir: "+55 (11) 98765-4321" ou "+1 3055551234". */
export function formatarTelefone(digitos: string) {
  const m = digitos.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${digitos}`;
}
