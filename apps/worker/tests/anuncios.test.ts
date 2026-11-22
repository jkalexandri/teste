// Testes da etapa 10b (decisões #81, #84 e #94): avisos com resumo de 10 minutos e leads de anúncios
// atendidos pela IA — WhatsApp falso, IA "simulado" e banco real. Rodar: DATABASE_URL=... pnpm --filter worker test
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, AutorMensagem, Cargo, Modulo, StatusAnuncio, StatusLead } from "@filapro/db";
import { Avisador, INTERVALO_RESUMO_MS } from "../src/avisos.js";
import { Atendente } from "../src/conversas.js";
import type { Conteudo, Remetente } from "../src/disparos.js";

const EMP = "teste-anu-emp", USU = "teste-anu-usu", ADM = "teste-anu-adm", TEL = "5511990002222";
const log = pino({ level: "silent" });

class Falso implements Remetente {
  conectadoAgora = true;
  enviados: { jid: string; conteudo: Conteudo }[] = [];
  conectado() { return this.conectadoAgora; }
  async verificarNumero(_s: string, tel: string) { return `${tel}@s.whatsapp.net`; }
  async digitando() {}
  async enviar(_s: string, jid: string, conteudo: Conteudo) { this.enviados.push({ jid, conteudo }); }
}

let agora = new Date("2026-11-23T14:00:00Z");
let wa: Falso, avisos: { para: string; texto: string }[], avisador: Avisador, at: Atendente;
let configAntes: Awaited<ReturnType<typeof prisma.configIA.findUnique>> = null;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function aguardar() { for (let i = 0; i < 100 && at.pendentes(); i++) await espera(20); await espera(200); }
const anuncio = (extra: Record<string, unknown> = {}) =>
  prisma.leadAnuncio.create({ data: { usuarioId: USU, origem: "google", nome: "Carla Lima", telefone: TEL, email: "carla@x.com", assunto: "Interesse: limpeza de pele", ...extra } });

before(async () => {
  configAntes = await prisma.configIA.findUnique({ where: { tarefa: "conversar" } });
  const d = { provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 };
  await prisma.configIA.upsert({ where: { tarefa: "conversar" }, update: d, create: { tarefa: "conversar", ...d } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.usuario.deleteMany({ where: { id: { in: [USU, ADM] } } });
  await prisma.empresa.create({ data: { id: EMP, codigo: "E99901", nome: "Clínica Anúncio", modulo: Modulo.EMPRESARIAL, pacote: "Teste", limiteUsuarios: 5, expiraEm: new Date("2030-01-01"), leadsAnuncios: true } });
  await prisma.usuario.create({ data: { id: USU, codigo: "EU99901", nome: "Bia", email: "bia@anu.local", whatsapp: "(11) 97777-0001", cargo: Cargo.USUARIO, empresaId: EMP } });
  await prisma.usuario.create({ data: { id: ADM, codigo: "EU99902", nome: "Admin", email: "adm@anu.local", numeroAvisos: "(11) 97777-0009", cargo: Cargo.ADMIN_EMPRESA, empresaId: EMP } });
});
beforeEach(async () => {
  agora = new Date("2026-11-23T14:00:00Z");
  await prisma.lead.deleteMany({ where: { empresaId: EMP } });
  await prisma.leadAnuncio.deleteMany({ where: { usuarioId: USU } });
  await prisma.avisoPendente.deleteMany({ where: { usuarioId: { in: [USU, ADM] } } });
  await prisma.usuario.updateMany({ where: { id: { in: [USU, ADM] } }, data: { ultimoAvisoEm: null, avisoQuente: true, avisoAnuncio: true, avisoRespondeu: true, iaConversas: true, limiteLeads: null } });
  wa = new Falso();
  avisos = [];
  avisador = new Avisador(log, { notificar: async (para, texto) => { avisos.push({ para, texto }); }, agora: () => agora });
  at = new Atendente(wa, log, { pastaArquivos: "/tmp", esperaMs: () => 0, notificar: async (para, texto) => { avisos.push({ para, texto }); }, avisos: avisador, agora: () => agora });
});
after(async () => {
  await prisma.lead.deleteMany({ where: { empresaId: EMP } });
  await prisma.leadAnuncio.deleteMany({ where: { usuarioId: USU } });
  await prisma.avisoPendente.deleteMany({ where: { usuarioId: { in: [USU, ADM] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [USU, ADM] } } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.usoIA.deleteMany({ where: { usuarioId: USU } });
  if (configAntes) { const { tarefa, ...r } = configAntes; await prisma.configIA.update({ where: { tarefa }, data: r }); }
  else await prisma.configIA.deleteMany({ where: { tarefa: "conversar" } });
  await prisma.$disconnect();
});

test("avisos: o primeiro sai na hora; os seguintes viram um resumo depois de 10 minutos", async () => {
  await avisador.avisar("RESPONDEU", USU, "💬 Lead 1 respondeu");
  assert.equal(avisos.filter((a) => a.para === "5511977770001").length, 1);
  await avisador.avisar("RESPONDEU", USU, "💬 Lead 2 respondeu");
  await avisador.avisar("QUENTE", USU, "🔥 Lead 3 Quente");
  assert.equal(avisos.filter((a) => a.para === "5511977770001").length, 1, "os outros esperam o resumo");
  await avisador.enviarResumos();
  assert.equal(avisos.filter((a) => a.para === "5511977770001").length, 1, "ainda dentro dos 10 minutos");
  agora = new Date(agora.getTime() + INTERVALO_RESUMO_MS);
  await avisador.enviarResumos();
  const doUsuario = avisos.filter((a) => a.para === "5511977770001");
  assert.equal(doUsuario.length, 2);
  assert.match(doUsuario[1]!.texto, /resumo \(2 avisos\)/);
  assert.match(doUsuario[1]!.texto, /Lead 2/);
  assert.match(doUsuario[1]!.texto, /Lead 3/);
});

test("avisos: Admin da Empresa recebe os dos usuários no número de avisos; liga/desliga por tipo", async () => {
  await avisador.avisar("ANUNCIO", USU, "📣 Novo lead");
  const adm = avisos.filter((a) => a.para === "5511977770009");
  assert.equal(adm.length, 1);
  assert.match(adm[0]!.texto, /^\[Bia\] 📣 Novo lead/);
  await prisma.usuario.updateMany({ where: { id: { in: [USU, ADM] } }, data: { avisoQuente: false, ultimoAvisoEm: null } });
  avisos = [];
  await avisador.avisar("QUENTE", USU, "🔥 Quente");
  assert.equal(avisos.length, 0, "tipo desligado não avisa");
});

test("lead de anúncio: cadastra com código, a IA escreve a primeira mensagem e avisa", async () => {
  const a = await anuncio();
  await at.atenderAnuncio(a.id);
  const r = await prisma.leadAnuncio.findUniqueOrThrow({ where: { id: a.id } });
  assert.equal(r.status, StatusAnuncio.ATENDIDO);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } });
  assert.match(lead.codigo, /^EL\d{5,}$/);
  assert.equal(lead.usuarioId, USU);
  assert.equal(lead.nome, "Carla Lima");
  assert.match(lead.resumoConversa, /Veio de anúncio.*limpeza de pele/);
  assert.equal(wa.enviados.length, 1);
  assert.equal(wa.enviados[0]!.jid, `${TEL}@s.whatsapp.net`);
  const msgs = await prisma.mensagem.findMany({ where: { leadId: lead.id } });
  assert.deepEqual(msgs.map((m) => m.autor), [AutorMensagem.IA]);
  assert.ok(avisos.some((x) => x.para === "5511977770001" && /Novo lead de anúncio: Carla Lima/.test(x.texto)));
  // Chamado de novo (varredura/repetição): não manda outra mensagem
  await at.atenderAnuncio(a.id);
  assert.equal(wa.enviados.length, 1);
});

test("lead de anúncio que já existe: não duplica, tira o bloqueio de quem pediu para sair; fica com o dono", async () => {
  await prisma.usuario.create({ data: { id: "teste-anu-outro", codigo: "EU99903", nome: "Outro", email: "outro@anu.local", cargo: Cargo.USUARIO, empresaId: EMP } });
  try {
    const existente = await prisma.lead.create({
      data: { codigo: "EL-ANU-1", nome: "", telefone: TEL, usuarioId: "teste-anu-outro", empresaId: EMP, codigoUsuario: "x", status: StatusLead.PEDIU_SAIR, pediuSairEm: new Date() },
    });
    const a = await anuncio();
    await at.atenderAnuncio(a.id);
    assert.equal(await prisma.lead.count({ where: { empresaId: EMP, telefone: TEL } }), 1);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: existente.id } });
    assert.equal(lead.usuarioId, "teste-anu-outro", "quem cadastrou primeiro");
    assert.equal(lead.pediuSairEm, null);
    assert.notEqual(lead.status, StatusLead.PEDIU_SAIR);
    assert.equal(lead.nome, "Carla Lima", "nome vazio é completado");
    assert.equal((await prisma.leadAnuncio.findUniqueOrThrow({ where: { id: a.id } })).status, StatusAnuncio.ATENDIDO);
  } finally {
    await prisma.lead.deleteMany({ where: { usuarioId: "teste-anu-outro" } });
    await prisma.usuario.deleteMany({ where: { id: "teste-anu-outro" } });
  }
});

test("WhatsApp desconectado: lead espera, usuário é avisado e a IA atende ao reconectar", async () => {
  wa.conectadoAgora = false;
  const a = await anuncio();
  await at.atenderAnuncio(a.id);
  assert.equal((await prisma.leadAnuncio.findUniqueOrThrow({ where: { id: a.id } })).status, StatusAnuncio.AGUARDANDO_WHATSAPP);
  assert.ok(avisos.some((x) => /desconectado/.test(x.texto)));
  await espera(150); // o aviso de "novo lead" sai em segundo plano
  const nAvisos = avisos.length;
  await at.atenderAnuncio(a.id);
  assert.equal(avisos.length, nAvisos, "avisa só uma vez");
  wa.conectadoAgora = true;
  await at.aoConectar(USU);
  assert.equal((await prisma.leadAnuncio.findUniqueOrThrow({ where: { id: a.id } })).status, StatusAnuncio.ATENDIDO);
  assert.equal(wa.enviados.length, 1, JSON.stringify(wa.enviados));
});

test("reconexão: responde as respostas de campanha que ficaram sem resposta", async () => {
  const l = await prisma.lead.create({ data: { codigo: "EL-ANU-2", nome: "Davi", telefone: "5511990003333", usuarioId: USU, empresaId: EMP, codigoUsuario: "x", ultimaMensagemEm: agora } });
  await prisma.mensagem.createMany({ data: [
    { leadId: l.id, autor: AutorMensagem.CAMPANHA, texto: "Oi Davi!", criadoEm: new Date(agora.getTime() - 120_000) },
    { leadId: l.id, autor: AutorMensagem.LEAD, texto: "Oi, quero saber mais", criadoEm: new Date(agora.getTime() - 60_000) },
  ] });
  await at.aoConectar(USU);
  await aguardar();
  assert.equal(wa.enviados.length, 1);
  assert.equal(wa.enviados[0]!.jid, "5511990003333@s.whatsapp.net");
});

test("limite de leads atingido: o lead de anúncio entra e o usuário é avisado", async () => {
  await prisma.usuario.update({ where: { id: USU }, data: { limiteLeads: 0 } });
  const a = await anuncio();
  await at.atenderAnuncio(a.id);
  assert.equal(await prisma.lead.count({ where: { usuarioId: USU } }), 1);
  assert.ok(avisos.some((x) => /mesmo com o limite de 0 leads do usuário/.test(x.texto)));
});

test("avisos de lead respondeu e de lead Quente nas conversas", async () => {
  await prisma.lead.create({ data: { codigo: "EL-ANU-3", nome: "Eva", telefone: TEL, usuarioId: USU, empresaId: EMP, codigoUsuario: "x" } });
  await at.receber(USU, USU, TEL, { texto: "Quero agendar amanhã", tipo: "texto" });
  await aguardar();
  assert.ok(avisos.some((x) => /Eva .*respondeu: "Quero agendar amanhã"/.test(x.texto)), avisos.map((a) => a.texto).join(" | "));
  // O aviso de Quente chega no resumo (o de "respondeu" já saiu há menos de 10 minutos)
  agora = new Date(agora.getTime() + INTERVALO_RESUMO_MS);
  await avisador.enviarResumos();
  assert.ok(avisos.some((x) => /Lead Quente: Eva/.test(x.texto)));
  // SAIR não gera aviso de "respondeu"
  const antes = avisos.length;
  await at.receber(USU, USU, TEL, { texto: "SAIR", tipo: "texto" });
  await avisador.enviarResumos();
  assert.equal(avisos.length, antes);
});
