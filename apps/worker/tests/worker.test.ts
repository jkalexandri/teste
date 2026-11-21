// Testes do serviço 24/7 que não dependem dos servidores do WhatsApp.
// Rodar: DATABASE_URL=... pnpm --filter worker test
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pino from "pino";
import { initAuthCreds } from "@whiskeysockets/baileys";
import { prisma } from "@filapro/db";
import { criptografar, descriptografar } from "../src/cripto.js";
import { normalizarNumero, numeroDoJid, paraJid } from "../src/numero.js";
import { apagarAuth, usarAuthNoBanco } from "../src/auth-banco.js";
import { criarApi, type Sessoes } from "../src/api.js";
import { decidirQueda } from "../src/queda.js";

const chave = randomBytes(32);

test("criptografia: ida e volta, e falha com chave errada ou texto adulterado", () => {
  const s = criptografar("segredo ç", chave);
  assert.match(s, /^v1:/);
  assert.equal(descriptografar(s, chave), "segredo ç");
  assert.notEqual(criptografar("x", chave), criptografar("x", chave)); // IV aleatório
  assert.throws(() => descriptografar(s, randomBytes(32)));
  const partes = s.split(":");
  partes[3] = Buffer.from("outro").toString("base64");
  assert.throws(() => descriptografar(partes.join(":"), chave));
});

test("número: normaliza telefone brasileiro", () => {
  assert.equal(normalizarNumero("(11) 90000-0000"), "5511900000000");
  assert.equal(normalizarNumero("+55 11 3333-4444"), "551133334444");
  assert.equal(normalizarNumero("123"), "");
  assert.equal(paraJid("11900000000"), "5511900000000@s.whatsapp.net");
  assert.equal(numeroDoJid("5511900000000:12@s.whatsapp.net"), "5511900000000");
});

test("login do WhatsApp salvo no banco, criptografado, e apagado ao desconectar", async () => {
  const id = "teste-worker-" + Date.now();
  try {
    const a = await usarAuthNoBanco(id, chave);
    assert.equal(a.state.creds.registered, false);
    await a.salvarCreds();
    await a.state.keys.set({ "pre-key": { "1": { public: Buffer.from([1, 2]), private: Buffer.from([3, 4]) } } });

    // Nada em texto puro no banco
    const linha = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id } });
    assert.match(linha.creds!, /^v1:/);
    assert.ok(!linha.creds!.includes("noiseKey"));
    const ch = await prisma.whatsappChave.findFirstOrThrow({ where: { sessaoId: id } });
    assert.match(ch.valor, /^v1:/);

    // Reabrir recupera exatamente o mesmo login (como após reiniciar a VPS)
    const b = await usarAuthNoBanco(id, chave);
    assert.deepEqual(b.state.creds.noiseKey.public, a.state.creds.noiseKey.public);
    const k = await b.state.keys.get("pre-key", ["1", "2"]);
    assert.deepEqual(Buffer.from(k["1"]!.private), Buffer.from([3, 4]));
    assert.equal(k["2"], undefined);

    // Apagar uma chave
    await b.state.keys.set({ "pre-key": { "1": null } });
    assert.equal(await prisma.whatsappChave.count({ where: { sessaoId: id } }), 0);

    await b.state.keys.set({ "pre-key": { "3": { public: Buffer.from([5]), private: Buffer.from([6]) } } });
    await apagarAuth(id);
    assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id } })).creds, null);
    assert.equal(await prisma.whatsappChave.count({ where: { sessaoId: id } }), 0);
    assert.ok(initAuthCreds()); // sanidade
  } finally {
    await prisma.whatsappSessao.deleteMany({ where: { id } });
  }
});

test("API: exige token, valida dados e chama o gerenciador", async () => {
  const chamadas: string[] = [];
  const falso: Sessoes = {
    conectar: async (id, u) => void chamadas.push(`conectar:${id}:${u ?? ""}`),
    desconectar: async (id) => void chamadas.push(`desconectar:${id}`),
    enviarTexto: async (id, para) => (para === "11900000000" ? { ok: true, mensagem: "Mensagem enviada." } : { ok: false, mensagem: "WhatsApp não conectado." }),
  };
  const app = criarApi(falso, "tok-123", pino({ level: "silent" }));
  const auth = { authorization: "Bearer tok-123" };

  assert.equal((await app.inject({ method: "GET", url: "/saude" })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/sessoes/abc/conectar" })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/sessoes/abc/conectar", headers: { authorization: "Bearer errado" } })).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/sessoes/a%20b/conectar", headers: auth })).statusCode, 400);

  const r = await app.inject({ method: "POST", url: "/sessoes/abc/conectar", headers: auth, payload: { usuarioId: "u1" } });
  assert.equal(r.statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/sessoes/abc/desconectar", headers: auth })).statusCode, 200);
  assert.deepEqual(chamadas, ["conectar:abc:u1", "desconectar:abc"]);

  assert.equal((await app.inject({ method: "POST", url: "/sessoes/plataforma/enviar", headers: auth, payload: { para: "", texto: "oi" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/sessoes/plataforma/enviar", headers: auth, payload: { para: "11900000000", texto: "oi" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/sessoes/plataforma/enviar", headers: auth, payload: { para: "1100", texto: "oi" } })).statusCode, 409);
  await app.close();
});

test("API: guarda, devolve e apaga anexos (decisão #67)", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const pasta = await mkdtemp(join(tmpdir(), "anexos-"));
  const falso: Sessoes = { conectar: async () => {}, desconectar: async () => {}, enviarTexto: async () => ({ ok: true, mensagem: "" }) };
  const app = criarApi(falso, "tok", pino({ level: "silent" }), pasta);
  const auth = { authorization: "Bearer tok" };
  const dados = Buffer.from([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
  assert.equal((await app.inject({ method: "PUT", url: "/arquivos/abc", payload: dados, headers: { "content-type": "application/octet-stream" } })).statusCode, 401);
  assert.equal((await app.inject({ method: "PUT", url: "/arquivos/abc", payload: dados, headers: { ...auth, "content-type": "application/octet-stream" } })).statusCode, 200);
  const g = await app.inject({ method: "GET", url: "/arquivos/abc", headers: auth });
  assert.equal(g.statusCode, 200);
  assert.deepEqual(g.rawPayload, dados);
  assert.equal((await app.inject({ method: "GET", url: "/arquivos/..%2Fetc", headers: auth })).statusCode, 400);
  assert.equal((await app.inject({ method: "DELETE", url: "/arquivos/abc", headers: auth })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/arquivos/abc", headers: auth })).statusCode, 404);
  await app.close();
});

test("queda: depois de ler o QR, o pedido de reinício (515) reconecta e NÃO apaga o login", () => {
  // Antes da correção, o login recém-criado era apagado aqui e o celular mostrava "não foi possível conectar".
  assert.deepEqual(decidirQueda(515, false, true, 0), { acao: "reconectar", esperaMs: 0 });
  assert.deepEqual(decidirQueda(515, true, false, 3), { acao: "reconectar", esperaMs: 0 });
});

test("queda: demais casos", () => {
  const q401 = decidirQueda(401, true, false, 0);
  assert.equal(q401.acao, "encerrar");
  assert.ok(q401.acao === "encerrar" && q401.apagarLogin && q401.erro.includes("desconectado pelo celular"));
  const qrExpirou = decidirQueda(408, false, true, 0);
  assert.ok(qrExpirou.acao === "encerrar" && qrExpirou.erro.includes("QR Code expirou"));
  const semRede = decidirQueda(408, false, false, 0);
  assert.ok(semRede.acao === "encerrar" && semRede.erro.includes("Não foi possível falar"));
  // Já conectado antes e caiu a internet: reconecta com espera crescente (máx. 5 min)
  assert.deepEqual(decidirQueda(428, true, false, 0), { acao: "reconectar", esperaMs: 2000 });
  assert.deepEqual(decidirQueda(408, true, false, 3), { acao: "reconectar", esperaMs: 16000 });
  assert.deepEqual(decidirQueda(503, true, false, 20), { acao: "reconectar", esperaMs: 300000 });
});

test.after(() => prisma.$disconnect());
