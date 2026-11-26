// Estado dos 4 pontos de atendimento por IA (decisão #149): verde, amarelo e vermelho.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@filapro/db";
import { statusAtendimentoIA, corDeAviso, PONTOS_IA } from "../src/status-atendimento";
import { CHAVE_GLOBAL } from "../src/index";

const AGORA = new Date("2026-11-26T15:00:00Z");
const min = (m: number) => new Date(AGORA.getTime() - m * 60_000);
let venda: Awaited<ReturnType<typeof prisma.configVenda.findUnique>> = null;
let configs: Awaited<ReturnType<typeof prisma.configIA.findMany>> = [];
let manutAntes: Awaited<ReturnType<typeof prisma.manutencao.findUnique>> = null;
const por = async (producao = false) => Object.fromEntries((await statusAtendimentoIA(AGORA, producao)).map((s) => [s.ponto, s]));
const falha = (tarefa: string, ok: boolean, quando: Date) => prisma.usoIA.create({ data: { tarefa, provedor: "simulado", modelo: "simulado", ok, erro: ok ? null : "falhou", criadoEm: quando } });

before(async () => {
  venda = await prisma.configVenda.findUnique({ where: { id: "config" } });
  configs = await prisma.configIA.findMany();
  manutAntes = await prisma.manutencao.findUnique({ where: { id: "geral" } });
});
beforeEach(async () => {
  await prisma.usoIA.deleteMany({ where: { erro: "falhou" } });
  await prisma.usoIA.deleteMany({ where: { provedor: "simulado", modelo: "simulado", criadoEm: { gte: new Date("2026-11-26T00:00:00Z"), lt: new Date("2026-11-27T00:00:00Z") } } });
  await prisma.configVenda.upsert({ where: { id: "config" }, update: { iaLeadsLigada: true, iaCampanhasLigada: true, iaSuporteLigada: true, iaVisitanteLigada: true }, create: { id: "config" } });
  await prisma.configIA.deleteMany({});
  const d = { provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 };
  for (const t of ["conversar", "gerar_mensagens"]) await prisma.configIA.create({ data: { tarefa: t, ...d } });
  await prisma.manutencao.upsert({ where: { id: "geral" }, update: { ligada: false }, create: { id: "geral", ligada: false } });
});
after(async () => {
  await prisma.usoIA.deleteMany({ where: { erro: "falhou" } });
  await prisma.configIA.deleteMany({});
  for (const c of configs) await prisma.configIA.create({ data: c });
  if (venda) await prisma.configVenda.update({ where: { id: "config" }, data: { iaLeadsLigada: venda.iaLeadsLigada, iaCampanhasLigada: venda.iaCampanhasLigada, iaSuporteLigada: venda.iaSuporteLigada, iaVisitanteLigada: venda.iaVisitanteLigada } });
  if (manutAntes) await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: manutAntes.ligada } }); else await prisma.manutencao.deleteMany({ where: { id: "geral" } });
  await prisma.$disconnect();
});

test("tudo ligado e funcionando: os 4 pontos ficam verdes", async () => {
  const s = await por();
  for (const p of PONTOS_IA) { assert.equal(s[p]!.cor, "VERDE", p); assert.equal(s[p]!.texto, "Ligado"); }
});

test("desligado fica vermelho, ponto a ponto, mesmo com a IA com problema", async () => {
  await prisma.configVenda.update({ where: { id: "config" }, data: { iaSuporteLigada: false, iaCampanhasLigada: false } });
  await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: true } });
  const s = await por();
  assert.equal(s.SUPORTE!.cor, "VERMELHO"); assert.equal(s.SUPORTE!.texto, "Desligado");
  assert.equal(s.CAMPANHAS!.cor, "VERMELHO");
  assert.equal(s.LEADS!.cor, "AMARELO", "os ligados seguem com a atenção da manutenção");
});

test("manutenção deixa os ligados amarelos, mas NÃO conta para aviso", async () => {
  await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: true } });
  const s = await por();
  assert.equal(s.LEADS!.cor, "AMARELO"); assert.equal(s.LEADS!.motivo, "MANUTENCAO");
  assert.equal(corDeAviso(s.LEADS!), "VERDE");
  assert.equal(corDeAviso({ cor: "AMARELO", motivo: "FALHAS" }), "AMARELO");
  assert.equal(corDeAviso({ cor: "VERMELHO", motivo: null }), "VERMELHO");
});

test("falta a chave da IA: amarelo (os 3 pontos de conversa juntos; Campanhas à parte)", async () => {
  await prisma.configIA.update({ where: { tarefa: "conversar" }, data: { provedor: "anthropic", chave: null } });
  const s = await por();
  for (const p of ["LEADS", "SUPORTE", "VISITANTE"] as const) { assert.equal(s[p]!.cor, "AMARELO", p); assert.equal(s[p]!.motivo, "CHAVE"); assert.match(s[p]!.texto, /falta a chave da IA/); }
  assert.equal(s.CAMPANHAS!.cor, "VERDE", "Campanhas usa outra tarefa");
  // com a chave única (decisão #78) a tarefa volta ao normal
  await prisma.configIA.create({ data: { tarefa: CHAVE_GLOBAL, provedor: "anthropic", modelo: "x", urlBase: "", chave: "v1:a:b:c", precoEntrada: 0, precoSaida: 0 } });
  assert.equal((await por()).LEADS!.cor, "VERDE");
});

test("IA simulada em produção conta como sem chave", async () => {
  assert.equal((await por(false)).LEADS!.cor, "VERDE");
  assert.equal((await por(true)).LEADS!.cor, "AMARELO");
});

test("falhas recentes: 3 ou mais nos últimos 15 min E a última também falhou; falha isolada não acende", async () => {
  await falha("conversar", false, min(10)); await falha("conversar", false, min(5));
  assert.equal((await por()).LEADS!.cor, "VERDE", "2 falhas ainda não");
  await falha("conversar", false, min(1));
  let s = await por();
  assert.equal(s.LEADS!.cor, "AMARELO"); assert.equal(s.LEADS!.motivo, "FALHAS"); assert.match(s.LEADS!.texto, /3 falhas da IA nos últimos 15 min/);
  assert.equal(s.CAMPANHAS!.cor, "VERDE", "falhas de conversar não afetam Campanhas");
  // a IA volta a responder: a última chamada deu certo → verde
  await prisma.usoIA.create({ data: { tarefa: "conversar", provedor: "simulado", modelo: "simulado", ok: true, criadoEm: new Date(AGORA.getTime() - 1000) } });
  s = await por();
  assert.equal(s.LEADS!.cor, "VERDE");
});

test("falhas antigas (fora dos 15 min) não contam", async () => {
  for (const m of [40, 30, 25, 20]) await falha("gerar_mensagens", false, min(m));
  assert.equal((await por()).CAMPANHAS!.cor, "VERDE");
});
