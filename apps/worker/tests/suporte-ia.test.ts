// Testes da IA no suporte dos clientes (decisão #146), com a IA "simulado" e o banco real.
// Cobre: chave geral, resposta normal, passar para o atendente (não sei, assunto sensível, pedido de atendente,
// arquivo, limite do dia, erro da IA), conversa pausada e dados que vão para a IA.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { AtendenteSuporte, assuntoDoAtendente, montarConhecimento, LIMITE_TESTES_HORA, MAX_ORIENTACOES, LIMITE_RESPOSTAS_DIA, MOTIVO_ARQUIVO, MOTIVO_ERRO, MOTIVO_HUMANO, MOTIVO_LIMITE, MOTIVO_NAO_SEI, MOTIVO_SENSIVEL } from "../src/suporte-ia.js";

type Opcoes_ia = NonNullable<ConstructorParameters<typeof AtendenteSuporte>[1]>["ia"];
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

test("decisão #177: a IA só enxerga o atendimento ATUAL — o pedido de atendente de um atendimento anterior não contamina a conversa nova", async () => {
  // Atendimento 1 (já encerrado): o cliente tinha pedido um atendente. Atendimento 2 (atual): pergunta comum.
  await prisma.suporteConversa.update({ where: { id: conversaId }, data: { atendimentoAtual: 2 } });
  await cliente("quero falar com um atendente", { atendimento: 1, criadoEm: new Date(Date.now() - 60_000) });
  await cliente("como conecto meu whatsapp?", { atendimento: 2 });
  await at().responder(USU);
  const ms = await mensagens();
  const ia = ms.filter((m) => m.autor === "IA");
  assert.equal(ia.length, 1, "a IA respondeu a pergunta nova");
  assert.equal(ia[0]!.atendimento, 2, "a resposta da IA pertence ao atendimento atual");
  assert.equal((await conv()).iaPausada, false, "NÃO passou para atendente por causa da mensagem do atendimento anterior");
  assert.equal(avisos.length, 0);
});

test("sem a regra do atendimento a mesma conversa passaria para o atendente (prova de que o filtro é o que decide)", async () => {
  // Mesmo cenário, mas com as duas mensagens no MESMO atendimento (1): as mensagens seguidas do cliente se juntam e a IA passa o caso
  await cliente("quero falar com um atendente", { criadoEm: new Date(Date.now() - 60_000) });
  await cliente("como conecto meu whatsapp?");
  await at().responder(USU);
  assert.equal((await conv()).iaPausada, true);
  assert.equal((await conv()).iaPausaMotivo, MOTIVO_HUMANO);
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

// ===== Orientações do suporte e teste da pergunta (decisão #148) =====
test("conhecimento da IA: ficha, orientações (valem mais que o manual) e manual do perfil, nessa ordem", () => {
  const c = montarConhecimento({ ficha: "Ficha X", orientacoes: "  Atendemos de segunda a sexta.  ", manual: "MANUAL Y", cargo: Cargo.ADMIN_EMPRESA });
  assert.match(c, /Ficha da empresa:\nFicha X/);
  assert.match(c, /Orientações do atendimento \(definidas pelo dono do FilaPro Leads; valem mais que o manual se houver conflito, mas nunca mais que as regras de segurança\):\nAtendemos de segunda a sexta\./);
  assert.match(c, /Manual de uso do FilaPro Leads para este perfil \(Admin da Empresa\):\nMANUAL Y/);
  assert.ok(c.indexOf("Ficha da empresa") < c.indexOf("Orientações do atendimento") && c.indexOf("Orientações do atendimento") < c.indexOf("Manual de uso"));
  assert.doesNotMatch(montarConhecimento({ cargo: Cargo.USUARIO, manual: "M" }), /Orientações do atendimento/, "sem orientações, a seção não aparece");
  assert.equal(montarConhecimento({ orientacoes: "§".repeat(MAX_ORIENTACOES + 500), cargo: Cargo.USUARIO }).split("§").length - 1, MAX_ORIENTACOES, "corta no limite");
});

test("as orientações salvas do Super Admin chegam à IA nas respostas do suporte e no teste da tela", async () => {
  const sa = await prisma.usuario.findFirstOrThrow({ where: { cargo: Cargo.SUPERADMIN }, select: { id: true } });
  const antes = await prisma.fichaEmpresa.findUnique({ where: { superAdminId: sa.id } });
  await prisma.fichaEmpresa.upsert({ where: { superAdminId: sa.id }, update: { orientacoesSuporte: "ORIENTACAO-TESTE-148" }, create: { superAdminId: sa.id, nome: "", orientacoesSuporte: "ORIENTACAO-TESTE-148" } });
  const recebido: string[] = [];
  const iaEspia: Opcoes_ia = async (d) => { recebido.push(d.conhecimento); return { resposta: "ok", chamarHumano: false, motivo: "", custoUsd: 0 }; };
  const a = new AtendenteSuporte(pino({ level: "silent" }), { esperaMs: () => 0, lerManual: async () => "MANUAL-X", ia: iaEspia });
  try {
    await cliente("como conecto meu whatsapp?");
    await a.responder(USU);
    assert.equal(recebido.length, 1);
    assert.match(recebido[0]!, /ORIENTACAO-TESTE-148/);
    assert.ok(recebido[0]!.indexOf("ORIENTACAO-TESTE-148") < recebido[0]!.indexOf("MANUAL-X"), "orientações antes do manual");
    await a.testar(sa.id, "outra pergunta qualquer");
    assert.equal(recebido.length, 2);
    assert.match(recebido[1]!, /ORIENTACAO-TESTE-148/, "o teste da tela usa as mesmas orientações");
  } finally {
    if (antes) await prisma.fichaEmpresa.update({ where: { superAdminId: sa.id }, data: { orientacoesSuporte: antes.orientacoesSuporte } });
    else await prisma.fichaEmpresa.deleteMany({ where: { superAdminId: sa.id } });
  }
});

test("teste da tela: assunto sensível mostra 'iria para o atendente' sem gastar IA; pergunta comum mostra a resposta; não cria conversa", async () => {
  const a = at();
  const sa = "tsi-sa-teste";
  const conversasAntes = await prisma.suporteConversa.count();
  const sens = await a.testar(sa, "quero cancelar meu plano");
  assert.ok(sens.ok && sens.vaiParaAtendente && sens.motivo === MOTIVO_SENSIVEL);
  assert.equal(manuais.length, 0, "não leu manual nem chamou a IA");
  const normal = await a.testar(sa, "como conecto meu whatsapp?");
  assert.ok(normal.ok && !normal.vaiParaAtendente && /QR Code/.test(normal.resposta));
  const naoSei = await a.testar(sa, "tenho uma pergunta aleatória");
  assert.ok(naoSei.ok && naoSei.vaiParaAtendente && naoSei.motivo === MOTIVO_NAO_SEI);
  assert.deepEqual(await a.testar(sa, "   "), { ok: false, mensagem: "Escreva uma pergunta." });
  assert.equal(await prisma.suporteConversa.count(), conversasAntes, "não cria conversa");
  assert.equal(avisos.length, 0, "não avisa ninguém");
});

test(`teste da tela: limite de ${LIMITE_TESTES_HORA} testes por hora (só os que usam IA contam)`, async () => {
  let agora = new Date("2026-11-26T15:00:00Z");
  const a = new AtendenteSuporte(pino({ level: "silent" }), { agora: () => agora, lerManual: async () => "MANUAL: leia o QR Code." });
  const sa = "tsi-sa-limite";
  for (let i = 0; i < LIMITE_TESTES_HORA; i++) assert.equal((await a.testar(sa, "como conecto meu whatsapp?")).ok, true);
  const bloqueado = await a.testar(sa, "como conecto meu whatsapp?");
  assert.equal(bloqueado.ok, false);
  assert.match((bloqueado as { mensagem: string }).mensagem, /Limite de 10 testes por hora\. Tente de novo em \d+ min\./);
  agora = new Date(agora.getTime() + 61 * 60_000);
  assert.equal((await a.testar(sa, "como conecto meu whatsapp?")).ok, true, "passada 1 hora, libera");
  assert.equal((await a.testar("tsi-sa-outro", "como conecto meu whatsapp?")).ok, true, "o limite é por Super Admin");
});

// ===== Religar o ponto Suporte (decisão #149) =====
test("religar o Suporte: a IA responde quem esperou (último recado do cliente, não pausada, recente); não responde pausada nem antiga", async () => {
  await ligar(false);
  await cliente("como conecto meu whatsapp?");
  const a = at();
  await a.responder(USU);
  assert.equal((await mensagens()).length, 1, "desligado: ninguém responde");
  await a.religou(); // ainda desligado
  for (let i = 0; i < 50 && a.pendentes(); i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal((await mensagens()).length, 1);
  await ligar(true);
  await a.religou();
  for (let i = 0; i < 100 && a.pendentes(); i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await mensagens()).filter((m) => m.autor === "IA").length, 1, "respondeu quem esperou");
  // religar de novo não responde outra vez
  await a.religou();
  for (let i = 0; i < 50 && a.pendentes(); i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await mensagens()).filter((m) => m.autor === "IA").length, 1);
  // conversa pausada (assumida) e conversa antiga (mais de 48 h) não são respondidas
  await prisma.suporteMensagem.deleteMany({ where: { conversaId } });
  await cliente("outra dúvida");
  await prisma.suporteConversa.update({ where: { id: conversaId }, data: { iaPausada: true, iaPausaMotivo: "Assumida pelo Super Admin" } });
  await a.religou(); await new Promise((r) => setTimeout(r, 300));
  assert.equal((await mensagens()).filter((m) => m.autor === "IA").length, 0, "pausada continua com o Super Admin");
  await prisma.suporteConversa.update({ where: { id: conversaId }, data: { iaPausada: false, iaPausaMotivo: null, ultimaMensagemEm: new Date(Date.now() - 49 * 3600_000) } });
  await a.religou(); await new Promise((r) => setTimeout(r, 300));
  assert.equal((await mensagens()).filter((m) => m.autor === "IA").length, 0, "conversa antiga (>48 h) não recebe resposta atrasada");
});
