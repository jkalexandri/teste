// Criptografia das credenciais do WhatsApp guardadas no banco (AES-256-GCM).
// Formato do texto salvo: "v1:<iv base64>:<tag base64>:<dados base64>".
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function criptografar(texto: string, chave: Buffer): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), dados.toString("base64")].join(":");
}

export function descriptografar(salvo: string, chave: Buffer): string {
  const [versao, iv, tag, dados] = salvo.split(":");
  if (versao !== "v1" || !iv || !tag || dados === undefined) throw new Error("Formato criptografado inválido");
  const decifra = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64"));
  decifra.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decifra.update(Buffer.from(dados, "base64")), decifra.final()]).toString("utf8");
}
