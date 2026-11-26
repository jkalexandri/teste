// Testes da IA no suporte dos clientes (decisão #146), com a IA "simulado" e o banco real.
// Cobre: chave geral, resposta normal, passar para o atendente (não sei, assunto sensível, pedido de atendente,
// arquivo, limite do dia, erro da IA), conversa pausada e dados que vão para a IA.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { AtendenteSuporte, assuntoDoAtendente, LIMITE_RESPOSTAS_DIA, MOTIVO_ARQUIVO, MOTIVO_ERRO, MOTIVO_HUMANO, MOTIVO_LIMITE, MOTIVO_NAO_SEI, MOTIVO_SENSIVEL } from "../src/suporte-ia.js";

const EMP = "tsi-emp", USU = "tsi-usu";
let configAntes: Awaited<ReturnType<typeof prisma.configIA.findUnique>> = null;
let ligadaAntes = false;
let avisos: string[] = [];
let manuais: Cargo[] = [];
let conversaId = "";
const at = () => new AtendenteSuporte(pino({ level: "silent" }), {
  esperaMs: () => 0,
  avisarSuporte: async (t) => { avisos.push(t); },
  lerManual: async (c) => { manuais.push(c); return "MANUAL DE TESTE: para conectar o WhatsApp abra WhatsApp no menu e leia o QR Code."; },
});
const cliente = (texto: string, extra: Record<string, unknown> = {}) => prisma.suporteMensagem.create({ data: { conversaId, autor: "CLIENTE", autorId: USU, texto, ...extra } });
const conv = () => prisma.suporteConversa.findUniqueOrThrow({ where: { id: conversaId } });
const mensagens = () => prisma.suporteMensagem.findMany({ where: { conversaId }, orderBy: { criadoEm: "asc" } });
const ligar = (v: boolean) => prisma.configVenda.upsert({ where: { id: "config" }, update: { iaSuporteLigada: v }, create: { id: "config", iaSuporteLigada: v } });

before(async () => {
  configAntes = await prisma.configIA.findUnique({ where: { tarefa: "conversar" } });
  ligadaAntes = (await prisma.configVenda.findUnique({ where: { id: "config" } }))?.iaSuporteLigada ?? false;
  const d = { provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 };
  await prisma.configIA.upsert({ where: { tarefa: "conversar" }, update: d, create: { tarefa: "conversar", ...d } });
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.empresa.create({ data: { id: EMP, codigo: "TSE", nome: "Empresa Suporte", modulo: Modulo.INDIVIDUAL, pacote: "Teste", limiteUsuarios: 1, expiraEm: new Date("2030-01-01") } });
  await prisma.usuario.create({ data: { id: USU, codigo: "TSU", nome: "Cliente Teste", email: "suporte-ia@teste.local", cargo: Cargo.USUARIO, empresaId: EMP } });
});
beforeEach(async () => {
  avisos = []; manuais = [];
  await ligar(true);
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: USU } });
  conversaId = (await prisma.suporteConversa.create({ data: { usuarioId: USU } })).id;
});
after(async () => {
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await ligar(ligadaAntes);
  if (configAntes) { const { tarefa, ...r } = configAntes; await prisma.configIA.update({ where: { tarefa }, data: r }); }
  else await prisma.configIA.deleteMany({ where: { tarefa: "conversar" } });
  await prisma.$disconnect();
});

test("chave geral desligada: a IA não responde", async () => {
  await ligar(false);
  await cliente("como conecto meu whatsapp?");
  await at().responder(USU);
  assert.equal((await mensagens()).length, 1);
  assert.equal(manuais.length, 0);
});

test("pergunta normal: a IA responde com o manual do perfil, avisa o cliente e não pausa nem avisa o Super Admin", async () => {
  await cliente("como conecto meu whatsapp?");
  await at().responder(USU);
  const m = await mensagens();
  assert.equal(m.length, 2);
  assert.equal(m[1]!.autor, "IA");
  assert.match(m[1]!.texto, /QR Code/);
  const c = await conv();
  assert.equal(c.iaPausada, false); assert.equal(c.naoLidasCliente, 1);
  assert.deepEqual(manuais, [Cargo.USUARIO], "usa o manual do perfil de quem pergunta");
  assert.equal(avisos.length, 0);
});

test("a IA não sabe: responde, pausa a conversa e avisa o Super Admin na hora", async () => {
  await cliente("tenho uma pergunta aleatória sobre outra coisa");
  await at().responder(USU);
  const c = await conv();
  assert.equal(c.iaPausada, true); assert.equal(c.iaPausaMotivo, MOTIVO_NAO_SEI);
  assert.equal((await mensagens()).at(-1)!.autor, "IA");
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /Cliente Teste \(suporte-ia@teste\.local\) precisa de você/);
  // pausada: uma nova mensagem não é respondida
  await cliente("alguém aí?");
  await at().responder(USU);
  assert.equal((await mensagens()).at(-1)!.autor, "CLIENTE");
});

test("assuntos sensíveis e pedido de atendente passam direto, SEM gastar IA", async () => {
  for (const [fala, motivo] of [["quero cancelar meu plano", MOTIVO_SENSIVEL], ["meu pagamento não caiu", MOTIVO_SENSIVEL], ["minha conta está bloqueada", MOTIVO_SENSIVEL], ["quero falar com um atendente", MOTIVO_HUMANO]] as const) {
    await prisma.suporteMensagem.deleteMany({ where: { conversaId } });
    await prisma.suporteConversa.update({ where: { id: conversaId }, data: { iaPausada: false, iaPausaMotivo: null } });
    avisos = []; manuais = [];
    await cliente(fala);
    await at().responder(USU);
    const c = await conv();
    assert.equal(c.iaPausaMotivo, motivo, fala); assert.equal(c.iaPausada, true);
    assert.equal(manuais.length, 0, "não chegou a ler o manual nem chamar a IA");
    assert.match((await mensagens()).at(-1)!.texto, /Vou chamar um atendente/);
    assert.equal(avisos.length, 1);
  }
});

test("arquivo enviado: a IA não lê, avisa o cliente e passa para o atendente", async () => {
  await cliente("segue o print", { tipo: "imagem", arquivoNome: "print.png", arquivoTipo: "image/png" });
  await at().responder(USU);
  const c = await conv();
  assert.equal(c.iaPausaMotivo, MOTIVO_ARQUIVO);
  assert.match((await mensagens()).at(-1)!.texto, /Recebi o seu arquivo/);
  assert.equal(avisos.length, 1);
});

test(`limite de ${LIMITE_RESPOSTAS_DIA} respostas da IA por dia: depois pausa e chama o atendente`, async () => {
  for (let i = 0; i < LIMITE_RESPOSTAS_DIA; i++) await prisma.suporteMensagem.create({ data: { conversaId, autor: "IA", autorId: "ia", texto: `r${i}` } });
  await cliente("como conecto meu whatsapp?");
  await at().responder(USU);
  assert.equal((await conv()).iaPausaMotivo, MOTIVO_LIMITE);
  assert.equal(manuais.length, 0);
  assert.equal(avisos.length, 1);
});

test("erro da IA: o cliente não fica sem resposta — passa para o atendente", async () => {
  await prisma.configIA.update({ where: { tarefa: "conversar" }, data: { provedor: "inexistente" } });
  try {
    await cliente("como conecto meu whatsapp?");
    await at().responder(USU);
    assert.equal((await conv()).iaPausaMotivo, MOTIVO_ERRO);
    assert.match((await mensagens()).at(-1)!.texto, /Vou chamar um atendente/);
    assert.equal(avisos.length, 1);
  } finally {
    await prisma.configIA.update({ where: { tarefa: "conversar" }, data: { provedor: "simulado" } });
  }
});

test("quando o Super Admin já respondeu (última mensagem não é do cliente) a IA não responde", async () => {
  await cliente("oi");
  await prisma.suporteMensagem.create({ data: { conversaId, autor: "SUPORTE", autorId: "sa", texto: "Oi! Já te ajudo." } });
  await at().responder(USU);
  assert.equal((await mensagens()).length, 2);
});

test("mensagem que chega ENQUANTO a IA pensa também é respondida (a resposta da IA fica depois dela)", async () => {
  const a = at();
  await cliente("como conecto meu whatsapp?");
  await a.responder(USU);
  const ia1 = (await mensagens()).at(-1)!;
  assert.equal(ia1.autor, "IA");
  // 2ª pergunta que chegou um instante ANTES de a resposta da 1ª ser gravada
  await prisma.suporteMensagem.create({ data: { conversaId, autor: "CLIENTE", autorId: USU, texto: "e como importo meus leads?", criadoEm: new Date(ia1.criadoEm.getTime() - 5) } });
  await a.responder(USU);
  assert.equal((await mensagens()).filter((m) => m.autor === "IA").length, 2, "a 2ª pergunta também recebeu resposta");
  await a.responder(USU);
  assert.equal((await mensagens()).filter((m) => m.autor === "IA").length, 2, "e não responde de novo sem mensagem nova");
});

test("várias mensagens seguidas viram uma resposta só (agendar junta as mensagens)", async () => {
  const a = new AtendenteSuporte(pino({ level: "silent" }), { esperaMs: () => 250, avisarSuporte: async () => undefined, lerManual: async () => "MANUAL: leia o QR Code." });
  await cliente("oi"); a.agendar(USU);
  await cliente("como conecto meu whatsapp?"); a.agendar(USU);
  for (let i = 0; i < 100 && a.pendentes(); i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await mensagens()).filter((m) => m.autor === "IA").length, 1);
});

test("Super Admin nunca é atendido pela IA do suporte", async () => {
  const sa = await prisma.usuario.findFirstOrThrow({ where: { cargo: Cargo.SUPERADMIN }, select: { id: true } });
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: sa.id } });
  const c = await prisma.suporteConversa.create({ data: { usuarioId: sa.id } });
  await prisma.suporteMensagem.create({ data: { conversaId: c.id, autor: "CLIENTE", autorId: sa.id, texto: "teste" } });
  await at().responder(sa.id);
  assert.equal(await prisma.suporteMensagem.count({ where: { conversaId: c.id } }), 1);
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: sa.id } });
});

test("regras de assunto: sensível, atendente e conversa comum", () => {
  assert.equal(assuntoDoAtendente("Quero CANCELAR"), MOTIVO_SENSIVEL);
  assert.equal(assuntoDoAtendente("cobrança errada no cartão"), MOTIVO_SENSIVEL);
  assert.equal(assuntoDoAtendente("tenho uma reclamação"), MOTIVO_SENSIVEL);
  assert.equal(assuntoDoAtendente("posso falar com uma pessoa de verdade?"), MOTIVO_HUMANO);
  assert.equal(assuntoDoAtendente("Preciso de um Atendente"), MOTIVO_HUMANO);
  assert.equal(assuntoDoAtendente("como importo meus leads?"), null);
  assert.equal(assuntoDoAtendente("como conectar o whatsapp"), null);
});
