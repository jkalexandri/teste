// Testes vigia da porta única de cada número e do serviço único (decisão #133 — falhas C2 e A1 da auditoria do Módulo 4).
// Sem os servidores do WhatsApp: a conexão é um "socket" falso que só emite os avisos que o teste mandar.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import pino from "pino";
import { prisma } from "@filapro/db";
import { GerenciadorSessoes } from "../src/sessoes.js";
import { ERRO_OUTRO_LUGAR } from "../src/queda.js";
import { Instancia } from "../src/instancia.js";

const ID = "tst-ses-1";
const ORFA = "tst-ses-orfa";
const BLQ = "tst-ses-blq";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Espera até a condição valer (o banco grava em segundo plano), no máximo 3 s. */
async function ate(cond: () => boolean | Promise<boolean>, ms = 3000) { for (let i = 0; i < ms / 20; i++) { if (await cond()) return true; await espera(20); } return false; }
const status = async () => (await prisma.whatsappSessao.findUnique({ where: { id: ID } }))?.status;

/** Conexão falsa do WhatsApp: guarda os avisos e deixa o teste disparar "close"/"open". */
class SocketFalso {
  ev = new EventEmitter();
  user: { id: string } | undefined;
  fechada = false;
  async logout() { this.fechada = true; }
  end() { this.fechada = true; }
  atualizarLogin() { this.ev.emit("creds.update", {}); }
  cair(codigo: number) { this.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: codigo } } } }); }
  abrir(numero = "5511900001111") { this.user = { id: `${numero}:1@s.whatsapp.net` }; this.ev.emit("connection.update", { connection: "open" }); }
}

/** Falhas simuladas (decisão #144 — M1): erro ao ler o login e erro ao apagar o login */
let falharAuth: unknown = null;
let falharApagar = false;
let sockets: SocketFalso[] = [];
let apagados: string[] = [];
let g: GerenciadorSessoes;

function novoGerenciador() {
  return new GerenciadorSessoes(randomBytes(32), pino({ level: "silent" }), {
    versao: [2, 3000, 1],
    criarSocket: () => { const s = new SocketFalso(); sockets.push(s); return s as never; },
    // Login falso "já pareado" (o celular já leu o QR antes)
    usarAuth: async (idAtual: string) => { if (falharAuth) throw falharAuth; return ({
      state: { creds: { me: { id: "5511900001111:1@s.whatsapp.net" } } as never, keys: { get: async () => ({}), set: async () => undefined } as never },
      // Como o real: só grava se o registro existir (decisão #138)
      salvarCreds: async () => (await prisma.whatsappSessao.count({ where: { id: idAtual } })) > 0,
    }); },
    apagarAuth: async (id: string) => { if (falharApagar) throw new Error("banco fora do ar"); apagados.push(id); },
  });
}

beforeEach(async () => {
  sockets = [];
  apagados = [];
  falharAuth = null; falharApagar = false;
  g?.encerrarTudo();
  g = novoGerenciador();
  await prisma.whatsappSessao.deleteMany({ where: { id: { in: [ID, ORFA, BLQ] } } });
});

after(async () => {
  g?.encerrarTudo();
  await prisma.whatsappSessao.deleteMany({ where: { id: { in: [ID, ORFA, BLQ] } } });
  await prisma.servicoInstancia.deleteMany({ where: { id: "teste-servico" } });
  await prisma.$disconnect();
});

test("cancelar durante a espera da reconexão: nada reabre depois (sem QR fantasma)", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(() => g.reconexaoAgendada(ID))); // queda comum: reconexão agendada para daqui a 2 s
  assert.equal(g.reconexaoAgendada(ID), true);
  await g.desconectar(ID);
  assert.equal(g.reconexaoAgendada(ID), false, "Cancelar desliga o relógio");
  await espera(2300);
  assert.equal(sockets.length, 1, "nenhuma conexão nova depois de cancelar");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).status, "DESCONECTADO");
});

test("conectar durante a espera vira 'tentar agora': uma conexão só, sem duplicar", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(() => g.reconexaoAgendada(ID)));
  await g.conectar(ID);
  assert.equal(sockets.length, 2, "reconectou na hora");
  assert.equal(g.reconexaoAgendada(ID), false);
  await espera(2300);
  assert.equal(sockets.length, 2, "o relógio antigo não abriu uma 3ª conexão");
});

test("conectar duas vezes ao mesmo tempo abre uma conexão só", async () => {
  await Promise.all([g.conectar(ID), g.conectar(ID), g.conectar(ID)]);
  assert.equal(sockets.length, 1);
});

test("aviso atrasado de uma conexão antiga não derruba a conexão nova", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(() => g.reconexaoAgendada(ID)));
  await g.conectar(ID);
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); await espera(150); // "close" repetido da conexão antiga
  assert.equal(g.conectado(ID), true, "a conexão nova continua");
  assert.equal(g.reconexaoAgendada(ID), false, "nenhuma reconexão por causa da conexão antiga");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).status, "CONECTADO");
});

test("'aberto em outro lugar' (440) encerra SEM apagar o login; desconectado pelo celular (401) apaga", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(440); assert.ok(await ate(async () => (await status()) === "DESCONECTADO"));
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "DESCONECTADO");
  assert.equal(s.erro, ERRO_OUTRO_LUGAR);
  assert.deepEqual(apagados, [], "o login continua salvo");
  assert.equal(g.reconexaoAgendada(ID), false, "não fica disputando em loop");
  // Conectar volta (com o login salvo, sem QR)
  await g.conectar(ID);
  assert.equal(sockets.length, 2);
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[1]!.cair(401);
  assert.ok(await ate(() => apagados.length === 1));
  assert.deepEqual(apagados, [ID]);
});

test("serviço único: o 2º não assume enquanto o 1º está no ar; assume quando ele libera ou para de confirmar", async () => {
  await prisma.servicoInstancia.deleteMany({ where: { id: "teste-servico" } });
  const log = pino({ level: "silent" });
  const a = new Instancia(log, { registro: "teste-servico" }), b = new Instancia(log, { registro: "teste-servico" });
  assert.equal(await a.tentarAssumir(), true, "1º serviço assume");
  assert.equal(await a.tentarAssumir(), true, "e confirma");
  assert.equal(await b.tentarAssumir(), false, "2º recusa enquanto o 1º confirma");
  // O 1º travou sem confirmar por mais de 60 s: o 2º assume
  assert.equal(await b.tentarAssumir(new Date(Date.now() + 61_000)), true);
  assert.equal(await a.tentarAssumir(), false, "o 1º percebe que perdeu (e para)");
  // Desligamento normal libera na hora
  await b.liberar();
  assert.equal(await a.tentarAssumir(), true);
  await a.liberar();
});

test("registro apagado com a conexão aberta (usuário excluído): encerra e NÃO recria (decisão #138)", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await prisma.whatsappSessao.delete({ where: { id: ID } }); // o site apagou junto com o usuário
  sockets[0]!.atualizarLogin(); // o WhatsApp atualiza o login: antes isso recriava o registro
  assert.ok(await ate(() => sockets[0]!.fechada), "a conexão foi encerrada (saiu do WhatsApp)");
  assert.ok(await ate(() => apagados.includes(ID)), "o login foi apagado");
  await espera(200);
  assert.equal(await prisma.whatsappSessao.count({ where: { id: ID } }), 0, "o registro não voltou");
  assert.equal(g.conectado(ID), false);
});

test("ao ligar, número sem dono não volta a funcionar: conecta só para sair e é apagado (decisão #138)", async () => {
  await prisma.whatsappSessao.create({ data: { id: ORFA, usuarioId: null, creds: "v1:x:y:z" } });
  await g.iniciarTodas();
  const s = sockets.find((x) => x) ; // a conexão aberta para sair
  assert.ok(s, "abriu a conexão para fazer a saída");
  // o falso aceita qualquer id: acha a conexão do número sem dono
  for (const k of sockets) k.abrir();
  assert.ok(await ate(async () => (await prisma.whatsappSessao.count({ where: { id: ORFA } })) === 0), "registro sem dono apagado");
  assert.ok(apagados.includes(ORFA), "login apagado");
  assert.equal(g.conectado(ORFA), false);
});

test("queda comum: grava 'Reconectando' com quando caiu, tentativa e próxima; ao voltar, limpa (decisão #139)", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const antes = Date.now();
  sockets[0]!.cair(428);
  assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.tentativaReconexao, 1);
  assert.ok(s.quedaEm && s.quedaEm.getTime() >= antes - 1000, "quando caiu");
  assert.ok(s.proximaTentativaEm && s.proximaTentativaEm.getTime() > Date.now(), "próxima tentativa no futuro");
  // "Tentar agora" (Conectar) reconecta na hora; ao abrir, os dados da queda são limpos
  await g.conectar(ID);
  sockets[1]!.abrir();
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const d = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(d.quedaEm, null); assert.equal(d.tentativaReconexao, 0); assert.equal(d.proximaTentativaEm, null);
});

test("ao ligar, número bloqueado (saiu do plano) com login salvo sai do WhatsApp; o registro e as conversas ficam (decisão #140)", async () => {
  const dono = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.create({ data: { id: BLQ, usuarioId: dono, bloqueada: true, creds: "v1:x:y:z", status: "CONECTADO" } });
  await g.iniciarTodas();
  for (const k of sockets) k.abrir();
  assert.ok(await ate(() => apagados.includes(BLQ)), "login apagado");
  const s = await prisma.whatsappSessao.findUnique({ where: { id: BLQ } });
  assert.ok(s, "o registro continua (conversas e apelido guardados)");
  assert.equal(s!.bloqueada, true);
  assert.equal(s!.status, "DESCONECTADO");
  assert.equal(g.conectado(BLQ), false);
});

test("o serviço recusa conectar número bloqueado, venha o pedido de onde vier (decisão #140)", async () => {
  const dono = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.create({ data: { id: BLQ, usuarioId: dono, bloqueada: true } });
  await g.conectar(BLQ);
  assert.equal(sockets.length, 0, "nenhuma conexão aberta");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: BLQ } })).status, "DESCONECTADO");
});

test("aquecimento por chip: o mesmo chip mantém a idade; chip diferente ou sem como comparar recomeça (decisão #141)", async () => {
  const antigo = new Date("2026-10-01T12:00:00Z");
  const idade = async () => (await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).primeiraConexaoEm!.getTime();
  // 1) Mesmo chip reconectado: mantém
  await prisma.whatsappSessao.create({ data: { id: ID, primeiraConexaoEm: antigo, numeroAquecimento: "5511900001111" } });
  await g.conectar(ID);
  sockets[0]!.abrir("5511900001111"); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await espera(150);
  assert.equal(await idade(), antigo.getTime(), "mesmo chip continua com a idade");
  // 2) Outro chip no mesmo espaço: recomeça e registra nos Logs
  await g.desconectar(ID);
  await g.conectar(ID);
  sockets[1]!.abrir("5511977772222");
  assert.ok(await ate(async () => (await idade()) > Date.now() - 60_000), "chip novo recomeça o aquecimento");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).numeroAquecimento, "5511977772222");
  assert.ok(await ate(async () => (await prisma.log.count({ where: { texto: { contains: "+5511977772222): aquecimento recomeça" } } })) > 0), "fica nos Logs");
  // 3) Espaço de antes da regra (sem número para comparar): recomeça por segurança
  await g.desconectar(ID);
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { primeiraConexaoEm: antigo, numeroAquecimento: null } });
  await g.conectar(ID);
  sockets[2]!.abrir("5511977772222");
  assert.ok(await ate(async () => (await idade()) > Date.now() - 60_000), "sem como comparar: recomeça");
  await prisma.log.deleteMany({ where: { texto: { contains: "aquecimento recomeça" } } });
});

test("aviso de queda (decisão #142): ao voltar chama o aviso 'voltou' e limpa as marcas; desconexão de vez avisa na hora com o motivo", async () => {
  const voltas: string[] = [];
  const desconexoes: string[] = [];
  g.aoVoltar = async (s) => { voltas.push(s.id); };
  g.aoDesconectarDeVez = async (s, motivo) => { desconexoes.push(`${s.id}|${motivo}`); };
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z", avisoQuedaEm: new Date(), avisoProblemaEm: new Date() } }); // com login salvo, como em produção
  await g.conectar(ID); // tentar agora
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  assert.ok(await ate(() => voltas.length === 1), "avisou que voltou");
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.avisoQuedaEm, null); assert.equal(s.avisoProblemaEm, null);
  // Queda comum que volta sem ter avisado: não chama "voltou"
  sockets[1]!.cair(428); assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  await g.conectar(ID); sockets[2]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await espera(100);
  assert.equal(voltas.length, 1, "queda sem aviso não gera 'voltou'");
  // Desconectado pelo celular (401): avisa na hora
  sockets[2]!.cair(401);
  assert.ok(await ate(() => desconexoes.length === 1));
  assert.match(desconexoes[0]!, /^tst-ses-1\|O WhatsApp foi desconectado pelo celular/);
  // Cancelar pelo usuário NÃO avisa
  await g.conectar(ID); sockets[3]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await g.desconectar(ID);
  await espera(100);
  assert.equal(desconexoes.length, 1);
});

// ===== M1 (decisão #144): falha ao ABRIR a conexão não deixa o número parado =====
const BANCO_FORA = Object.assign(new Error("Can't reach database server"), { code: "P1001" });
const logsDe = async (trecho: string) => prisma.log.count({ where: { tipo: "WHATSAPP", texto: { contains: trecho } } });

test("M1: falha ao reabrir (banco fora do ar) agenda nova tentativa, mostra o motivo e volta sozinho quando o problema passa", async () => {
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z" } }); // login salvo, como depois de ler o QR
  falharAuth = BANCO_FORA;
  sockets[0]!.cair(428); // reconexão em 2 s — vai falhar ao ler o login
  assert.ok(await ate(async () => (await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).erro === "Banco de dados indisponível.", 4000), "motivo curto na tela");
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO");
  assert.equal(s.tentativaReconexao, 2);
  assert.ok(s.proximaTentativaEm && s.proximaTentativaEm.getTime() > Date.now(), "próxima tentativa marcada");
  assert.equal(g.reconexaoAgendada(ID), true, "NÃO fica parado: há nova tentativa agendada");
  assert.equal(await logsDe("Falha ao reabrir o WhatsApp (Banco de dados indisponível); tentando de novo sozinho"), 1, "1ª falha nos Logs");
  // O problema passa: a próxima tentativa abre a conexão e o número volta sozinho
  falharAuth = null;
  assert.ok(await ate(() => sockets.length === 2, 6000), "reabriu sozinho");
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const d = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(d.erro, null); assert.equal(d.quedaEm, null);
  assert.ok(await ate(async () => (await logsDe("voltou depois de 1 tentativa com falha")) === 1), "recuperação nos Logs");
  await prisma.log.deleteMany({ where: { texto: { contains: "com falha" } } });
});

test("M1: falhas repetidas vão para os Logs só uma vez; o recuo cresce e a tentativa não para", async () => {
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
  await prisma.whatsappSessao.create({ data: { id: ID, creds: "v1:x:y:z", status: "CONECTADO" } });
  falharAuth = BANCO_FORA;
  await g.conectar(ID); // "Tentar agora" com o banco ainda fora
  const um = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(um.status, "RECONECTANDO"); assert.equal(um.tentativaReconexao, 1);
  await g.conectar(ID); // outra vez
  const dois = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(dois.tentativaReconexao, 1, "'Tentar agora' recomeça o recuo");
  assert.equal(g.reconexaoAgendada(ID), true);
  assert.equal(await logsDe("Falha ao reabrir o WhatsApp"), 1, "só a 1ª falha da sequência");
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: login que não descriptografa NÃO é apagado; continua tentando e mostra o motivo", async () => {
  await prisma.whatsappSessao.create({ data: { id: ID, creds: "v1:x:y:z", status: "CONECTADO" } });
  falharAuth = new Error("Formato criptografado inválido");
  await g.conectar(ID);
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO");
  assert.equal(s.erro, "Não foi possível ler o login salvo.");
  assert.equal(s.creds, "v1:x:y:z", "o login continua guardado");
  assert.deepEqual(apagados, [], "nada foi apagado");
  assert.equal(g.reconexaoAgendada(ID), true);
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: primeira conexão (sem login) que falha ao abrir avisa e para, sem tentar sozinha", async () => {
  falharAuth = BANCO_FORA;
  await g.conectar(ID);
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "DESCONECTADO");
  assert.equal(s.erro, "Não foi possível conectar agora. Tente de novo em instantes.");
  assert.equal(g.reconexaoAgendada(ID), false);
});

test("M1: ao ligar o serviço, número que falha ao abrir fica reconectando (sem derrubar os outros)", async () => {
  const dono = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: dono, creds: "v1:x:y:z", status: "CONECTADO" } });
  falharAuth = BANCO_FORA;
  await g.iniciarTodas(); // não pode lançar erro
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO"); assert.equal(g.reconexaoAgendada(ID), true);
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: erro ao tratar a queda (não conseguiu apagar o login) também agenda nova tentativa", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z" } });
  falharApagar = true;
  sockets[0]!.cair(401); // desconectado pelo celular: apagar o login falha por causa do banco
  assert.ok(await ate(() => g.reconexaoAgendada(ID)), "não ficou parado");
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO"); assert.equal(s.erro, "Falha ao abrir a conexão.");
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: a frase mostrada na tela é curta e fixa (sem detalhe técnico)", async () => {
  const { motivoDaFalha } = await import("../src/queda.js");
  assert.equal(motivoDaFalha(BANCO_FORA), "Banco de dados indisponível.");
  assert.equal(motivoDaFalha(new Error("Unsupported state or unable to authenticate data")), "Não foi possível ler o login salvo.");
  assert.equal(motivoDaFalha(new Error("senha=abc123 vazou")), "Falha ao abrir a conexão.");
  assert.equal(motivoDaFalha("qualquer coisa"), "Falha ao abrir a conexão.");
});
