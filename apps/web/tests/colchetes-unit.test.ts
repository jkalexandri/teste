// Textos entre colchetes pendentes (decisão #181). Rodar: cd apps/web && ../worker/node_modules/.bin/tsx --test tests/colchetes-unit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { colchetesPendentes } from "../lib/colchetes";

const MODELO = 'Abertura: [Nome da empresa]\nPerguntas:\n1. [O que você vende?]\nTrate por [você].';

test("com modelo: só avisa o que veio do modelo e continua no texto", () => {
  assert.deepEqual(colchetesPendentes(MODELO, MODELO), ["[Nome da empresa]", "[O que você vende?]", "[você]"]);
  assert.deepEqual(colchetesPendentes("Abertura: Acme\n1. [O que você vende?]\nTrate por você.", MODELO), ["[O que você vende?]"]);
});

test("com modelo: colchetes que a pessoa escreveu NÃO disparam o aviso (antes disparavam)", () => {
  assert.deepEqual(colchetesPendentes("Preço: R$ 29 [promoção] e link [site](https://x.com)", MODELO), []);
  assert.deepEqual(colchetesPendentes("Tudo trocado, sem nada do modelo.", MODELO), []);
});

test("sem modelo: qualquer trecho entre colchetes conta; texto sem colchetes não", () => {
  assert.deepEqual(colchetesPendentes("Olá [nome], tudo bem?"), ["[nome]"]);
  assert.deepEqual(colchetesPendentes("Sem nada entre colchetes"), []);
  assert.deepEqual(colchetesPendentes("colchetes vazios [] não contam, mas [ ] com um espaço dentro conta"), ["[ ]"]);
});

test("não repete o mesmo trecho e ignora colchetes que quebram linha", () => {
  assert.deepEqual(colchetesPendentes("[a] [a] [b]"), ["[a]", "[b]"]);
  assert.deepEqual(colchetesPendentes("[começa\ne termina]"), []);
});
