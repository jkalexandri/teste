// Acompanhamento do tamanho das chaves do WhatsApp (decisão #155 — B3): resumo semanal e aviso acima do limite, sem apagar nada.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma } from "@filapro/db";
import { VigiaChaves } from "../src/chaves-whatsapp.js";

const A = "tst-ch-a", B = "tst-ch-b";
let agora = new Date();
const mkVigia = (o: ConstructorParameters<typeof VigiaChaves>[1] = {}) => new VigiaChaves(pino({ level: "silent" }), { agora: () => agora, limiteTotalBytes: 1e15, ...o });
const logs = (trecho: string) => prisma.log.findMany({ where: { quem: "Sistema", tipo: "WHATSAPP", texto: { contains: trecho } } });
const limpar = async () => { await prisma.log.deleteMany({ where: { texto: { contains: "tst-ch-" } } }); await prisma.log.deleteMany({ where: { texto: { contains: "o total das chaves do WhatsApp" } } }); };

before(async () => {
  await prisma.whatsappSessao.deleteMany({ where: { id: { in: [A, B] } } });
  const dono = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.create({ data: { id: A, usuarioId: dono, apelido: "tst-ch-a" } });
  await prisma.whatsappSessao.create({ data: { id: B, usuarioId: dono, apelido: "tst-ch-b" } });
  const valor = "x".repeat(100);
  await prisma.whatsappChave.createMany({ data: [
    ...Array.from({ length: 30 }, (_, i) => ({ sessaoId: A, tipo: "lid-mapping", chaveId: `m${i}`, valor })),
    ...Array.from({ length: 5 }, (_, i) => ({ sessaoId: A, tipo: "pre-key", chaveId: `p${i}`, valor })),
    ...Array.from({ length: 3 }, (_, i) => ({ sessaoId: B, tipo: "session", chaveId: `s${i}`, valor })),
  ] });
  await limpar();
});
after(async () => { await limpar(); await prisma.whatsappSessao.deleteMany({ where: { id: { in: [A, B] } } }); await prisma.$disconnect(); });

test("resumo semanal por número: chaves, tamanho e o tipo que mais ocupa; sem aviso abaixo do limite; NADA é apagado", async () => {
  agora = new Date();
  const antes = await prisma.whatsappChave.count({ where: { sessaoId: { in: [A, B] } } });
  const r = await mkVigia().verificar();
  assert.ok(r.resumos >= 2);
  const [a] = await logs("tst-ch-a");
  assert.match(a!.texto, /^Chaves do WhatsApp \(.+ — tst-ch-a\): 35 chaves, 0,0 MB; maior tipo: lid-mapping \(30\)$/);
  const [b] = await logs("tst-ch-b");
  assert.match(b!.texto, /3 chaves, .*maior tipo: session \(3\)$/);
  assert.equal(a!.empresaId, null); assert.equal(a!.usuarioId, null, "só o Super Admin vê");
  assert.equal((await logs("Atenção: chaves do WhatsApp de")).filter((l) => l.texto.includes("tst-ch-")).length, 0, "abaixo do limite: sem aviso");
  assert.equal(await prisma.whatsappChave.count({ where: { sessaoId: { in: [A, B] } } }), antes, "nada foi apagado");
});

test("não repete o resumo na mesma semana; depois de 7 dias repete", async () => {
  agora = new Date();
  await mkVigia().verificar();
  assert.equal((await logs("tst-ch-a")).filter((l) => l.texto.startsWith("Chaves do WhatsApp")).length, 1, "mesma semana: sem repetir");
  agora = new Date(Date.now() + 8 * 86_400_000);
  await mkVigia().verificar();
  assert.equal((await logs("tst-ch-a")).filter((l) => l.texto.startsWith("Chaves do WhatsApp")).length, 2, "passou uma semana: novo resumo");
  await limpar();
});

test("aviso quando um número passa do limite de chaves (uma vez por semana) — só o que passou", async () => {
  agora = new Date();
  const v = mkVigia({ limiteChaves: 20 });
  await v.verificar(); await v.verificar();
  const avisos = (await logs("Atenção: chaves do WhatsApp de")).filter((l) => l.texto.includes("tst-ch-"));
  assert.equal(avisos.length, 1, "só o número A (35 chaves) passou de 20, e uma vez só");
  assert.match(avisos[0]!.texto, /tst-ch-a chegaram a 35 chaves \(0,0 MB\)\. Está crescendo mais que o esperado/);
  await limpar();
});

test("aviso quando o tamanho de um número ou o total passa do limite", async () => {
  agora = new Date();
  await mkVigia({ limiteBytes: 3000 }).verificar(); // A tem 3.500 bytes de valor
  assert.equal((await logs("Atenção: chaves do WhatsApp de")).filter((l) => l.texto.includes("tst-ch-a")).length, 1);
  await limpar();
  await mkVigia({ limiteTotalBytes: 100 }).verificar();
  assert.equal((await logs("o total das chaves do WhatsApp chegou a")).length, 1);
  await limpar();
});
