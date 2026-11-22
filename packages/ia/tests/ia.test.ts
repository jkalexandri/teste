// Testes da camada de IA (etapa 9a) sem gastar crédito: servidores falsos no lugar da Anthropic
// e do provedor "padrão compatível". Rodar: DATABASE_URL=... CHAVE_CRIPTO=x npx tsx --test tests/*.test.ts
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { prisma } from "@filapro/db";
import { chamarIA, criptografar, custoUsd, gerarMensagens, lerJsonMensagens, testarConfig } from "../src/index";
import { conectorAnthropic } from "../src/conectores/anthropic";
import { conectorCompativel } from "../src/conectores/compativel";

process.env.CHAVE_CRIPTO ??= "teste-ia";

function servidor(responder: (url: string, corpo: any, headers: http.IncomingHttpHeaders) => { status?: number; json: unknown }) {
  const pedidos: { url: string; corpo: any; headers: http.IncomingHttpHeaders }[] = [];
  const s = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const corpo = b ? JSON.parse(b) : null;
      pedidos.push({ url: req.url ?? "", corpo, headers: req.headers });
      const r = responder(req.url ?? "", corpo, req.headers);
      res.writeHead(r.status ?? 200, { "content-type": "application/json" });
      res.end(JSON.stringify(r.json));
    });
  });
  return new Promise<{ url: string; pedidos: typeof pedidos; fechar: () => void }>((ok) =>
    s.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${(s.address() as { port: number }).port}`, pedidos, fechar: () => s.close() })),
  );
}

test("custo: entrada, saída e cache (10% leitura, 125% gravação)", () => {
  // Haiku 5.5: US$ 0,10 / 0,50 por milhão
  assert.equal(custoUsd({ entrada: 1_000_000, saida: 0, cacheLeitura: 0, cacheEscrita: 0 }, { entrada: 0.1, saida: 0.5 }), 0.1);
  assert.equal(custoUsd({ entrada: 0, saida: 2_000_000, cacheLeitura: 0, cacheEscrita: 0 }, { entrada: 0.1, saida: 0.5 }), 1);
  assert.ok(Math.abs(custoUsd({ entrada: 0, saida: 0, cacheLeitura: 1_000_000, cacheEscrita: 1_000_000 }, { entrada: 4, saida: 20 }) - (0.4 + 5)) < 1e-9);
});

test("lê o JSON das mensagens, mesmo com texto em volta", () => {
  const m = lerJsonMensagens('Aqui está:\n{"principal":"Oi {nome}","variacoes":["A","B","C","D"]}\nFim');
  assert.deepEqual(m, { principal: "Oi {nome}", variacoes: ["A", "B", "C"] });
  assert.equal(lerJsonMensagens("sem json"), null);
  assert.equal(lerJsonMensagens('{"principal":""}'), null);
});

test("conector Claude: biblioteca oficial, cache no bloco fixo, esforço baixo e uso de tokens", async () => {
  const s = await servidor(() => ({
    json: {
      id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: "Conexão OK" }],
      usage: { input_tokens: 120, output_tokens: 8, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    },
  }));
  try {
    const r = await conectorAnthropic.chamar(
      { provedor: "anthropic", modelo: "claude-haiku-5-5", urlBase: s.url, chave: "sk-teste" },
      { sistema: "Instruções", contexto: "Ficha", mensagens: [{ papel: "usuario", texto: "Oi" }], maxTokens: 300 },
    );
    assert.equal(r.texto, "Conexão OK");
    assert.deepEqual(r.uso, { entrada: 120, saida: 8, cacheLeitura: 900, cacheEscrita: 0 });
    const p = s.pedidos[0]!;
    assert.equal(p.url, "/v1/messages");
    // A biblioteca 1.x envia a chave em "authorization: Bearer" (versões antigas usavam x-api-key)
    assert.ok(p.headers.authorization === "Bearer sk-teste" || p.headers["x-api-key"] === "sk-teste");
    assert.equal(p.corpo.max_tokens, 300);
    assert.equal(p.corpo.output_config.effort, "low");
    assert.deepEqual(p.corpo.system.at(-1).cache_control, { type: "ephemeral" });
    assert.equal(p.corpo.fallbacks, undefined); // Haiku não usa fallback
  } finally { s.fechar(); }
});

test("conector Claude: Opus/Sonnet 5.5 pedem o 'plano B' automático em caso de recusa", async () => {
  const s = await servidor(() => ({ json: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } } }));
  try {
    await conectorAnthropic.chamar({ provedor: "anthropic", modelo: "claude-opus-5-5", urlBase: s.url, chave: "k" }, { sistema: "x", mensagens: [{ papel: "usuario", texto: "y" }], maxTokens: 10 });
    assert.equal(s.pedidos[0]!.corpo.fallbacks, "default");
    assert.match(String(s.pedidos[0]!.headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
  } finally { s.fechar(); }
});

test("conector Claude: chave inválida vira mensagem clara", async () => {
  const s = await servidor(() => ({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } }));
  try {
    await assert.rejects(conectorAnthropic.chamar({ provedor: "anthropic", modelo: "claude-haiku-5-5", urlBase: s.url, chave: "errada" }, { sistema: "x", mensagens: [{ papel: "usuario", texto: "y" }], maxTokens: 10 }), /Chave da Anthropic inválida/);
  } finally { s.fechar(); }
});

test("conector padrão compatível: /chat/completions com Bearer", async () => {
  const s = await servidor(() => ({ json: { model: "gemini-x", choices: [{ message: { content: "Olá!" } }], usage: { prompt_tokens: 50, completion_tokens: 5 } } }));
  try {
    const r = await conectorCompativel.chamar({ provedor: "compativel", modelo: "gemini-x", urlBase: s.url + "/v1/", chave: "abc" }, { sistema: "S", contexto: "C", mensagens: [{ papel: "usuario", texto: "Oi" }], maxTokens: 50 });
    assert.equal(r.texto, "Olá!");
    assert.deepEqual(r.uso, { entrada: 50, saida: 5, cacheLeitura: 0, cacheEscrita: 0 });
    assert.equal(s.pedidos[0]!.url, "/v1/chat/completions");
    assert.equal(s.pedidos[0]!.headers.authorization, "Bearer abc");
    assert.equal(s.pedidos[0]!.corpo.messages[0].content, "S\n\nC");
  } finally { s.fechar(); }
});

test("chamarIA: usa a configuração do banco, descriptografa a chave e registra uso e custo", async () => {
  const s = await servidor(() => ({ json: { model: "m", choices: [{ message: { content: '{"principal":"Oi {nome}","variacoes":["a","b","c"]}' } }], usage: { prompt_tokens: 1_000_000, completion_tokens: 0 } } }));
  try {
    await prisma.configIA.upsert({
      where: { tarefa: "gerar_mensagens" },
      update: { provedor: "compativel", modelo: "m", urlBase: s.url, chave: criptografar("segredo"), precoEntrada: 2, precoSaida: 10 },
      create: { tarefa: "gerar_mensagens", provedor: "compativel", modelo: "m", urlBase: s.url, chave: criptografar("segredo"), precoEntrada: 2, precoSaida: 10 },
    });
    const r = await gerarMensagens("Quero apresentar meu serviço", "", { empresaId: null, usuarioId: "teste-ia-u" });
    assert.equal(r.principal, "Oi {nome}");
    assert.equal(r.variacoes.length, 3);
    assert.equal(s.pedidos[0]!.headers.authorization, "Bearer segredo");
    const uso = await prisma.usoIA.findFirst({ where: { usuarioId: "teste-ia-u" }, orderBy: { criadoEm: "desc" } });
    assert.equal(uso?.custoUsd, 2);
    assert.equal(uso?.ok, true);
  } finally {
    s.fechar();
    await prisma.configIA.deleteMany({ where: { tarefa: "gerar_mensagens" } });
    await prisma.usoIA.deleteMany({ where: { usuarioId: "teste-ia-u" } });
  }
});

test("falha da IA é registrada com custo zero; teste de configuração não salva", async () => {
  await assert.rejects(chamarIA("qualificar", { sistema: "x", mensagens: [{ papel: "usuario", texto: "y" }], maxTokens: 5 }, { usuarioId: "teste-ia-f" }), /Chave da Anthropic não configurada/);
  const u = await prisma.usoIA.findFirst({ where: { usuarioId: "teste-ia-f" } });
  assert.equal(u?.ok, false);
  assert.equal(u?.custoUsd, 0);
  const t = await testarConfig("qualificar", { tarefa: "qualificar", provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 });
  assert.match(t.texto, /Resposta simulada/);
  assert.equal(await prisma.configIA.count({ where: { tarefa: "qualificar" } }), 0);
  await prisma.usoIA.deleteMany({ where: { usuarioId: "teste-ia-f" } });
  await prisma.usoIA.deleteMany({ where: { tarefa: "qualificar", provedor: "simulado" } });
});

after(() => prisma.$disconnect());

test("Conversas IA: lê o JSON da resposta e corrige valores inválidos", async () => {
  const { lerJsonConversa } = await import("../src/conversa");
  const r = lerJsonConversa('ok {"resposta":"Oi!","temperatura":"quente","status":"QUALIFICADO","naoSei":false,"motivo":"quer agendar"} fim');
  assert.deepEqual(r, { resposta: "Oi!", temperatura: "QUENTE", status: "QUALIFICADO", naoSei: false, motivo: "quer agendar" });
  const r2 = lerJsonConversa('{"resposta":"Vou confirmar","temperatura":"X","status":"VENDA","naoSei":true}');
  assert.equal(r2?.temperatura, "MORNO");
  assert.equal(r2?.status, "EM_CONVERSA");
  assert.equal(r2?.naoSei, true);
  assert.equal(lerJsonConversa('{"resposta":""}'), null);
  assert.equal(lerJsonConversa("sem json"), null);
});
