// Normaliza número de telefone brasileiro para o formato do WhatsApp (JID).
// Aceita "(11) 90000-0000", "11900000000", "+55 11 90000-0000"...

/** Só dígitos, com DDI 55 quando o número veio sem ele (10 ou 11 dígitos). Vazio se inválido. */
export function normalizarNumero(entrada: string): string {
  const d = (entrada || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if (d.length >= 12 && d.length <= 15) return d;
  return "";
}

export function paraJid(entrada: string): string {
  const n = normalizarNumero(entrada);
  return n ? `${n}@s.whatsapp.net` : "";
}

/** "5511900000000:12@s.whatsapp.net" → "5511900000000" (número da conta conectada). */
export function numeroDoJid(jid: string | undefined): string | null {
  if (!jid) return null;
  return jid.split("@")[0]!.split(":")[0]! || null;
}
