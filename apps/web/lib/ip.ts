// Endereço de internet de quem chamou (decisão #163 — S8 do Módulo 1). Funções puras (sem Next.js), testadas à parte.
//
// - O site fica atrás de UM proxy (Caddy): vale a ÚLTIMA entrada do X-Forwarded-For (a que o proxy acrescenta/define),
//   nunca a primeira (que quem chama pode inventar se o proxy só acrescentar).
// - Para LIMITES o IPv6 conta pelo bloco /64 (quem tem IPv6 recebe um /64 inteiro: bilhões de endereços), e o IPv4
//   escrito em IPv6 (::ffff:a.b.c.d) vira IPv4. Para Logs e alertas vale o endereço completo.

/** Tira colchetes e porta ("[::1]:80", "1.2.3.4:80"), deixa em minúsculas e converte ::ffff:a.b.c.d em IPv4. */
export function limparEndereco(bruto: string): string {
  let s = bruto.trim().toLowerCase().slice(0, 64);
  const colchete = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (colchete) s = colchete[1]!;
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  return mapeado ? mapeado[1]! : s;
}

/** Os 8 grupos de um IPv6 (aceita "::"); null se não for um IPv6 válido. */
function gruposIpv6(s: string): string[] | null {
  if (!s.includes(":") || /[^0-9a-f:.]/.test(s) || s.includes(".")) return null;
  const partes = s.split("::");
  if (partes.length > 2) return null;
  const ini = partes[0] ? partes[0].split(":") : [];
  const fim = partes.length === 2 && partes[1] ? partes[1].split(":") : [];
  const falta = 8 - ini.length - fim.length;
  if (partes.length === 1 ? ini.length !== 8 : falta < 1) return null;
  const todos = [...ini, ...Array(partes.length === 2 ? falta : 0).fill("0"), ...fim];
  return todos.length === 8 && todos.every((g) => /^[0-9a-f]{1,4}$/.test(g)) ? todos.map((g) => g.replace(/^0+(?=.)/, "")) : null;
}

/** Endereço real de quem chamou (última entrada do X-Forwarded-For; senão X-Real-IP); null se não houver. */
export function ipReal(xff: string | null | undefined, realIp?: string | null): string | null {
  const entradas = (xff ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const e = entradas.length ? entradas[entradas.length - 1]! : (realIp ?? "").trim();
  return e ? limparEndereco(e) : null;
}

/** Chave para limites: IPv4 como está; IPv6 pelo bloco /64 ("2001:db8:0:1::/64"). */
export function chaveDeLimite(ip: string): string {
  const g = gruposIpv6(ip);
  return g ? `${g.slice(0, 4).join(":")}::/64` : ip;
}
