// Encerramento do atendimento do suporte por inatividade do cliente (decisão #156). Banco real, relógio injetado.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { EncerradorSuporte, TEXTO_ENCERRADO } from "../src/encerrar-suporte.js";

const EMP = "tse-emp", USU = "tse-usu";
const MIN = 60_000;
let agora = new Date();
let conversaId = "";
const enc = () => new EncerradorSuporte(pino({ level: "silent" }), { agora: () => agora });
const ha = (min: number) => new Date(agora.getTime() - min * MIN);
const msg = (autor: string, quando: Date, texto = "texto") => prisma.suporteMensagem.create({ data: { conversaId, autor, autorId: autor === "CLIENTE" ? USU : "x", texto, criadoEm: quando } });
const conversa = () => prisma.suporteConversa.findUniqueOrThrow({ where: { id: conversaId } });
const sistema = () => prisma.suporteMensagem.findMany({ where: { conversaId, autor: "SISTEMA" } });
/** Cria a conversa com a última atividade em `ultima` */
const nova = async (ultima: Date, extra: Record<string, unknown> = {}) => {
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: USU } });
  conversaId = (await prisma.suporteConversa.create({ data: { usuarioId: USU, ultimaMensagemEm: ultima, naoLidasSuporte: 2, naoLidasCliente: 1, ...extra } })).id;
};

before(async () => {
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.empresa.create({ data: { id: EMP, codigo: "TSE9", nome: "Empresa Encerra", modulo: Modulo.INDIVIDUAL, pacote: "Teste", limiteUsuarios: 1, expiraEm: new Date("2030-01-01") } });
  await prisma.usuario.create({ data: { id: USU, codigo: "TSU9", nome: "Cliente Encerra", email: "encerra@teste.local", cargo: Cargo.USUARIO, empresaId: EMP } });
});
beforeEach(() => { agora = new Date(); });
after(async () => {
  await prisma.suporteConversa.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.$disconnect();
});

test("resposta do Suporte e 10 min sem o cliente escrever: encerra com mensagem do sistema, sem mexer em ordem nem em não lidas", async () => {
  await nova(ha(11));
  await msg("CLIENTE", ha(15)); await msg("SUPORTE", ha(11));
  assert.equal(await enc().verificar(), 1);
  const c = await conversa();
  assert.ok(c.encerradaEm);
  assert.equal(c.ultimaMensagemEm.getTime(), ha(11).getTime(), "a conversa não sobe na lista por causa do encerramento");
  assert.equal(c.naoLidasSuporte, 2); assert.equal(c.naoLidasCliente, 1, "sem notificação nova");
  const [s] = await sistema();
  assert.equal(s!.texto, TEXTO_ENCERRADO);
  assert.equal(TEXTO_ENCERRADO, "Atendimento encerrado por inatividade. Se precisar, é só escrever de novo.");
});

test("com menos de 10 min ainda não encerra; com exatamente a resposta recente, nada", async () => {
  await nova(ha(9));
  await msg("SUPORTE", ha(9));
  assert.equal(await enc().verificar(), 0);
  assert.equal((await conversa()).encerradaEm, null);
  assert.equal((await sistema()).length, 0);
});

test("resposta NORMAL da IA também conta (a vez é do cliente)", async () => {
  await nova(ha(12));
  await msg("CLIENTE", ha(13)); await msg("IA", ha(12));
  assert.equal(await enc().verificar(), 1);
});

test("NUNCA encerra enquanto o cliente espera o atendente: IA passou o caso e ninguém respondeu", async () => {
  await nova(ha(60), { iaPausada: true, iaPausaMotivo: "A IA não soube responder" });
  await msg("CLIENTE", ha(61)); await msg("IA", ha(60), "Vou chamar um atendente");
  assert.equal(await enc().verificar(), 0);
  assert.equal((await conversa()).encerradaEm, null);
  // idem para os outros motivos de passar para o atendente
  for (const motivo of ["O cliente pediu um atendente", "Assunto que fica com o atendente (pagamento, cobrança, cancelamento, bloqueio ou reclamação)", "O cliente enviou um arquivo"]) {
    await prisma.suporteConversa.update({ where: { id: conversaId }, data: { iaPausaMotivo: motivo } });
    assert.equal(await enc().verificar(), 0, motivo);
  }
});

test("quem espera o Suporte (última mensagem do cliente) nunca é encerrado, por mais antiga que seja", async () => {
  await nova(ha(30));
  await msg("SUPORTE", ha(40)); await msg("CLIENTE", ha(30), "alguém aí?");
  assert.equal(await enc().verificar(), 0);
  assert.equal((await conversa()).encerradaEm, null);
});

test("depois que o Super Admin respondeu, o relógio corre mesmo com a IA pausada por 'Assumida'", async () => {
  await nova(ha(11), { iaPausada: true, iaPausaMotivo: "Assumida pelo Super Admin" });
  await msg("CLIENTE", ha(20)); await msg("IA", ha(19), "Vou chamar um atendente"); await msg("SUPORTE", ha(11), "Oi, já vejo isso");
  assert.equal(await enc().verificar(), 1);
});

test("conversa antiga (sem atividade nas últimas 24 h) NÃO é encerrada em massa: sem mensagem nova", async () => {
  await nova(new Date(agora.getTime() - 3 * 24 * 3600_000));
  await msg("SUPORTE", new Date(agora.getTime() - 3 * 24 * 3600_000));
  assert.equal(await enc().verificar(), 0);
  assert.equal((await conversa()).encerradaEm, null);
  assert.equal((await sistema()).length, 0);
});

test("já encerrada não é encerrada de novo (uma mensagem só); reaberta e inativa de novo, encerra outra vez", async () => {
  await nova(ha(11));
  await msg("SUPORTE", ha(11));
  assert.equal(await enc().verificar(), 1);
  assert.equal(await enc().verificar(), 0);
  assert.equal((await sistema()).length, 1);
  // 40 min depois o cliente escreve (a tela reabre), o Suporte responde e ele fica 11 min sem responder
  agora = new Date(agora.getTime() + 40 * MIN);
  await msg("CLIENTE", ha(25)); await msg("SUPORTE", ha(11), "resposta");
  await prisma.suporteConversa.update({ where: { id: conversaId }, data: { encerradaEm: null, ultimaMensagemEm: ha(11) } });
  assert.equal(await enc().verificar(), 1);
  assert.equal((await sistema()).length, 2);
});

test("se o cliente escreveu enquanto conferia, não encerra (condição no próprio update)", async () => {
  await nova(ha(11));
  await msg("SUPORTE", ha(11));
  // simula a mensagem do cliente chegando entre a leitura e o fechamento: a data da conversa muda
  const e = enc();
  const antes = prisma.suporteConversa.findMany;
  (prisma.suporteConversa as { findMany: unknown }).findMany = async (...a: unknown[]) => { const r = await (antes as (...x: unknown[]) => Promise<unknown>).apply(prisma.suporteConversa, a); await prisma.suporteConversa.update({ where: { id: conversaId }, data: { ultimaMensagemEm: new Date() } }); return r; };
  try { assert.equal(await e.verificar(), 0); } finally { (prisma.suporteConversa as { findMany: unknown }).findMany = antes; }
  assert.equal((await conversa()).encerradaEm, null);
  assert.equal((await sistema()).length, 0);
});
