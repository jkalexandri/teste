// Textos dos Logs de WhatsApp (decisão #153 — M4): motivo da queda, duração e linha da volta. Sem banco.
import { test } from "node:test";
import assert from "node:assert/strict";
import { duracaoCurta, textoVolta } from "../src/log-sessao.js";
import { descreverQueda } from "../src/queda.js";

test("motivo da queda: texto em português com o código entre parênteses", () => {
  assert.equal(descreverQueda(428), "conexão perdida (código 428)");
  assert.equal(descreverQueda(408), "conexão perdida (tempo esgotado) (código 408)");
  assert.equal(descreverQueda(503), "WhatsApp indisponível (código 503)");
  assert.equal(descreverQueda(500), "sessão inválida (código 500)");
  assert.equal(descreverQueda(777), "motivo não informado (código 777)");
  assert.equal(descreverQueda(0), "motivo não informado (sem código)");
});

test("duração curta: segundos, minutos, horas", () => {
  assert.equal(duracaoCurta(8_000), "8 s");
  assert.equal(duracaoCurta(59_400), "59 s");
  assert.equal(duracaoCurta(3 * 60_000), "3 min");
  assert.equal(duracaoCurta(125 * 60_000), "2 h 5 min");
  assert.equal(duracaoCurta(120 * 60_000), "2 h");
  assert.equal(duracaoCurta(-5), "0 s");
});

test("linha da volta: tentativas só a partir de 2; falhas ao reabrir só quando houve", () => {
  const caiuEm = new Date("2026-11-26T17:29:00Z"), voltouEm = new Date("2026-11-26T17:32:00Z"); // 14:29 e 14:32 em Brasília
  assert.equal(textoVolta({ voltouEm, caiuEm, motivo: "conexão perdida (código 428)", tentativas: 1, falhasAoAbrir: 0 }),
    "WhatsApp voltou às 14:32 (caiu às 14:29: conexão perdida (código 428); ficou 3 min fora)");
  assert.equal(textoVolta({ voltouEm, caiuEm, motivo: "conexão perdida (código 428)", tentativas: 2, falhasAoAbrir: 0 }),
    "WhatsApp voltou às 14:32 (caiu às 14:29: conexão perdida (código 428); ficou 3 min fora; 2 tentativas)");
  assert.equal(textoVolta({ voltouEm, caiuEm, motivo: "WhatsApp indisponível (código 503)", tentativas: 4, falhasAoAbrir: 2 }),
    "WhatsApp voltou às 14:32 (caiu às 14:29: WhatsApp indisponível (código 503); ficou 3 min fora; 4 tentativas; 2 falhas ao reabrir)");
  assert.match(textoVolta({ voltouEm, caiuEm, motivo: "x", tentativas: 1, falhasAoAbrir: 1 }), /1 falha ao reabrir\)$/);
});
