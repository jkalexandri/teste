// Testes vigia do aviso de número caído (decisão #142 — falha A6 da auditoria do Módulo 4).
// Relógio falso: nada espera de verdade. Os avisos são recolhidos numa lista em vez de ir ao WhatsApp.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma } from "@filapro/db";
import { AvisoQueda, nomeDoNumero, tempoFora } from "../src/aviso-queda.js";

const ID = "tst-aq-1";
const PLAT = "plataforma";
const MIN = 60_000;
let agora = new Date("2026-11-26T15:00:00Z");
let avisos: { dono: string; texto: string }[] = [];
let donoId = "";
let alertasSuper: string[] = [];
const aq = new AvisoQueda(pino({ level: "silent" }), async (dono, texto) => { avisos.push({ dono, texto }); }, { agora: () => agora, enviarSuper: async (t) => { alertasSuper.push(t); } });
const sessao = () => prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });

beforeEach(async () => {
  avisos = []; alertasSuper = [];
  agora = new Date("2026-11-26T15:00:00Z");
  donoId = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.deleteMany({ where: { id: ID } });
});
after(async () => { await prisma.whatsappSessao.deleteMany({ where: { id: ID } }); await prisma.$disconnect(); });

/** Cria o número "Reconectando" caído há `min` minutos. */
async function cair(min: number, extra: Record<string, unknown> = {}) {
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: donoId, apelido: "Vendas", status: "RECONECTANDO", quedaEm: new Date(agora.getTime() - min * MIN), ...extra } });
}

test("queda de menos de 3 min não avisa", async () => {
  await cair(2);
  await aq.verificar();
  assert.equal(avisos.length, 0);
});

test("3 min fora: avisa a queda UMA vez só (verificações repetidas não repetem)", async () => {
  await cair(3);
  await aq.verificar(); await aq.verificar();
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.dono, donoId);
  assert.match(avisos[0]!.texto, /^⚠️ FilaPro Leads: seu WhatsApp "Vendas" caiu às \d\d:\d\d e ainda não voltou\. O sistema continua tentando sozinho; campanhas e respostas da IA esperam\.$/);
  assert.ok((await sessao()).avisoQuedaEm, "marca gravada no banco (não repete após reiniciar)");
  // "Reinício do serviço": outro vigia, mesmo banco — não repete
  await new AvisoQueda(pino({ level: "silent" }), async (d, t) => { avisos.push({ dono: d, texto: t }); }, { agora: () => agora }).verificar();
  assert.equal(avisos.length, 1);
});

test("2 h fora: aviso de problema uma vez; depois não repete", async () => {
  await cair(3);
  await aq.verificar(); // aviso de 3 min
  agora = new Date(agora.getTime() + 117 * MIN); // agora 2 h fora
  await aq.verificar(); await aq.verificar();
  assert.equal(avisos.length, 2);
  assert.match(avisos[1]!.texto, /^🔴 FilaPro Leads: seu WhatsApp "Vendas" está fora há 2 horas\. Abra FilaPro Leads → WhatsApp e toque em Tentar agora\./);
  assert.ok((await sessao()).avisoProblemaEm);
});

test("serviço que só percebe depois de 2 h: manda o aviso de problema (não o de 3 min)", async () => {
  await cair(130);
  await aq.verificar();
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!.texto, /^🔴/);
});

test("voltou: só avisa se já tinha avisado da queda; mostra quanto tempo ficou fora", async () => {
  await cair(12, { avisoQuedaEm: new Date(agora.getTime() - 9 * MIN) });
  await aq.voltou(await sessao());
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!.texto, /^✅ FilaPro Leads: seu WhatsApp "Vendas" voltou às \d\d:\d\d \(ficou 12 min fora\)\.$/);
  // Queda curta (nunca avisou): volta em silêncio
  avisos = [];
  await aq.voltou({ ...(await sessao()), avisoQuedaEm: null });
  assert.equal(avisos.length, 0);
});

test("desconectou de vez: avisa na hora com o motivo; número sem dono não avisa ninguém", async () => {
  await aq.desconectou({ id: ID, usuarioId: donoId, apelido: "", numero: "5511987654321" }, "O WhatsApp foi desconectado pelo celular. Conecte de novo lendo o QR Code.");
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!.texto, /^⛔ FilaPro Leads: seu WhatsApp "\+55 \(11\) 98765-4321" foi desconectado às \d\d:\d\d\. O WhatsApp foi desconectado pelo celular\./);
  await aq.desconectou({ id: ID, usuarioId: null, apelido: "", numero: null }, "x"); // sem dono: ninguém para avisar
  assert.equal(avisos.length, 1);
});

test("número bloqueado (saiu do plano) nunca gera aviso de queda", async () => {
  await cair(10, { bloqueada: true });
  await aq.verificar();
  assert.equal(avisos.length, 0); assert.equal(alertasSuper.length, 0);
});

test("número da plataforma (A7): alerta ao Super Admin com 3 min, 2 h, na volta e ao desconectar — nunca ao dono/WhatsApp de usuário", async () => {
  await prisma.whatsappSessao.deleteMany({ where: { id: PLAT } });
  await prisma.whatsappSessao.create({ data: { id: PLAT, status: "RECONECTANDO", quedaEm: new Date(agora.getTime() - 4 * MIN) } });
  await aq.verificar(); await aq.verificar();
  assert.equal(alertasSuper.length, 1, "uma vez só");
  assert.match(alertasSuper[0]!, /^⚠️ FilaPro Leads: o número da plataforma caiu às \d\d:\d\d e ainda não voltou\. .*fila/);
  agora = new Date(agora.getTime() + 117 * MIN); await aq.verificar();
  assert.equal(alertasSuper.length, 2);
  assert.match(alertasSuper[1]!, /^🔴 FilaPro Leads: o número da plataforma está fora há 2 horas\./);
  const p = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: PLAT } });
  await aq.voltou(p);
  assert.match(alertasSuper[2]!, /^✅ FilaPro Leads: o número da plataforma voltou às \d\d:\d\d \(ficou 2 h \d+ min fora\)\./);
  await aq.desconectou({ id: PLAT, usuarioId: null, apelido: "", numero: null }, "O WhatsApp foi desconectado pelo celular.");
  assert.match(alertasSuper[3]!, /^⛔ FilaPro Leads: o número da plataforma foi desconectado/);
  assert.equal(avisos.length, 0, "nada vai para dono de usuário");
  await prisma.whatsappSessao.deleteMany({ where: { id: PLAT } });
});

test("textos auxiliares", () => {
  assert.equal(tempoFora(12 * MIN), "12 min");
  assert.equal(tempoFora(125 * MIN), "2 h 5 min");
  assert.equal(tempoFora(120 * MIN), "2 h");
  assert.equal(nomeDoNumero({ id: "u", usuarioId: "u", apelido: "", numero: null }), "principal");
  assert.equal(nomeDoNumero({ id: "x", usuarioId: "u", apelido: "", numero: null }), "extra");
});

test("M4: a queda longa também vai para os Logs aos 3 min e às 2 h, uma vez cada (decisão #153)", async () => {
  const inicio = new Date();
  await cair(3);
  await aq.verificar(); await aq.verificar();
  /** Os Logs são gravados em segundo plano: espera até aparecer (no máximo 2 s) */
  const logs = async (trecho: string) => { for (let i = 0; i < 100; i++) { const r = await prisma.log.findMany({ where: { tipo: "WHATSAPP", usuarioId: donoId, criadoEm: { gte: inicio }, texto: { contains: trecho } } }); if (r.length) { await new Promise((x) => setTimeout(x, 100)); return prisma.log.findMany({ where: { tipo: "WHATSAPP", usuarioId: donoId, criadoEm: { gte: inicio }, texto: { contains: trecho } } }); } await new Promise((x) => setTimeout(x, 20)); } return []; };
  const l3 = await logs("ainda não voltou (3 min sem conexão)");
  assert.equal(l3.length, 1);
  assert.match(l3[0]!.texto, /^WhatsApp caiu às \d\d:\d\d e ainda não voltou \(3 min sem conexão\)$/);
  agora = new Date(agora.getTime() + 117 * MIN); await aq.verificar(); await aq.verificar();
  const l2 = await logs("está com problema");
  assert.equal(l2.length, 1);
  assert.match(l2[0]!.texto, /^WhatsApp está com problema: fora desde \d\d:\d\d \(2 h sem conexão\)$/);
  await prisma.log.deleteMany({ where: { usuarioId: donoId, criadoEm: { gte: inicio } } });
});
