// Testes das Conversas IA (etapa 10 — decisão #92) com um WhatsApp falso, a IA "simulado" e o banco real.
// Rodar: DATABASE_URL=... pnpm --filter worker test
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, AutorMensagem, Cargo, Modulo, StatusLead } from "@filapro/db";
import { Atendente, MAX_IA_DIA, MOTIVO_ASSUMIDA, MOTIVO_LIMITE, TEXTO_AUDIO, TEXTO_RESERVA, TETO_ESPERA_MS } from "../src/conversas.js";
import type { Conteudo, Remetente } from "../src/disparos.js";
import { limparCacheManutencao } from "../src/manutencao.js";

const EMP = "teste-conv-emp", USU = "teste-conv-usu", TEL = "5511990001111";

class Falso implements Remetente {
  conectadoAgora = true;
  /** Quantos envios seguidos falham (simula erro do WhatsApp) */
  falharEnvios = 0;
  enviados: { jid: string; conteudo: Conteudo }[] = [];
  conectado() { return this.conectadoAgora; }
  async verificarNumero(_s: string, tel: string) { return `${tel}@s.whatsapp.net`; }
  async digitando() {}
  async enviar(_s: string, jid: string, conteudo: Conteudo) {
    if (this.falharEnvios > 0) { this.falharEnvios--; throw new Error("falha simulada do WhatsApp"); }
    this.enviados.push({ jid, conteudo });
  }
}

let wa: Falso, at: Atendente, avisos: string[] = [];
let configAntes: Awaited<ReturnType<typeof prisma.configIA.findUnique>> = null;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Espera as respostas agendadas (espera 0) e a IA terminarem. */
async function aguardar() { for (let i = 0; i < 100 && at.pendentes(); i++) await espera(20); await espera(150); }
const msgs = (leadId: string) => prisma.mensagem.findMany({ where: { leadId }, orderBy: { criadoEm: "asc" } });
const novoLead = (extra: Record<string, unknown> = {}) =>
  prisma.lead.create({ data: { codigo: "TCV1", nome: "Maria Souza", telefone: TEL, usuarioId: USU, empresaId: EMP, codigoUsuario: "TCU", codigoEmpresa: "TCE", ...extra } });

before(async () => {
  configAntes = await prisma.configIA.findUnique({ where: { tarefa: "conversar" } });
  const d = { provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 };
  await prisma.configIA.upsert({ where: { tarefa: "conversar" }, update: d, create: { tarefa: "conversar", ...d } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.create({ data: { id: EMP, codigo: "TCE", nome: "Clínica Teste", modulo: Modulo.INDIVIDUAL, pacote: "Teste", limiteUsuarios: 1, expiraEm: new Date("2030-01-01") } });
  await prisma.usuario.create({ data: { id: USU, codigo: "TCU", nome: "Vendedor", email: "conv@teste.local", whatsapp: "(11) 97777-0000", cargo: Cargo.USUARIO, empresaId: EMP } });
  await prisma.fichaEmpresa.create({ data: { empresaId: EMP, nome: "Clínica Teste", resumo: "Clínica de estética em Campinas.", comoQualificar: "Pergunte a data desejada." } });
});
beforeEach(async () => {
  await prisma.lead.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.update({ where: { id: USU }, data: { iaConversas: true } });
  wa = new Falso();
  avisos = [];
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 0, notificar: async (_p, t) => { avisos.push(t); } });
});
after(async () => {
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.usoIA.deleteMany({ where: { usuarioId: USU } });
  if (configAntes) { const { tarefa, ...r } = configAntes; await prisma.configIA.update({ where: { tarefa }, data: r }); }
  else await prisma.configIA.deleteMany({ where: { tarefa: "conversar" } });
  await prisma.$disconnect();
});

test("quem não é lead é ignorado", async () => {
  await at.receber(USU, USU, "5511988887777", { texto: "Oi, tudo bem?", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 0);
  assert.equal(await prisma.mensagem.count({ where: { lead: { usuarioId: USU } } }), 0);
});

test("a IA responde, guarda o histórico e qualifica", async () => {
  const l = await novoLead({ status: StatusLead.EM_CONVERSA });
  await at.receber(USU, USU, TEL, { texto: "Oi, quero saber mais", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 1);
  assert.equal(wa.enviados[0]!.jid, `${TEL}@s.whatsapp.net`);
  const m = await msgs(l.id);
  assert.deepEqual(m.map((x) => x.autor), [AutorMensagem.LEAD, AutorMensagem.IA]);
  let lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(lead.qualificacao, "MORNO");
  assert.equal(lead.naoLidas, 1);
  assert.ok(lead.ultimaMensagemEm);

  await at.receber(USU, USU, TEL, { texto: "Quero agendar para sábado", tipo: "texto" });
  await aguardar();
  lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(lead.qualificacao, "QUENTE");
  assert.equal(lead.status, StatusLead.QUALIFICADO);
  assert.equal((await prisma.usoIA.count({ where: { usuarioId: USU, tarefa: "conversar" } })) >= 2, true, "uso da IA registrado");
});

test("várias mensagens seguidas recebem uma resposta só", async () => {
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 200 });
  await novoLead();
  await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
  await at.receber(USU, USU, TEL, { texto: "tudo bem?", tipo: "texto" });
  await at.receber(USU, USU, TEL, { texto: "queria informação", tipo: "texto" });
  await espera(500); await aguardar();
  assert.equal(wa.enviados.length, 1);
});

test("modo manutenção: a resposta da IA fica guardada e sai depois (decisão #103)", async () => {
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 100 });
  await novoLead();
  await prisma.manutencao.upsert({ where: { id: "geral" }, create: { id: "geral", ligada: true }, update: { ligada: true } });
  limparCacheManutencao();
  try {
    await at.receber(USU, USU, TEL, { texto: "Oi, quanto custa?", tipo: "texto" });
    await espera(400);
    assert.equal(wa.enviados.length, 0);
    assert.equal(at.pendentes(), 1);
  } finally {
    await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: false } });
    limparCacheManutencao();
  }
  await espera(300); await aguardar();
  assert.equal(wa.enviados.length, 1);
});

test("objeção marca o status Objeção", async () => {
  const l = await novoLead({ status: StatusLead.EM_CONVERSA });
  await at.receber(USU, USU, TEL, { texto: "Achei caro", tipo: "texto" });
  await aguardar();
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status, StatusLead.OBJECAO);
});

test("não sabe responder: diz que vai confirmar, NÃO pausa e avisa o usuário (decisão #127)", async () => {
  const l = await novoLead();
  await at.receber(USU, USU, TEL, { texto: "Quanto custa a limpeza de pele?", tipo: "texto" });
  await aguardar();
  assert.match(wa.enviados[0]!.conteudo.texto, /confirmar/);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(lead.iaPausada, false);
  assert.equal(avisos.length, 1);
  // Continua: a próxima mensagem é respondida
  await at.receber(USU, USU, TEL, { texto: "Oi?", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 2);
  assert.equal((await msgs(l.id)).length, 4);
});

test("SAIR, IA desligada e venda concluída não mudam pela IA", async () => {
  await novoLead({ status: StatusLead.PEDIU_SAIR });
  await at.receber(USU, USU, TEL, { texto: "SAIR", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 0);

  await prisma.lead.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.update({ where: { id: USU }, data: { iaConversas: false } });
  await novoLead();
  await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 0, "IA desligada na conta");

  await prisma.lead.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.update({ where: { id: USU }, data: { iaConversas: true } });
  const l = await novoLead({ status: StatusLead.VENDA_CONCLUIDA });
  await at.receber(USU, USU, TEL, { texto: "Quero agendar outra sessão", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 1);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).status, StatusLead.VENDA_CONCLUIDA, "só o usuário marca venda");
});

test("áudio: pede para escrever e avisa o usuário, sem chamar a IA", async () => {
  await novoLead();
  const antes = await prisma.usoIA.count({ where: { usuarioId: USU } });
  await at.receber(USU, USU, TEL, { texto: "", tipo: "audio" });
  await aguardar();
  assert.equal(wa.enviados[0]!.conteudo.texto, TEXTO_AUDIO);
  assert.equal(avisos.length, 1);
  assert.equal(await prisma.usoIA.count({ where: { usuarioId: USU } }), antes);
});

test("imagem vai para a IA", async () => {
  await novoLead();
  let baixou = false;
  await at.receber(USU, USU, TEL, { texto: "", tipo: "imagem", baixarImagem: async () => { baixou = true; return { tipo: "image/png", base64: "iVBORw0KGgo=" }; } });
  await aguardar();
  assert.equal(baixou, true);
  assert.equal(wa.enviados.length, 1);
});

test(`limite de ${MAX_IA_DIA} respostas da IA por dia: pausa e avisa`, async () => {
  const l = await novoLead();
  await prisma.mensagem.createMany({ data: Array.from({ length: MAX_IA_DIA }, () => ({ leadId: l.id, autor: AutorMensagem.IA, texto: "ok" })) });
  await at.receber(USU, USU, TEL, { texto: "Mais uma pergunta", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 0);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(lead.iaPausaMotivo, MOTIVO_LIMITE);
  assert.equal(avisos.length, 1);
});

test("conversa longa: as mensagens antigas entram no resumo", async () => {
  const l = await novoLead();
  const base = Date.now() - 3600_000;
  await prisma.mensagem.createMany({ data: Array.from({ length: 24 }, (_, i) => ({ leadId: l.id, autor: i % 2 ? AutorMensagem.IA : AutorMensagem.LEAD, texto: `mensagem ${i}`, criadoEm: new Date(base + i * 1000) })) });
  await at.receber(USU, USU, TEL, { texto: "E aí?", tipo: "texto" });
  await aguardar();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.match(lead.resumoConversa, /Resumo simulado/);
  assert.ok(lead.resumidoAte);
});

test("usuário escreve: envia, guarda e assume a conversa", async () => {
  const l = await novoLead({ naoLidas: 3 });
  const r = await at.enviarManual(l.id, USU, "Olá Maria, aqui é o Vendedor!");
  assert.equal(r.ok, true);
  assert.equal(wa.enviados[0]!.conteudo.texto, "Olá Maria, aqui é o Vendedor!");
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(lead.iaPausada, true);
  assert.equal(lead.iaPausaMotivo, MOTIVO_ASSUMIDA);
  assert.equal(lead.naoLidas, 0);
  assert.equal((await msgs(l.id))[0]!.autor, AutorMensagem.USUARIO);
  assert.equal((await at.enviarManual(l.id, "outro-usuario", "oi")).ok, false, "só o dono envia");
  wa.conectadoAgora = false;
  assert.match((await at.enviarManual(l.id, USU, "oi")).mensagem, /desconectado/);
});

test("campanha enviada entra no histórico; mensagens com mais de 365 dias são apagadas", async () => {
  const l = await novoLead();
  await at.registrarCampanha(l.id, { texto: "Oi Maria, tudo bem?" });
  await prisma.mensagem.create({ data: { leadId: l.id, autor: AutorMensagem.LEAD, texto: "antiga", criadoEm: new Date(Date.now() - 366 * 86400_000) } });
  await at.limparAntigas();
  const m = await msgs(l.id);
  assert.deepEqual(m.map((x) => [x.autor, x.texto]), [[AutorMensagem.CAMPANHA, "Oi Maria, tudo bem?"]]);
});

// ===== Resposta pendente (decisão #127) =====

test("a resposta fica pendente no banco e fecha depois de responder", async () => {
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 150 });
  const l = await novoLead();
  await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
  const pendente = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.ok(pendente.respostaPendenteDesde && pendente.responderEm, "pendência gravada");
  await espera(300); await aguardar();
  assert.equal(wa.enviados.length, 1);
  const depois = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.equal(depois.respostaPendenteDesde, null);
  assert.equal(depois.responderEm, null);
});

test("serviço reiniciado: a varredura responde o que ficou pendente", async () => {
  const l = await novoLead();
  await prisma.mensagem.create({ data: { leadId: l.id, autor: AutorMensagem.LEAD, texto: "Oi, ainda está aí?" } });
  await prisma.lead.update({ where: { id: l.id }, data: { respostaPendenteDesde: new Date(Date.now() - 60_000), responderEm: new Date(Date.now() - 1_000) } });
  // Atendente novo (sem timers, como depois de um reinício)
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 0 });
  await at.varrerPendentes();
  await aguardar();
  assert.equal(wa.enviados.length, 1);
});

test("teto de espera: mensagens seguidas não adiam além de 30 s desde a primeira", async () => {
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 60_000 });
  const l = await novoLead();
  await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
  const p = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
  assert.ok(p.responderEm!.getTime() - p.respostaPendenteDesde!.getTime() <= TETO_ESPERA_MS);
  at.parar();
});

test("WhatsApp desconectado: a resposta continua pendente e sai quando reconecta", async () => {
  const l = await novoLead();
  wa.conectadoAgora = false;
  await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
  await espera(200);
  assert.equal(wa.enviados.length, 0);
  assert.ok((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).respostaPendenteDesde, "continua pendente");
  wa.conectadoAgora = true;
  await at.aoConectar(USU);
  await aguardar();
  assert.equal(wa.enviados.length, 1);
  at.parar();
});

test("envio falhou uma vez: tenta de novo e entrega", async () => {
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 0, reenvioMs: 10 });
  await novoLead();
  wa.falharEnvios = 1;
  await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 1);
});

test("IA falhou 3 vezes: manda a mensagem reserva e avisa o usuário", async () => {
  await prisma.configIA.update({ where: { tarefa: "conversar" }, data: { provedor: "anthropic", modelo: "claude-haiku-5-5", chave: null } });
  const global = await prisma.configIA.findUnique({ where: { tarefa: "_anthropic" } });
  if (global) await prisma.configIA.delete({ where: { tarefa: "_anthropic" } });
  try {
    at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 0, esperaTentativaMs: () => 30, notificar: async (_p, t) => { avisos.push(t); } });
    const l = await novoLead();
    await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
    for (let i = 0; i < 50 && wa.enviados.length === 0; i++) await espera(50);
    await aguardar();
    assert.equal(wa.enviados.length, 1);
    assert.equal(wa.enviados[0]!.conteudo.texto, TEXTO_RESERVA);
    assert.ok(avisos.some((a) => a.includes("3 tentativas")), "usuário avisado");
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(lead.respostaPendenteDesde, null, "pendência fechada");
    assert.equal(lead.iaPausada, false);
  } finally {
    await prisma.configIA.update({ where: { tarefa: "conversar" }, data: { provedor: "simulado", modelo: "simulado", chave: null } });
    if (global) await prisma.configIA.create({ data: global });
  }
});

test("lead achado com ou sem o 9º dígito", async () => {
  await novoLead({ telefone: "5511990001111" });
  await at.receber(USU, USU, "551190001111", { texto: "Oi", tipo: "texto" });
  await aguardar();
  assert.equal(wa.enviados.length, 1);
});

test("usuário escreve à mão: a resposta pendente da IA é cancelada", async () => {
  at = new Atendente(wa, pino({ level: "silent" }), { pastaArquivos: "/tmp", esperaMs: () => 200 });
  const l = await novoLead();
  await at.receber(USU, USU, TEL, { texto: "Oi", tipo: "texto" });
  await at.enviarManual(l.id, USU, "Oi, aqui é o vendedor");
  await espera(400); await aguardar();
  assert.equal(wa.enviados.length, 1, "só a mensagem manual");
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).respostaPendenteDesde, null);
});
