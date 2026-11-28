// Fale conosco (decisão #178): o que a IA do chat da tela de Planos recebe — material comercial e script do dono só no chat do site,
// com a ordem de autoridade (dados dos planos > script > material). Servidor falso no lugar do provedor, sem gastar crédito.
// Rodar: DATABASE_URL=... CHAVE_CRIPTO=x npx tsx --test --test-concurrency=1 tests/*.test.ts  (SERIAL: este teste e o status-atendimento mexem na mesma configuração de IA "conversar")
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { prisma } from "@filapro/db";
import { criptografar } from "../src/index";
import { responderConversa } from "../src/conversa";

process.env.CHAVE_CRIPTO ??= "teste-ia";

let pedidos: { corpo: any }[] = [];
let servidor: http.Server;
let url = "";
let antes: Awaited<ReturnType<typeof prisma.configIA.findUnique>> = null;
const JSON_OK = JSON.stringify({ resposta: "Oi! Me conta o que você vende?", temperatura: "MORNO", status: "EM_CONVERSA", naoSei: false, motivo: "teste" });

before(async () => {
  antes = await prisma.configIA.findUnique({ where: { tarefa: "conversar" } });
  servidor = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      pedidos.push({ corpo: b ? JSON.parse(b) : null });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "m", choices: [{ message: { content: JSON_OK } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  const d = { provedor: "compativel", modelo: "m", urlBase: url, chave: criptografar("segredo"), precoEntrada: 0, precoSaida: 0 };
  await prisma.configIA.upsert({ where: { tarefa: "conversar" }, update: d, create: { tarefa: "conversar", ...d } });
});
after(async () => {
  servidor.close();
  if (antes) { const { tarefa, ...r } = antes; await prisma.configIA.update({ where: { tarefa }, data: r }); } else await prisma.configIA.deleteMany({ where: { tarefa: "conversar" } });
  await prisma.usoIA.deleteMany({ where: { usuarioId: "teste-visitante" } });
  await prisma.$disconnect();
});

const base = { ficha: "Empresa: FilaPro Leads\n\nPlanos à venda (valores valem EXATAMENTE como estão aqui):\n- Individual: PROMOÇÃO: de R$ 49,90 por R$ 29,90 por 31 dias", comoQualificar: "", resumo: "", nomeLead: "Visitante", recentes: [{ autor: "LEAD" as const, texto: "quanto custa?" }] };
const quem = { empresaId: null, usuarioId: "teste-visitante" };
const conteudo = () => String(pedidos.at(-1)!.corpo.messages.map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n"));

test("chat do site: o material comercial e o script do dono vão para a IA, com a regra de autoridade", async () => {
  pedidos = [];
  const r = await responderConversa({ ...base, visitanteSite: true, comercial: "MATERIAL-COMERCIAL-XYZ: primeiro entenda, depois recomende", orientacoesVisitante: "SCRIPT-DO-DONO-ABC: abra perguntando o ramo" }, quem);
  assert.equal(r.resposta, "Oi! Me conta o que você vende?");
  const c = conteudo();
  assert.match(c, /MATERIAL-COMERCIAL-XYZ/);
  assert.match(c, /SCRIPT-DO-DONO-ABC/);
  assert.match(c, /PROMOÇÃO: de R\$ 49,90 por R\$ 29,90/, "os planos com a promoção cadastrada vão na ficha");
  assert.match(c, /vale mais que o material comercial quando houver conflito, mas NUNCA mais que os dados dos planos/);
  assert.match(c, /use SOMENTE os que constam em "Planos à venda"/, "o canal manda usar só os valores cadastrados");
  assert.ok(c.indexOf("Material comercial (como conduzir") < c.indexOf("Script de atendimento do dono do FilaPro Leads ("), "no contexto, o script vem depois do material (vale mais)");
});

test("sem script, só o material; sem os dois, a conversa segue como antes", async () => {
  pedidos = [];
  await responderConversa({ ...base, visitanteSite: true, comercial: "SO-MATERIAL" }, quem);
  assert.match(conteudo(), /SO-MATERIAL/);
  assert.doesNotMatch(conteudo(), /Script de atendimento do dono do FilaPro Leads \(/, "sem script, o bloco do script não entra no contexto");
  pedidos = [];
  await responderConversa({ ...base, visitanteSite: true }, quem);
  assert.doesNotMatch(conteudo(), /Material comercial \(como conduzir|Script de atendimento do dono do FilaPro Leads \(/);
});

test("conversa de LEAD (WhatsApp dos clientes): o material comercial e o script do Fale conosco NUNCA entram, mesmo se passados", async () => {
  pedidos = [];
  await responderConversa({ ...base, comercial: "MATERIAL-QUE-NAO-PODE-VAZAR", orientacoesVisitante: "SCRIPT-QUE-NAO-PODE-VAZAR" }, quem);
  const c = conteudo();
  assert.doesNotMatch(c, /MATERIAL-QUE-NAO-PODE-VAZAR|SCRIPT-QUE-NAO-PODE-VAZAR/);
  assert.doesNotMatch(c, /Canal: chat da tela de Planos/);
});

test("decisão #179: o chat do site usa o texto-base PRÓPRIO do consultor (sem a regra de usar SOMENTE a ficha, que fazia a IA ignorar o script)", async () => {
  pedidos = [];
  await responderConversa({ ...base, visitanteSite: true, comercial: "MAT", orientacoesVisitante: "SCR" }, quem);
  const c = conteudo();
  assert.match(c, /CONSULTOR COMERCIAL DO FILAPRO LEADS/);
  assert.match(c, /"Script de atendimento do dono": é o ROTEIRO que você SEGUE/);
  assert.match(c, /em ordem de autoridade/);
  assert.match(c, /ÚNICA fonte de valores/);
  assert.match(c, /Em conflito com o material comercial, vale o script/);
  assert.match(c, /nem o script do dono muda isto/);
  assert.doesNotMatch(c, /Use SOMENTE as informações da ficha da empresa/, "essa regra dos leads não pode valer para o visitante");
  assert.doesNotMatch(c, /ATENDENTE DE WHATSAPP/);
  assert.match(c, /O script do dono vale em TODA resposta, não só na primeira/, "o script não vale só na abertura");
  assert.match(c, /escritas ANTES do script existir ou em outro estilo/, "conversa que já tinha respostas antigas passa a seguir o script");
  // E o resto continua igual: JSON com temperatura, status e naoSei
  assert.match(c, /"naoSei": false/);
});

test("conversa de LEAD continua com o texto-base de sempre (só a ficha)", async () => {
  pedidos = [];
  await responderConversa({ ...base }, quem);
  const c = conteudo();
  assert.match(c, /ATENDENTE DE WHATSAPP/);
  assert.match(c, /Use SOMENTE as informações da ficha da empresa/);
  assert.doesNotMatch(c, /CONSULTOR COMERCIAL/);
});
