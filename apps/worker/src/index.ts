// Serviço 24/7 do FilaPro Leads (VPS — api.filaproleads.com.br).
// Mantém as sessões do WhatsApp ligadas mesmo com ninguém logado no site.
import pino from "pino";
import { prisma } from "@filapro/db";
import { config } from "./config.js";
import { GerenciadorSessoes } from "./sessoes.js";
import { criarApi } from "./api.js";

const log = pino({ level: config.nivelLog });
const sessoes = new GerenciadorSessoes(config.chaveCripto, log);
const api = criarApi(sessoes, config.token, log, config.pastaArquivos);

async function iniciar() {
  await api.listen({ port: config.porta, host: config.host });
  log.info(`Serviço no ar em http://${config.host}:${config.porta}`);
  await sessoes.iniciarTodas();
}

// Desligamento limpo (pm2 restart / reinício da VPS): fecha sem deslogar o WhatsApp.
async function desligar(sinal: string) {
  log.info({ sinal }, "desligando");
  sessoes.encerrarTudo();
  await api.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void desligar("SIGINT"));
process.on("SIGTERM", () => void desligar("SIGTERM"));
// Um erro inesperado numa sessão não pode derrubar as outras.
process.on("unhandledRejection", (e) => log.error({ e }, "erro não tratado"));

iniciar().catch((e) => {
  log.fatal({ e }, "falha ao iniciar");
  process.exit(1);
});
