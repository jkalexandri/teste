// Testes unitários da regra de avisos da VPS (decisão #171): quando avisar, lembrar e resolver.
// Rodar: cd apps/web && ../worker/node_modules/.bin/tsx --test tests/alerta-vps-unit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { REGRAS, decidir, limparValor, type EstadoItem } from "../lib/alerta-vps-regras";

const H = 3600_000;
const T0 = new Date("2026-11-29T12:00:00Z");
const limpo: EstadoItem = { avisouEm: null, foraDesde: null, ultimoAvisoEm: null, contagem: 0, nivel: null };
const rg = (id: string) => REGRAS[id]!;

test("problema novo avisa na hora (persistência 1) e guarda desde quando", () => {
  const d = decidir({ nivel: "aviso" }, rg("disco"), limpo, T0);
  assert.equal(d.acao, "avisar");
  assert.equal(d.novo.avisouEm?.getTime(), T0.getTime());
  assert.equal(d.novo.foraDesde?.getTime(), T0.getTime());
  assert.equal(d.novo.nivel, "aviso");
});

test("memória só avisa na 2ª leitura seguida (persistência 2); uma leitura boa no meio zera", () => {
  const d1 = decidir({ nivel: "aviso" }, rg("memoria"), limpo, T0);
  assert.equal(d1.acao, "nada"); assert.equal(d1.novo.contagem, 1);
  const d2 = decidir({ nivel: "aviso" }, rg("memoria"), d1.novo, new Date(T0.getTime() + 15 * 60_000));
  assert.equal(d2.acao, "avisar");
  const bom = decidir({ nivel: "ok" }, rg("memoria"), d1.novo, T0);
  assert.equal(bom.acao, "nada"); assert.equal(bom.novo.contagem, 0);
  assert.equal(decidir({ nivel: "aviso" }, rg("memoria"), bom.novo, T0).acao, "nada");
});

test("já avisado: não repete antes de 24 h; lembra depois de 24 h", () => {
  const e = decidir({ nivel: "aviso" }, rg("disco"), limpo, T0).novo;
  assert.equal(decidir({ nivel: "aviso" }, rg("disco"), e, new Date(T0.getTime() + 23 * H)).acao, "nada");
  const l = decidir({ nivel: "aviso" }, rg("disco"), e, new Date(T0.getTime() + 24 * H));
  assert.equal(l.acao, "lembrar");
  assert.equal(l.novo.ultimoAvisoEm?.getTime(), T0.getTime() + 24 * H);
  assert.equal(l.novo.foraDesde?.getTime(), T0.getTime(), "o 'desde quando' não muda no lembrete");
});

test("crítico: lembrete a cada 6 h; piorar de aviso para crítico avisa na hora", () => {
  const e = decidir({ nivel: "aviso" }, rg("disco"), limpo, T0).novo;
  const piorou = decidir({ nivel: "critico" }, rg("disco"), e, new Date(T0.getTime() + 15 * 60_000));
  assert.equal(piorou.acao, "avisar"); assert.equal(piorou.novo.nivel, "critico");
  assert.equal(decidir({ nivel: "critico" }, rg("disco"), piorou.novo, new Date(T0.getTime() + 5 * H)).acao, "nada");
  assert.equal(decidir({ nivel: "critico" }, rg("disco"), piorou.novo, new Date(T0.getTime() + 15 * 60_000 + 6 * H)).acao, "lembrar");
});

test("reinício pendente: lembrete só a cada 7 dias", () => {
  const e = decidir({ nivel: "aviso" }, rg("reinicio"), limpo, T0).novo;
  assert.equal(decidir({ nivel: "aviso" }, rg("reinicio"), e, new Date(T0.getTime() + 6 * 24 * H)).acao, "nada");
  assert.equal(decidir({ nivel: "aviso" }, rg("reinicio"), e, new Date(T0.getTime() + 7 * 24 * H)).acao, "lembrar");
});

test("voltou ao normal depois de avisar: resolve (um aviso) e zera; ok sem aviso anterior não faz nada", () => {
  const e = decidir({ nivel: "aviso" }, rg("backup"), limpo, T0).novo;
  const r = decidir({ nivel: "ok" }, rg("backup"), e, new Date(T0.getTime() + H));
  assert.equal(r.acao, "resolver"); assert.equal(r.novo.avisouEm, null); assert.equal(r.novo.contagem, 0);
  assert.equal(decidir({ nivel: "ok" }, rg("backup"), r.novo, T0).acao, "nada");
  assert.equal(decidir({ nivel: "ok" }, rg("backup"), limpo, T0).acao, "nada");
});

test("limparValor: tira aspas, quebras de linha e símbolos; limita o tamanho; só texto", () => {
  const s = limparValor('83% <b>"cheio"</b>\n; rm -rf');
  assert.ok(!/[<>"';\n$`&]/.test(s), s);
  assert.equal(s, "83% bcheio/b rm -rf");
  assert.equal(limparValor("x".repeat(200)).length, 60);
  assert.equal(limparValor(123), ""); assert.equal(limparValor(undefined), "");
  assert.equal(limparValor("último há 31 h"), "último há 31 h");
});

test("todas as regras têm título, instrução e persistência válida", () => {
  for (const [id, r] of Object.entries(REGRAS)) {
    assert.ok(r.titulo.length > 5 && r.oQueFazer.length > 20 && r.persistencia >= 1, id);
  }
  assert.deepEqual(Object.keys(REGRAS).sort(), ["backup", "backup6h", "certificado", "disco", "memoria", "reinicio", "relogio", "restauracao"]);
});
