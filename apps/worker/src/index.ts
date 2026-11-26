// Serviço 24/7 do FilaPro Leads (VPS — api.filaproleads.com.br).
// Mantém as sessões do WhatsApp ligadas mesmo com ninguém logado no site.
import pino from "pino";
import { prisma } from "@filapro/db";
import { config } from "./config.js";
import { GerenciadorSessoes, SESSAO_PLATAFORMA } from "./sessoes.js";
import { criarApi } from "./api.js";
import { MotorDisparos } from "./disparos.js";
import { Aprendizado } from "./aprender.js";
import { Atendente } from "./conversas.js";
import { Avisador } from "./avisos.js";
import { AvisoQueda } from "./aviso-queda.js";
import { FilaPlataforma } from "./fila-plataforma.js";
import { AtendenteSuporte } from "./suporte-ia.js";
import { VigiaIA } from "./vigia-ia.js";
import { registrarNumerosRepetidos } from "./numero-unico.js";
import { VigiaChaves } from "./chaves-whatsapp.js";
import { criarAlertaSuperAdmin } from "./alerta-super.js";
import { donoDaSessao } from "./numeros.js";
import { AtendenteInteressados } from "./interessados.js";
import { enviarPush } from "./push.js";
import { Disponibilidade } from "./disponibilidade.js";
import { Instancia } from "./instancia.js";

const log = pino({ level: config.nivelLog });
const sessoes = new GerenciadorSessoes(config.chaveCripto, log);
// Empresa | IA (etapa 9b): lê sites, PDFs e imagens e monta a ficha da empresa
const aprendizado = new Aprendizado(log.child({ modulo: "aprender" }), config.pastaArquivos);
// Tudo pelo número da plataforma passa pela fila (decisão #143): cadência, limite por dia e validade
const filaPlataforma = new FilaPlataforma(log.child({ modulo: "fila-plataforma" }), {
  enviarTexto: (para, texto) => sessoes.enviarTexto(SESSAO_PLATAFORMA, para, texto),
  conectado: () => sessoes.conectado(SESSAO_PLATAFORMA),
});
const notificar = (para: string, texto: string) => filaPlataforma.enfileirar(para, texto, "NORMAL");
const notificarSuperAdmin = (para: string, texto: string) => filaPlataforma.enfileirar(para, texto, "ALTA");
// Conversas IA (etapa 10): a IA atende quem responde
// Avisos do usuário (etapa 10b): Quente, anúncio e respondeu, com resumo a cada 10 minutos
const avisador = new Avisador(log.child({ modulo: "avisos" }), { notificar });
const atendente = new Atendente(sessoes, log.child({ modulo: "conversas" }), { pastaArquivos: config.pastaArquivos, notificar, avisos: avisador });
// Chat para interessados (decisão #104): a IA responde quem ainda não é cliente; se não souber, avisa o Super Admin
// Avisa o Super Admin (WhatsApp de avisos, prioridade alta, e notificação no celular)
const avisarSuperAdmin = async (texto: string, url: string) => {
  const cfg = await prisma.configVenda.findUnique({ where: { id: "config" } });
  if (cfg?.numeroAvisos) await notificarSuperAdmin(cfg.numeroAvisos, texto).catch(() => undefined);
  const sas = await prisma.usuario.findMany({ where: { cargo: "SUPERADMIN", status: "ATIVO" }, select: { id: true } });
  for (const s of sas) await enviarPush(s.id, texto, url).catch(() => undefined);
};
const interessados = new AtendenteInteressados(log.child({ modulo: "interessados" }), {
  avisarSuporte: (texto) => avisarSuperAdmin(texto, "/atendimento?aba=interessados"),
});
// IA no suporte dos clientes (decisão #146): responde pelo botão Suporte; passa para o atendente quando preciso
const suporteIA = new AtendenteSuporte(log.child({ modulo: "suporte-ia" }), { avisarSuporte: avisarSuperAdmin });
// Tamanho das chaves do WhatsApp (decisão #155 — B3): resumo semanal e aviso nos Logs do Super Admin; não apaga nada
const vigiaChaves = new VigiaChaves(log.child({ modulo: "chaves-whatsapp" }));
// Uptime medido para a pílula de status do login (decisão #109)
const disponibilidade = new Disponibilidade(log.child({ modulo: "disponibilidade" }));
// Vigia do atendimento por IA (decisão #149): avisa o Super Admin quando um dos 4 pontos muda de cor
// e, ao religar um ponto, a IA atende quem ficou esperando
const vigiaIA = new VigiaIA(log.child({ modulo: "vigia-ia" }), {
  avisar: (texto) => avisarSuperAdmin(texto, "/inteligencia-artificial"),
  aoReligar: async (ponto) => {
    if (ponto === "LEADS") await atendente.religouLeads();
    else if (ponto === "VISITANTE") await interessados.religou();
    else if (ponto === "SUPORTE") await suporteIA.religou();
  },
});
const api = criarApi(sessoes, config.token, log, config.pastaArquivos, aprendizado, atendente, interessados, filaPlataforma, suporteIA, vigiaIA);
// Motor de disparos (etapa 8b): envia as campanhas seguindo o Antibloqueio, 24/7.
const motor = new MotorDisparos(sessoes, log.child({ modulo: "disparos" }), {
  pastaArquivos: config.pastaArquivos,
  // Avisos automáticos ao usuário saem pelo número da plataforma (decisões #51 e #70)
  notificar,
  aoEnviar: (leadId, conteudo, arquivoId, sessaoId) => atendente.registrarCampanha(leadId, conteudo, arquivoId, sessaoId),
});
// Vários números por usuário (etapa 10c): cada mensagem é do usuário dono do número que recebeu
sessoes.aoReceber = async (sessaoId, telefone, texto, extra) => {
  const dono = await donoDaSessao(sessaoId);
  if (!dono) return; // número da plataforma
  await motor.registrarResposta(dono, telefone, texto);
  await atendente.receber(sessaoId, dono, telefone, extra);
};
// Aviso de número caído (decisão #142): 3 min fora, na volta, 2 h fora e desconexão de vez
const avisoQueda = new AvisoQueda(log.child({ modulo: "aviso-queda" }), (donoId, texto) => avisador.avisarSempre(donoId, texto), { enviarSuper: criarAlertaSuperAdmin(log) });
sessoes.aoVoltar = (s) => avisoQueda.voltou(s);
sessoes.aoDesconectarDeVez = (s, motivo) => avisoQueda.desconectou(s, motivo);
sessoes.aoConectar = async (sessaoId) => {
  const dono = await donoDaSessao(sessaoId);
  if (dono) await atendente.aoConectar(dono);
};

// Só um serviço 24/7 por vez (decisão #133): espera a vez antes de abrir a API e os números
const instancia = new Instancia(log);

async function iniciar() {
  await instancia.aguardarVez();
  // Se outro serviço assumir (este travou mais de 60 s), este para sem mexer nos números
  instancia.iniciarBatimento(() => { sessoes.encerrarTudo(); process.exit(1); });
  await api.listen({ port: config.porta, host: config.host });
  log.info(`Serviço no ar em http://${config.host}:${config.porta}`);
  // Os números reconectam aos poucos em segundo plano (decisão #154): o serviço NÃO espera todos para subir o resto
  void sessoes.iniciarTodas().catch((e) => log.error({ e }, "falha ao reconectar as sessões"));
  // Números que já estavam repetidos (decisão #152): só registra nos Logs do Super Admin, sem desconectar ninguém
  void registrarNumerosRepetidos().catch((e) => log.error({ e }, "falha ao conferir números repetidos"));
  atendente.iniciar();
  avisador.iniciar();
  avisoQueda.iniciar();
  filaPlataforma.iniciar();
  vigiaIA.iniciar();
  vigiaChaves.iniciar();
  disponibilidade.iniciar();
  if (config.disparos) motor.iniciar();
  else log.warn("Disparos desligados (DISPAROS=desligado) — use só em testes locais.");
}

// Desligamento limpo (pm2 restart / reinício da VPS): fecha sem deslogar o WhatsApp.
async function desligar(sinal: string) {
  log.info({ sinal }, "desligando");
  motor.parar();
  atendente.parar();
  avisador.parar();
  avisoQueda.parar();
  filaPlataforma.parar();
  vigiaIA.parar();
  vigiaChaves.parar();
  disponibilidade.parar();
  sessoes.encerrarTudo();
  await api.close().catch(() => undefined);
  await instancia.liberar(); // o próximo serviço assume na hora
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
