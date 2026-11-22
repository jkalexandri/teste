// Serviço 24/7 do FilaPro Leads (VPS — api.filaproleads.com.br).
// Mantém as sessões do WhatsApp ligadas mesmo com ninguém logado no site.
import pino from "pino";
import { prisma } from "@filapro/db";
import { config } from "./config.js";
import { GerenciadorSessoes, SESSAO_PLATAFORMA } from "./sessoes.js";
import { criarApi } from "./api.js";
import { MotorDisparos } from "./disparos.js";
import { Aprendizado } from "./aprender.js";

const log = pino({ level: config.nivelLog });
const sessoes = new GerenciadorSessoes(config.chaveCripto, log);
// Empresa | IA (etapa 9b): lê sites, PDFs e imagens e monta a ficha da empresa
const aprendizado = new Aprendizado(log.child({ modulo: "aprender" }), config.pastaArquivos);
const api = criarApi(sessoes, config.token, log, config.pastaArquivos, aprendizado);
// Motor de disparos (etapa 8b): envia as campanhas seguindo o Antibloqueio, 24/7.
const motor = new MotorDisparos(sessoes, log.child({ modulo: "disparos" }), {
  pastaArquivos: config.pastaArquivos,
  // Avisos automáticos ao usuário saem pelo número da plataforma (decisões #51 e #70)
  notificar: (para, texto) => sessoes.enviarTexto(SESSAO_PLATAFORMA, para, texto),
});
sessoes.aoReceber = (sessaoId, telefone, texto) => motor.registrarResposta(sessaoId, telefone, texto);

async function iniciar() {
  await api.listen({ port: config.porta, host: config.host });
  log.info(`Serviço no ar em http://${config.host}:${config.porta}`);
  await sessoes.iniciarTodas();
  if (config.disparos) motor.iniciar();
  else log.warn("Disparos desligados (DISPAROS=desligado) — use só em testes locais.");
}

// Desligamento limpo (pm2 restart / reinício da VPS): fecha sem deslogar o WhatsApp.
async function desligar(sinal: string) {
  log.info({ sinal }, "desligando");
  motor.parar();
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
