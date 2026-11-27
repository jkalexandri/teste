// Testes unitários do endereço de internet e do contador de limites (decisão #163 — S8 do Módulo 1).
// Rodar: cd apps/web && ../worker/node_modules/.bin/tsx --test tests/ip-unit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDeLimite, ipReal, limparEndereco } from "../lib/ip";
import { MAX_CHAVES, _limites, dentroDoLimite } from "../lib/limite-memoria";

test("ipReal: vale a ÚLTIMA entrada do X-Forwarded-For (a do nosso proxy), não a primeira", () => {
  assert.equal(ipReal("203.0.113.5", null), "203.0.113.5");
  assert.equal(ipReal("9.9.9.9, 203.0.113.5", null), "203.0.113.5");
  assert.equal(ipReal("1.1.1.1,2.2.2.2 , 203.0.113.5 ", null), "203.0.113.5");
  assert.equal(ipReal(" , ,", "198.51.100.1"), "198.51.100.1");
});

test("ipReal: sem cabeçalho usa o X-Real-IP; sem nada devolve null", () => {
  assert.equal(ipReal(null, "198.51.100.1"), "198.51.100.1");
  assert.equal(ipReal("", ""), null);
  assert.equal(ipReal(undefined, undefined), null);
});

test("limparEndereco: porta, colchetes, maiúsculas e IPv4 em formato IPv6", () => {
  assert.equal(limparEndereco("203.0.113.5:8080"), "203.0.113.5");
  assert.equal(limparEndereco("[2001:DB8::1]:443"), "2001:db8::1");
  assert.equal(limparEndereco("::FFFF:203.0.113.5"), "203.0.113.5");
  assert.equal(limparEndereco("  203.0.113.5 "), "203.0.113.5");
});

test("chaveDeLimite: IPv4 igual; IPv6 pelo bloco /64 (formas diferentes do mesmo bloco dão a mesma chave)", () => {
  assert.equal(chaveDeLimite("203.0.113.5"), "203.0.113.5");
  const a = chaveDeLimite("2001:db8:abcd:12::1");
  assert.equal(a, "2001:db8:abcd:12::/64");
  assert.equal(chaveDeLimite("2001:0db8:abcd:0012:ffff:eeee:dddd:cccc"), a);
  assert.equal(chaveDeLimite("2001:db8:abcd:12:1:2:3:4"), a);
  assert.notEqual(chaveDeLimite("2001:db8:abcd:13::1"), a, "outro bloco /64 é outra chave");
  assert.equal(chaveDeLimite("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(chaveDeLimite("::1"), "0:0:0:0::/64");
  assert.equal(chaveDeLimite("lixo-qualquer"), "lixo-qualquer");
});

test("dentroDoLimite: respeita o máximo na janela", () => {
  _limites.limpar();
  assert.equal(dentroDoLimite("a", 3, 60_000), true);
  assert.equal(dentroDoLimite("a", 3, 60_000), true);
  assert.equal(dentroDoLimite("a", 3, 60_000), true);
  assert.equal(dentroDoLimite("a", 3, 60_000), false);
  assert.equal(dentroDoLimite("b", 3, 60_000), true, "outra chave não é afetada");
});

test("dentroDoLimite: o tamanho do mapa fica no teto e saem as chaves mais antigas", () => {
  _limites.limpar();
  for (let i = 0; i < MAX_CHAVES + 500; i++) dentroDoLimite(`k${i}`, 5, 60_000);
  assert.equal(_limites.tamanho(), MAX_CHAVES);
  // A chave mais antiga saiu (recomeça do zero); a mais nova continua contada
  for (let i = 0; i < 5; i++) assert.equal(dentroDoLimite("k0", 5, 60_000), true);
  assert.equal(dentroDoLimite(`k${MAX_CHAVES + 499}`, 1, 60_000), false, "a chave nova guardou o 1º uso e já passou de 1");
  _limites.limpar();
});
