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
async function ate(cond: () => boolean | Promise<boolean>) { for (let i = 0; i < 150; i++) { if (await cond()) return true; await espera(20); } return false; }
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
  abrir() { this.user = { id: "5511900001111:1@s.whatsapp.net" }; this.ev.emit("connection.update", { connection: "open" }); }
}

let sockets: SocketFalso[] = [];
let apagados: string[] = [];
let g: GerenciadorSessoes;

function novoGerenciador() {
  return new GerenciadorSessoes(randomBytes(32), pino({ level: "silent" }), {
    versao: [2, 3000, 1],
    criarSocket: () => { const s = new SocketFalso(); sockets.push(s); return s as never; },
    // Login falso "já pareado" (o celular já leu o QR antes)
    usarAuth: async (idAtual: string) => ({
      state: { creds: { me: { id: "5511900001111:1@s.whatsapp.net" } } as never, keys: { get: async () => ({}), set: async () => undefined } as never },
      // Como o real: só grava se o registro existir (decisão #138)
      salvarCreds: async () => (await prisma.whatsappSessao.count({ where: { id: idAtual } })) > 0,
    }),
    apagarAuth: async (id: string) => { apagados.push(id); },
  });
}

beforeEach(async () => {
  sockets = [];
  apagados = [];
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
