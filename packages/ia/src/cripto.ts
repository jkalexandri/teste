// Criptografia da chave de acesso da IA guardada no banco (AES-256-GCM), com o segredo CHAVE_CRIPTO
// (o mesmo do serviço 24/7 — precisa estar na Vercel e na VPS).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function chave() {
  const s = process.env.CHAVE_CRIPTO;
  if (!s) throw new Error("CHAVE_CRIPTO não definida.");
  return createHash("sha256").update(s).digest();
}

export function criptografar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const d = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), d.toString("base64")].join(":");
}

export function descriptografar(salvo: string) {
  const [v, iv, tag, dados] = salvo.split(":");
  if (v !== "v1" || !iv || !tag || dados === undefined) throw new Error("Formato inválido");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
}
