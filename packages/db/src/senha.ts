// Utilidades de senha compartilhadas (web e seed).
// Hash com scrypt (nativo do Node), sal aleatório por senha.
import { randomBytes, scrypt as _scrypt, timingSafeEqual, randomInt } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, 64);
  return ["scrypt", sal.toString("base64"), hash.toString("base64")].join("$");
}

export async function conferirSenha(senha: string, guardado: string | null | undefined): Promise<boolean> {
  if (!guardado) return false;
  const [tipo, salB64, hashB64] = guardado.split("$");
  if (tipo !== "scrypt" || !salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, "base64");
  const calculado = await scrypt(senha, Buffer.from(salB64, "base64"), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

/** Senha temporária forte: 16 caracteres com maiúscula, minúscula, número e especial. */
export function gerarSenhaTemporaria(): string {
  const mai = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const min = "abcdefghjkmnpqrstuvwxyz";
  const num = "23456789";
  const esp = "!@#%&*+-=";
  const todos = mai + min + num + esp;
  const pick = (s: string) => s[randomInt(s.length)];
  const chars = [pick(mai), pick(min), pick(num), pick(esp)];
  while (chars.length < 16) chars.push(pick(todos));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
