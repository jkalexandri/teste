// Vigia do atendimento por IA (decisão #149): um aviso a cada mudança de cor, sem repetir; manutenção não avisa;
// a religação chama a recuperação do ponto. Banco real, relógio e avisos falsos.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma } from "@filapro/db";
import { VigiaIA } from "../src/vigia-ia.js";

let avisos: string[] = [];
let religados: string[] = [];
let agora = new Date("2026-11-26T15:00:00Z");
const vigia = new VigiaIA(pino({ level: "silent" }), { avisar: async (t) => { avisos.push(t); }, aoReligar: async (p) => { religados.push(p); }, agora: () => agora });
let venda: Awaited<ReturnType<typeof prisma.configVenda.findUnique>> = null;
let configs: Awaited<ReturnType<typeof prisma.configIA.findMany>> = [];
let manutAntes: Awaited<ReturnType<typeof prisma.manutencao.findUnique>> = null;
let estadosAntes: Awaited<ReturnType<typeof prisma.estadoIAPonto.findMany>> = [];
const flags = (d: Record<string, boolean>) => prisma.configVenda.update({ where: { id: "config" }, data: d });
const min = (m: number) => new Date(agora.getTime() - m * 60_000);

before(async () => {
  await prisma.configVenda.upsert({ where: { id: "config" }, update: {}, create: { id: "config" } });
  venda = await prisma.configVenda.findUnique({ where: { id: "config" } });
  configs = await prisma.configIA.findMany();
  manutAntes = await prisma.manutencao.findUnique({ where: { id: "geral" } });
  estadosAntes = await prisma.estadoIAPonto.findMany();
});
beforeEach(async () => {
  avisos = []; religados = []; agora = new Date("2026-11-26T15:00:00Z");
  await prisma.usoIA.deleteMany({ where: { erro: "falhou-vigia" } });
  await prisma.estadoIAPonto.deleteMany({});
  await flags({ iaLeadsLigada: true, iaCampanhasLigada: true, iaSuporteLigada: true, iaVisitanteLigada: true });
  await prisma.configIA.deleteMany({});
  const d = { provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 };
  for (const t of ["conversar", "gerar_mensagens"]) await prisma.configIA.create({ data: { tarefa: t, ...d } });
  await prisma.manutencao.upsert({ where: { id: "geral" }, update: { ligada: false }, create: { id: "geral", ligada: false } });
});
after(async () => {
  await prisma.usoIA.deleteMany({ where: { erro: "falhou-vigia" } });
  await prisma.configIA.deleteMany({});
  for (const c of configs) await prisma.configIA.create({ data: c });
  if (venda) await flags({ iaLeadsLigada: venda.iaLeadsLigada, iaCampanhasLigada: venda.iaCampanhasLigada, iaSuporteLigada: venda.iaSuporteLigada, iaVisitanteLigada: venda.iaVisitanteLigada });
  if (manutAntes) await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: manutAntes.ligada } }); else await prisma.manutencao.deleteMany({ where: { id: "geral" } });
  await prisma.estadoIAPonto.deleteMany({});
  for (const e of estadosAntes) await prisma.estadoIAPonto.create({ data: { ponto: e.ponto, estado: e.estado, desde: e.desde } });
  await prisma.$disconnect();
});

test("primeira conferência: só guarda o estado, não avisa ninguém", async () => {
  await flags({ iaSuporteLigada: false }); // Suporte já nasce desligado: sem aviso na instalação
  assert.deepEqual(await vigia.verificar(), []);
  assert.equal(avisos.length, 0);
  assert.equal(await prisma.estadoIAPonto.count(), 4);
});

test("desligar avisa UMA vez; continuar desligado não repete; religar avisa que voltou e chama a recuperação do ponto", async () => {
  await vigia.verificar();
  await flags({ iaLeadsLigada: false });
  await vigia.verificar();
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /^🔴 FilaPro Leads: a IA de Leads foi desligada às \d\d:\d\d\.$/);
  await vigia.verificar(); await vigia.verificar();
  assert.equal(avisos.length, 1, "não repete enquanto estiver desligado");
  assert.deepEqual(religados, []);
  await flags({ iaLeadsLigada: true });
  await vigia.verificar();
  assert.equal(avisos.length, 2);
  assert.match(avisos[1]!, /^🟢 FilaPro Leads: a IA de Leads voltou ao normal às \d\d:\d\d\.$/);
  assert.deepEqual(religados, ["LEADS"], "ao religar, atende quem esperou");
  await vigia.verificar();
  assert.equal(avisos.length, 2); assert.equal(religados.length, 1);
});

test("vários pontos desligados juntos viram um aviso só", async () => {
  await vigia.verificar();
  await flags({ iaLeadsLigada: false, iaCampanhasLigada: false, iaVisitanteLigada: false });
  await vigia.verificar();
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /^🔴 FilaPro Leads: as IAs de Leads, Campanhas e Visitante não Cliente foram desligadas às \d\d:\d\d\.$/);
});

test("falhas da IA: os 3 pontos de conversa ficam amarelos juntos num aviso só; a recuperação avisa o verde; Campanhas não é afetada", async () => {
  await vigia.verificar();
  for (const m of [6, 4, 2]) await prisma.usoIA.create({ data: { tarefa: "conversar", provedor: "simulado", modelo: "simulado", ok: false, erro: "falhou-vigia", criadoEm: min(m) } });
  const mudou = await vigia.verificar();
  assert.deepEqual(mudou.map((m) => m.ponto).sort(), ["LEADS", "SUPORTE", "VISITANTE"]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /^🟡 FilaPro Leads: as IAs de Leads, Suporte e Visitante não Cliente estão com atenção às \d\d:\d\d — 3 falhas da IA nos últimos 15 min\. Veja em Inteligência Artificial\.$/);
  await prisma.usoIA.create({ data: { tarefa: "conversar", provedor: "simulado", modelo: "simulado", ok: true, erro: "falhou-vigia", criadoEm: new Date(agora.getTime() - 1000) } });
  await vigia.verificar();
  assert.equal(avisos.length, 2);
  assert.match(avisos[1]!, /^🟢 .*as IAs de Leads, Suporte e Visitante não Cliente voltaram ao normal/);
  assert.deepEqual(religados, [], "voltar de amarelo para verde não é religar");
});

test("manutenção deixa o ponto amarelo na tela mas NÃO avisa (acontece a cada atualização)", async () => {
  await vigia.verificar();
  await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: true } });
  assert.deepEqual(await vigia.verificar(), []);
  await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: false } });
  assert.deepEqual(await vigia.verificar(), []);
  assert.equal(avisos.length, 0);
});

test("desligado durante a manutenção ou com falhas: religar chama a recuperação (vermelho → qualquer outra cor)", async () => {
  await vigia.verificar();
  await flags({ iaSuporteLigada: false });
  await vigia.verificar();
  assert.match(avisos.at(-1)!, /^🔴 .*Suporte/);
  await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: true } });
  await flags({ iaSuporteLigada: true });
  await vigia.verificar();
  assert.deepEqual(religados, ["SUPORTE"]);
});
