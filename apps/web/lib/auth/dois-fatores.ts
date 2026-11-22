// Verificação em duas etapas do Super Admin (decisão #105, item 8): código de 6 dígitos do app autenticador
// (Google Authenticator, Microsoft Authenticator, Authy…) no padrão TOTP (RFC 6238) e códigos de recuperação.
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { criptografar, descriptografar } from "@filapro/ia/src/cripto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const QTD_CODIGOS_RECUPERACAO = 10;

function base32(buf: Buffer) {
  let bits = 0, valor = 0, s = "";
  for (const b of buf) { valor = (valor << 8) | b; bits += 8; while (bits >= 5) { s += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) s += B32[(valor << (5 - bits)) & 31];
  return s;
}
function deBase32(s: string) {
  let bits = 0, valor = 0;
  const out: number[] = [];
  for (const c of s.replace(/[\s=]/g, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    valor = (valor << 5) | i; bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Código de 6 dígitos de um instante (passos de 30 s). */
export function codigoTotp(segredoB32: string, quando = Date.now()) {
  const passo = Math.floor(quando / 30_000);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(passo));
  const h = createHmac("sha1", deBase32(segredoB32)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  const n = ((h[o]! & 127) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

/** Confere o código aceitando 30 s antes ou depois (relógio do celular um pouco diferente). */
export function conferirTotp(segredoB32: string, codigo: string) {
  const c = codigo.replace(/\D/g, "");
  if (c.length !== 6) return false;
  return [-1, 0, 1].some((d) => {
    const esperado = codigoTotp(segredoB32, Date.now() + d * 30_000);
    return timingSafeEqual(Buffer.from(esperado), Buffer.from(c));
  });
}

export function novoSegredo() { return base32(randomBytes(20)); }
export const guardarSegredo = (s: string) => criptografar(s);
export const lerSegredo = (salvo: string) => descriptografar(salvo);

/** Endereço lido pelo app autenticador (QR Code). */
export function urlOtpauth(segredoB32: string, email: string) {
  const rotulo = encodeURIComponent(`FilaPro Leads:${email}`);
  return `otpauth://totp/${rotulo}?secret=${segredoB32}&issuer=${encodeURIComponent("FilaPro Leads")}&algorithm=SHA1&digits=6&period=30`;
}

const hashCodigo = (c: string) => createHash("sha256").update(c.replace(/[^A-Z0-9]/gi, "").toUpperCase()).digest("hex");

/** 10 códigos de recuperação (mostrados uma vez); no banco fica só o hash. */
export function novosCodigosRecuperacao() {
  const codigos = Array.from({ length: QTD_CODIGOS_RECUPERACAO }, () => {
    const s = base32(randomBytes(5)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codigos, hashes: codigos.map(hashCodigo) };
}

/** Se o código de recuperação existir, devolve a lista sem ele (cada um vale uma vez); senão null. */
export function usarCodigoRecuperacao(hashes: string[], codigo: string) {
  const h = hashCodigo(codigo);
  return hashes.includes(h) ? hashes.filter((x) => x !== h) : null;
}
