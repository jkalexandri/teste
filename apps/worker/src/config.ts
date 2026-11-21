// Configuração do serviço 24/7 (lida das variáveis de ambiente da VPS).
import { createHash } from "node:crypto";

function obrigatoria(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida. Veja apps/worker/.env.example.`);
  return v;
}

export const config = {
  porta: Number(process.env.PORTA || 4000),
  host: process.env.HOST || "127.0.0.1",
  /** Token compartilhado com o site (Vercel). Toda chamada precisa dele. */
  token: obrigatoria("WORKER_TOKEN"),
  /** Chave de 32 bytes derivada do segredo — criptografa as credenciais do WhatsApp no banco. */
  chaveCripto: createHash("sha256").update(obrigatoria("CHAVE_CRIPTO")).digest(),
  /** Nível do log (info em produção). */
  nivelLog: process.env.NIVEL_LOG || "info",
  /** Pasta dos anexos das campanhas (decisão #67). Na VPS: /opt/filapro/arquivos */
  pastaArquivos: process.env.PASTA_ARQUIVOS || "./arquivos",
};
