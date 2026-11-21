// Testes das regras puras de leads (telefone e leitura de planilha/texto).
// Uso: npx tsx --test apps/web/tests/leads-unit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarTelefone, normalizarTelefone } from "../lib/telefone";
import { lerCsv, lerTabela, lerTextoColado } from "../lib/planilha";

test("telefone: Brasil e internacional (decisão #55)", () => {
  assert.equal(normalizarTelefone("(11) 98765-4321"), "5511987654321");
  assert.equal(normalizarTelefone("11 3333-4444"), "551133334444");
  assert.equal(normalizarTelefone("+55 11 98765-4321"), "5511987654321");
  assert.equal(normalizarTelefone("5511987654321"), "5511987654321");
  assert.equal(normalizarTelefone("+1 305 555 1234"), "13055551234");
  assert.equal(normalizarTelefone("00351912345678"), "351912345678");
  assert.equal(normalizarTelefone("11 8765-4321"), ""); // celular sem o 9 / fixo começando com 8
  assert.equal(normalizarTelefone("01 98765-4321"), ""); // DDD inválido
  assert.equal(normalizarTelefone("123"), "");
  assert.equal(normalizarTelefone(""), "");
  assert.equal(formatarTelefone("5511987654321"), "+55 (11) 98765-4321");
  assert.equal(formatarTelefone("13055551234"), "+13055551234");
});

test("texto colado: Nome; telefone", () => {
  const r = lerTextoColado("Maria Souza; (11) 98765-4321\nJoão; 21 99876-5432\nSem número; abc\n11 97777-6666");
  assert.deepEqual(r.linhas, [
    { nome: "Maria Souza", telefone: "5511987654321" },
    { nome: "João", telefone: "5521998765432" },
    { nome: "", telefone: "5511977776666" },
  ]);
  assert.equal(r.invalidos.length, 1);
  assert.equal(r.invalidos[0]!.nome, "Sem número");
});

test("planilha com cabeçalho em qualquer posição (decisão #53)", () => {
  const r = lerTabela([
    ["E-mail", "Celular", "Cidade", "Nome do cliente", "Nome"],
    ["a@x.com", 11987654321, "SP", "ignorar", "Ana"],
    ["b@x.com", "(21) 99876-5432", "RJ", "ignorar", "Bruno"],
  ]);
  assert.equal(r.temCabecalho, true);
  assert.equal(r.colunaTelefone, 1);
  assert.equal(r.colunaNome, 4);
  assert.deepEqual(r.linhas.map((l) => l.nome), ["Ana", "Bruno"]);
});

test("planilha sem cabeçalho: descobre as colunas pelo conteúdo (decisão #61)", () => {
  const r = lerTabela([
    ["11987654321", "Carlos Lima", "x"],
    ["21998765432", "Dani Reis", "y"],
    ["", "", ""],
  ]);
  assert.equal(r.temCabecalho, false);
  assert.equal(r.colunaTelefone, 0);
  assert.equal(r.colunaNome, 1);
  assert.equal(r.linhas.length, 2);
});

test("sem cabeçalho e sem coluna de nome: nome em branco", () => {
  const r = lerTabela([["11987654321"], ["+1 305 555 1234"]]);
  assert.equal(r.colunaNome, null);
  assert.deepEqual(r.linhas, [{ nome: "", telefone: "5511987654321" }, { nome: "", telefone: "13055551234" }]);
});

test("cabeçalho com títulos desconhecidos é pulado", () => {
  const r = lerTabela([["Pessoa", "Contato zap"], ["Eva", "11987654321"]]);
  assert.equal(r.temCabecalho, true);
  assert.deepEqual(r.linhas, [{ nome: "Eva", telefone: "5511987654321" }]);
});

test("CSV: separador ; ou , e aspas", () => {
  assert.deepEqual(lerCsv('﻿Nome;Telefone\r\n"Silva; Ana";11987654321\r\n'), [["Nome", "Telefone"], ["Silva; Ana", "11987654321"]]);
  assert.deepEqual(lerCsv('nome,telefone\n"Lima, Beto","(11) 98765-4321"'), [["nome", "telefone"], ["Lima, Beto", "(11) 98765-4321"]]);
});
