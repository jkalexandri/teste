// Porteiro das aberturas automáticas (decisão #154 — M5): concorrência, intervalo, prioridade e erro sem travar a fila.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Porteiro } from "../src/porteiro.js";
import { esperaDaTentativa } from "../src/queda.js";

const ouvir = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("no máximo `concorrencia` aberturas ao mesmo tempo", async () => {
  const p = new Porteiro({ concorrencia: 2, intervaloMs: 0 });
  let ativos = 0, pico = 0;
  const tarefa = async () => { ativos++; pico = Math.max(pico, ativos); await ouvir(60); ativos--; };
  await Promise.all(Array.from({ length: 7 }, () => p.executar(2, tarefa)));
  assert.equal(pico, 2);
  p.parar();
});

test("intervalo mínimo entre o INÍCIO de uma abertura e a próxima", async () => {
  const p = new Porteiro({ concorrencia: 5, intervaloMs: 120 });
  const inicios: number[] = [];
  await Promise.all(Array.from({ length: 4 }, () => p.executar(2, async () => { inicios.push(Date.now()); })));
  for (let i = 1; i < inicios.length; i++) assert.ok(inicios[i]! - inicios[i - 1]! >= 110, `intervalo ${i}: ${inicios[i]! - inicios[i - 1]!} ms`);
  p.parar();
});

test("menor prioridade primeiro; empate, ordem de chegada — inclusive para o primeiro pedido do mesmo instante", async () => {
  const p = new Porteiro({ concorrencia: 1, intervaloMs: 0 });
  const ordem: string[] = [];
  // Todos pedem no mesmo instante, o "normal-1" primeiro: a plataforma ainda assim sai antes dele
  const a = p.executar(2, async () => { ordem.push("normal-1"); });
  const b = p.executar(3, async () => { ordem.push("sair"); });
  const c = p.executar(0, async () => { ordem.push("plataforma"); });
  const d = p.executar(2, async () => { ordem.push("normal-2"); });
  const e = p.executar(1, async () => { ordem.push("campanha"); });
  assert.equal(p.esperando(), 5);
  await Promise.all([a, b, c, d, e]);
  assert.deepEqual(ordem, ["plataforma", "campanha", "normal-1", "normal-2", "sair"]);
  // Quem chega depois, com a fila já andando, também respeita a prioridade
  const ordem2: string[] = [];
  let solta!: () => void;
  const trava = new Promise<void>((r) => { solta = r; });
  const x = p.executar(-1, async () => { await trava; ordem2.push("trava"); });
  await ouvir(10);
  const y = p.executar(2, async () => { ordem2.push("normal"); });
  const z = p.executar(0, async () => { ordem2.push("urgente"); });
  solta();
  await Promise.all([x, y, z]);
  assert.deepEqual(ordem2, ["trava", "urgente", "normal"]);
  p.parar();
});

test("erro numa abertura não trava a fila e chega a quem pediu", async () => {
  const p = new Porteiro({ concorrencia: 1, intervaloMs: 0 });
  const ruim = p.executar(2, async () => { throw new Error("falhou"); });
  const boa = p.executar(2, async () => "ok");
  await assert.rejects(ruim, /falhou/);
  assert.equal(await boa, "ok");
  p.parar();
});

test("variação do intervalo de reconexão: ±25%, teto de 5 min e sem rajada", () => {
  assert.equal(esperaDaTentativa(0, () => 0), 1500);
  assert.equal(esperaDaTentativa(0, () => 0.5), 2000);
  assert.equal(esperaDaTentativa(0, () => 1), 2500);
  assert.equal(esperaDaTentativa(2, () => 0), 6000);
  assert.equal(esperaDaTentativa(2, () => 1), 10000);
  for (const t of [0, 1, 3, 6, 12, 30]) for (const r of [0, 0.3, 0.9999]) {
    const base = Math.min(240_000, 2000 * 2 ** t);
    const v = esperaDaTentativa(t, () => r);
    assert.ok(v >= base * 0.75 - 1 && v <= base * 1.25 + 1 && v <= 300_000, `t=${t} r=${r} → ${v}`);
  }
  // 100 números com o mesmo número de tentativas NÃO tentam todos no mesmo instante
  const esperas = new Set(Array.from({ length: 100 }, () => esperaDaTentativa(5)));
  assert.ok(esperas.size > 50, `só ${esperas.size} valores diferentes`);
});
