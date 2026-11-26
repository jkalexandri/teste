// Testes vigia da fila do número da plataforma (decisão #143 — falha A7 da auditoria do Módulo 4).
// Relógio e envio falsos: nada espera de verdade nem fala com o WhatsApp.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma } from "@filapro/db";
import { FilaPlataforma, inicioDoDia, type Envio } from "../src/fila-plataforma.js";

const SEG = 1000;
let agora = new Date("2026-11-26T15:00:00Z");
let conectado = true;
let enviados: string[] = [];
let resposta: Envio = { ok: true, mensagem: "ok" };

function nova(opcoes: { limite?: number } = {}) {
  return new FilaPlataforma(pino({ level: "silent" }), {
    enviarTexto: async (para, texto) => { if (resposta.ok) enviados.push(`${para}|${texto}`); return resposta; },
    conectado: () => conectado,
    agora: () => agora,
    intervalo: () => 7 * SEG,
    ...opcoes,
  });
}
const avancar = (s: number) => { agora = new Date(agora.getTime() + s * SEG); };
const situacoes = async () => (await prisma.mensagemPlataforma.findMany({ orderBy: { criadoEm: "asc" } })).map((m) => `${m.texto}:${m.situacao}`);

beforeEach(async () => {
  agora = new Date("2026-11-26T15:00:00Z"); conectado = true; enviados = []; resposta = { ok: true, mensagem: "ok" };
  await prisma.mensagemPlataforma.deleteMany({});
});
after(async () => { await prisma.mensagemPlataforma.deleteMany({}); await prisma.$disconnect(); });

test("cadência: uma mensagem por vez, com o intervalo entre elas", async () => {
  const f = nova();
  for (const t of ["a", "b", "c"]) await f.enfileirar("11987654321", t);
  await f.processar(); assert.equal(enviados.length, 1, "a primeira sai na hora");
  await f.processar(); avancar(5); await f.processar();
  assert.equal(enviados.length, 1, "antes do intervalo não sai a segunda");
  avancar(3); await f.processar(); assert.equal(enviados.length, 2);
  avancar(7); await f.processar(); assert.equal(enviados.length, 3);
  assert.deepEqual(enviados.map((e) => e.split("|")[1]), ["a", "b", "c"], "na ordem de chegada");
  assert.equal(enviados[0]!.split("|")[0], "11987654321");
});

test("prioridade alta passa na frente e não espera o limite do dia; normal espera o dia seguinte", async () => {
  const f = nova({ limite: 1 });
  await f.enfileirar("11987654321", "n1"); await f.enfileirar("11987654321", "n2");
  await f.processar(); // n1 (conta 1 de 1)
  await f.enfileirar("11987654321", "alta", "ALTA");
  avancar(8); await f.processar(); // alta passa do limite
  avancar(8); await f.processar(); // n2 espera: limite do dia
  assert.deepEqual(enviados.map((e) => e.split("|")[1]), ["n1", "alta"]);
  assert.equal(await f.enviadasHoje(), 2);
  avancar(24 * 3600 - 20); // dia seguinte (Brasília)
  await f.enfileirar("11987654321", "n3"); // n2 expirou (6 h); n3 sai
  await f.processar();
  assert.deepEqual(enviados.map((e) => e.split("|")[1]), ["n1", "alta", "n3"]);
  assert.deepEqual(await situacoes(), ["n1:ENVIADA", "n2:EXPIRADA", "alta:ENVIADA", "n3:ENVIADA"]);
});

test("alta sai antes de normal mais antiga", async () => {
  const f = nova();
  await f.enfileirar("11987654321", "normal"); await f.enfileirar("11987654321", "urgente", "ALTA");
  await f.processar();
  assert.equal(enviados[0]!.split("|")[1], "urgente");
});

test("número fora do ar: mensagens ficam guardadas, saem na volta; passou de 6 h, expira", async () => {
  const f = nova();
  conectado = false;
  await f.enfileirar("11987654321", "velha"); avancar(5 * 3600);
  await f.enfileirar("11987654321", "recente");
  await f.processar(); assert.equal(enviados.length, 0, "nada sai com o número fora");
  avancar(2 * 3600); // "velha" passou de 6 h; "recente" tem 2 h
  conectado = true; await f.processar();
  assert.deepEqual(enviados.map((e) => e.split("|")[1]), ["recente"]);
  const s = await situacoes();
  assert.ok(s.includes("velha:EXPIRADA") && s.includes("recente:ENVIADA"), s.join(","));
});

test("falhas: sem WhatsApp é definitiva; 'não conectado' mantém na fila; outro erro tenta 3 vezes", async () => {
  const f = nova();
  await f.enfileirar("11987654321", "x");
  resposta = { ok: false, mensagem: "Este número não tem WhatsApp." };
  await f.processar();
  assert.deepEqual(await situacoes(), ["x:FALHOU"]);
  await prisma.mensagemPlataforma.deleteMany({});
  await f.enfileirar("11987654321", "y");
  resposta = { ok: false, mensagem: "WhatsApp não conectado." };
  avancar(10); await f.processar(); assert.deepEqual(await situacoes(), ["y:PENDENTE"]);
  resposta = { ok: false, mensagem: "erro de rede" };
  for (let i = 0; i < 3; i++) { avancar(10); await f.processar(); }
  assert.deepEqual(await situacoes(), ["y:FALHOU"]);
});

test("número inválido é recusado na hora; aguardar devolve o resultado real", async () => {
  const f = nova();
  const ruim = await f.enfileirar("123", "z");
  assert.equal(ruim.ok, false); assert.equal(await prisma.mensagemPlataforma.count(), 0);
  const r = await f.enfileirar("11987654321", "teste", "ALTA");
  const espera = f.aguardar(r.id!, 3000);
  await f.processar();
  assert.deepEqual(await espera, { ok: true, mensagem: "Mensagem enviada." });
  await f.enfileirar("11987654321", "w");
  resposta = { ok: false, mensagem: "Este número não tem WhatsApp." };
  const r2 = await prisma.mensagemPlataforma.findFirstOrThrow({ where: { texto: "w" } });
  avancar(10); const esp2 = f.aguardar(r2.id, 3000); await f.processar();
  assert.deepEqual(await esp2, { ok: false, mensagem: "Este número não tem WhatsApp." });
});

test("aguardar (botão de teste): sem conexão responde na hora e cancela a mensagem, que não sai depois", async () => {
  const f = nova();
  conectado = false;
  const r = await f.enfileirar("11987654321", "teste");
  const t0 = Date.now();
  assert.deepEqual(await f.aguardar(r.id!, 5000), { ok: false, mensagem: "O número da plataforma não está conectado." });
  assert.ok(Date.now() - t0 < 1500, "não espera à toa");
  conectado = true; await f.processar();
  assert.equal(enviados.length, 0, "a mensagem de teste cancelada não sai na volta");
  assert.deepEqual(await situacoes(), ["teste:EXPIRADA"]);
});

test("dia de Brasília: vira à meia-noite de Brasília (03:00 UTC)", () => {
  assert.equal(inicioDoDia(new Date("2026-11-26T02:59:00Z")).toISOString(), "2026-11-25T03:00:00.000Z");
  assert.equal(inicioDoDia(new Date("2026-11-26T03:00:00Z")).toISOString(), "2026-11-26T03:00:00.000Z");
  assert.equal(inicioDoDia(new Date("2026-11-26T20:00:00Z")).toISOString(), "2026-11-26T03:00:00.000Z");
});
