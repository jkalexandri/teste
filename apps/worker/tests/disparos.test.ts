// Testes do motor de disparos (etapa 8b) com um WhatsApp simulado e o banco real.
// Rodar: DATABASE_URL=... pnpm --filter worker test
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, StatusCampanha, StatusEnvio, StatusLead, Modulo, Cargo } from "@filapro/db";
import { limparCacheManutencao } from "../src/manutencao.js";
import { MOTIVO_CONTA, motivoContaSemAcesso } from "../src/conta-acesso.js";
import { MotorDisparos, MOTIVO_DESCONECTADO, MOTIVO_JANELA, type Conteudo, type Remetente } from "../src/disparos.js";

const EMP = "teste-motor-emp", USU = "teste-motor-usu";
// Segunda-feira, 23/11/2026, 11:00 em São Paulo (dentro da janela 8h–20h)
let agora = new Date("2026-11-23T14:00:00Z");

class Falso implements Remetente {
  conectadoAgora = true;
  semWhatsapp = new Set<string>();
  falhar = false;
  enviados: { jid: string; conteudo: Conteudo }[] = [];
  conectado() { return this.conectadoAgora; }
  async verificarNumero(_s: string, tel: string) { return this.semWhatsapp.has(tel) ? null : `${tel}@s.whatsapp.net`; }
  async digitando() {}
  async enviar(_s: string, jid: string, conteudo: Conteudo) {
    if (this.falhar) throw new Error("erro simulado");
    this.enviados.push({ jid, conteudo });
  }
}

let wa: Falso;
let motor: MotorDisparos;
let avisos: { para: string; texto: string }[] = [];
const log = pino({ level: "silent" });

async function lead(n: number, extra: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: { codigo: `TM${n}`, nome: `Lead ${n} Silva`, telefone: `55119900${String(n).padStart(5, "0")}`, usuarioId: USU, empresaId: EMP, codigoUsuario: "TMU", codigoEmpresa: "TME", ...extra },
  });
}
async function campanha(leads: { id: string; telefone: string; nome: string }[], extra: Record<string, unknown> = {}) {
  const c = await prisma.campanha.create({
    data: { usuarioId: USU, empresaId: EMP, assunto: "Teste motor", mensagem: "{saudacao} {nome}, tudo bem?", status: StatusCampanha.EM_ANDAMENTO, iniciadaEm: agora, totalLeads: leads.length, randomizar: false, ...extra },
  });
  await prisma.envio.createMany({ data: leads.map((l, i) => ({ campanhaId: c.id, leadId: l.id, telefone: l.telefone, nome: l.nome, ordem: i })) });
  return c;
}
async function rodar(limite = 200) {
  const r = [];
  for (let i = 0; i < limite; i++) {
    const p = await motor.passo(USU);
    r.push(p);
    if (p.acao === "nada" || (p.acao === "aguardar" && p.esperaMs > 0)) break;
  }
  return r;
}
const status = (id: string) => prisma.campanha.findUniqueOrThrow({ where: { id } });

before(async () => {
  await prisma.empresa.deleteMany({ where: { id: EMP } }).catch(() => undefined);
  await prisma.empresa.create({ data: { id: EMP, codigo: "TME", nome: "Empresa Motor", modulo: Modulo.EMPRESARIAL, pacote: "Teste", limiteUsuarios: 5, expiraEm: new Date("2030-01-01") } });
  await prisma.usuario.create({ data: { id: USU, codigo: "TMU", nome: "Usuário Motor", email: "motor@teste.local", whatsapp: "(11) 97777-1234", cargo: Cargo.USUARIO, empresaId: EMP } });
  await prisma.configEnvio.deleteMany();
});
beforeEach(async () => {
  agora = new Date("2026-11-23T14:00:00Z");
  await prisma.campanha.deleteMany({ where: { usuarioId: USU } });
  await prisma.lead.deleteMany({ where: { usuarioId: USU } });
  await prisma.whatsappSessao.deleteMany({ where: { id: USU } });
  await prisma.whatsappSessao.create({ data: { id: USU, usuarioId: USU, status: "CONECTADO", primeiraConexaoEm: new Date("2026-09-01") } });
  // Início do período antes do relógio do teste (senão os envios do relógio fixo ficam "fora" do período e o saldo não conta)
  await prisma.empresa.update({ where: { id: EMP }, data: { limiteDisparos: null, janelaInicio: 480, janelaFim: 1200, inicioPeriodo: new Date(agora.getTime() - 86400_000) } });
  wa = new Falso();
  avisos = [];
  motor = new MotorDisparos(wa, log, { pastaArquivos: "/tmp", dormir: async () => {}, agora: () => agora, sorteio: () => 0.5, notificar: async (para, texto) => { avisos.push({ para, texto }); } });
});
after(async () => {
  await prisma.campanha.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.$disconnect();
});

test("envia a fila com nome, saudação e descadastro, e conclui a campanha", async () => {
  const ls = [await lead(1), await lead(2), await lead(3)];
  const c = await campanha(ls);
  const r = await rodar();
  assert.equal(wa.enviados.length, 3);
  assert.match(wa.enviados[0]!.conteudo.texto, /^(Oi|Olá|Bom dia) Lead, tudo bem\?/);
  assert.match(wa.enviados[0]!.conteudo.texto, /responda \*SAIR\*/);
  // Intervalo entre envios dentro do modo Conservador (30 a 60 s)
  const espera = r.find((x) => x.acao === "enviou")!.esperaMs;
  assert.ok(espera >= 30_000 && espera <= 60_000, String(espera));
  assert.equal((await status(c.id)).status, StatusCampanha.CONCLUIDA);
  assert.equal(await prisma.envio.count({ where: { campanhaId: c.id, status: StatusEnvio.ENVIADO } }), 3);
});

test("pula: inativo, pediu para sair, sem WhatsApp, bloqueio 24h e 2 sem resposta em 30 dias", async () => {
  const inativo = await lead(1, { ativo: false });
  const saiu = await lead(2, { status: StatusLead.PEDIU_SAIR, pediuSairEm: agora });
  const semWa = await lead(3);
  const recente = await lead(4);
  const insistido = await lead(5);
  const ok = await lead(6);
  wa.semWhatsapp.add(semWa.telefone);
  // "recente" recebeu há 2 h numa outra campanha; "insistido" recebeu 2 vezes nos últimos 30 dias sem responder
  const antiga = await campanha([], { status: StatusCampanha.CONCLUIDA });
  await prisma.envio.createMany({
    data: [
      { campanhaId: antiga.id, telefone: recente.telefone, status: StatusEnvio.ENVIADO, enviadoEm: new Date(agora.getTime() - 2 * 3600_000) },
      { campanhaId: antiga.id, telefone: insistido.telefone, status: StatusEnvio.ENVIADO, enviadoEm: new Date(agora.getTime() - 10 * 86400_000) },
    ],
  });
  const antiga2 = await campanha([], { status: StatusCampanha.CONCLUIDA });
  await prisma.envio.create({ data: { campanhaId: antiga2.id, telefone: insistido.telefone, status: StatusEnvio.ENVIADO, enviadoEm: new Date(agora.getTime() - 5 * 86400_000) } });

  const c = await campanha([inativo, saiu, semWa, recente, insistido, ok]);
  await rodar();
  const motivos = Object.fromEntries((await prisma.envio.findMany({ where: { campanhaId: c.id } })).map((e) => [e.telefone, `${e.status}:${e.motivo ?? ""}`]));
  assert.equal(motivos[inativo.telefone], "PULADO:Lead inativo");
  assert.equal(motivos[saiu.telefone], "PULADO:Pediu para sair");
  assert.equal(motivos[semWa.telefone], "PULADO:Sem WhatsApp");
  assert.equal(motivos[recente.telefone], "PULADO:Bloqueio 24h");
  assert.equal(motivos[insistido.telefone], "PULADO:2 mensagens sem resposta em 30 dias");
  assert.equal(motivos[ok.telefone], "ENVIADO:");
  assert.equal(wa.enviados.length, 1);
});

test("fora da janela (domingo, feriado, madrugada) não envia e avisa", async () => {
  const c = await campanha([await lead(1)]);
  agora = new Date("2026-11-22T14:00:00Z"); // domingo
  assert.equal((await motor.passo(USU)).motivo, "domingo");
  agora = new Date("2026-11-20T14:00:00Z"); // 20/11 — feriado nacional
  assert.equal((await motor.passo(USU)).motivo, "feriado");
  agora = new Date("2026-11-23T09:00:00Z"); // segunda, 6h em SP
  assert.equal((await motor.passo(USU)).motivo, "fora do horário");
  assert.equal((await status(c.id)).motivo, MOTIVO_JANELA);
  assert.equal(wa.enviados.length, 0);
  agora = new Date("2026-11-23T14:00:00Z");
  await rodar();
  assert.equal(wa.enviados.length, 1);
  assert.equal((await status(c.id)).motivo, null);
});

test("WhatsApp desconectado pausa a campanha, e ela volta sozinha ao reconectar", async () => {
  const c = await campanha([await lead(1)]);
  wa.conectadoAgora = false;
  await motor.passo(USU);
  assert.equal((await status(c.id)).status, StatusCampanha.PAUSADA);
  assert.equal((await status(c.id)).motivo, MOTIVO_DESCONECTADO);
  assert.match(avisos[0]?.texto ?? "", /WhatsApp desconectou/);
  wa.conectadoAgora = true;
  await motor.ciclo();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(wa.enviados.length, 1);
});

test("campanha agendada começa sozinha na hora marcada", async () => {
  const c = await campanha([await lead(1)], { status: StatusCampanha.AGENDADA, agendadaPara: new Date(agora.getTime() + 3600_000), iniciadaEm: null });
  await motor.ciclo();
  assert.equal((await status(c.id)).status, StatusCampanha.AGENDADA);
  agora = new Date(agora.getTime() + 3600_000 + 1000);
  await motor.ciclo();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(wa.enviados.length, 1);
});

test("modo manutenção: nada sai durante a atualização e a campanha continua depois (decisão #103)", async () => {
  const c = await campanha([await lead(1), await lead(2)]);
  await prisma.manutencao.upsert({ where: { id: "geral" }, create: { id: "geral", ligada: true }, update: { ligada: true } });
  limparCacheManutencao();
  try {
    await motor.ciclo();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(wa.enviados.length, 0);
    assert.equal((await status(c.id)).status, StatusCampanha.EM_ANDAMENTO);
  } finally {
    await prisma.manutencao.update({ where: { id: "geral" }, data: { ligada: false } });
    limparCacheManutencao();
  }
  await motor.ciclo();
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(wa.enviados.length, 2);
});

test("aquecimento: número novo envia no máximo 20 por dia", async () => {
  await prisma.whatsappSessao.update({ where: { id: USU }, data: { primeiraConexaoEm: agora } });
  const ls = [];
  for (let i = 1; i <= 22; i++) ls.push(await lead(i));
  const c = await campanha(ls);
  const r = await rodar(100);
  assert.equal(wa.enviados.length, 20);
  assert.equal(r.at(-1)!.motivo, "limite diário");
  // Não pausa (decisão #70): continua em andamento e avisa pelo WhatsApp da plataforma, uma vez só
  const s = await status(c.id);
  assert.equal(s.status, StatusCampanha.EM_ANDAMENTO);
  assert.match(s.motivo ?? "", /Limite diário/);
  await motor.passo(USU);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.para, "5511977771234");
  assert.match(avisos[0]!.texto, /limite de 20 envios de hoje/);
  // No dia seguinte (terça) volta a enviar sozinha
  agora = new Date("2026-11-24T14:00:00Z");
  await prisma.whatsappSessao.update({ where: { id: USU }, data: { primeiraConexaoEm: new Date("2026-11-23T10:00:00Z") } });
  await rodar();
  assert.equal(wa.enviados.length, 22);
});

test("5 falhas seguidas pausam a campanha", async () => {
  const ls = [];
  for (let i = 1; i <= 6; i++) ls.push(await lead(i));
  const c = await campanha(ls);
  wa.falhar = true;
  for (let i = 0; i < 5; i++) await motor.passo(USU);
  const s = await status(c.id);
  assert.equal(s.status, StatusCampanha.PAUSADA);
  assert.match(s.motivo ?? "", /5 falhas seguidas/);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!.texto, /foi pausada\. 5 falhas seguidas/);
});

test("mais de 30% sem WhatsApp pausa a campanha", async () => {
  const ls = [];
  for (let i = 1; i <= 25; i++) ls.push(await lead(i));
  ls.slice(0, 8).forEach((l) => wa.semWhatsapp.add(l.telefone));
  const c = await campanha(ls);
  // os 8 primeiros sem WhatsApp, depois envia; ao chegar em 20 processados (8/20 = 40%) pausa
  for (let i = 0; i < 40; i++) { const p = await motor.passo(USU); if (p.acao === "nada") break; if ((await status(c.id)).status !== StatusCampanha.EM_ANDAMENTO) break; }
  const s = await status(c.id);
  assert.equal(s.status, StatusCampanha.PAUSADA);
  assert.match(s.motivo ?? "", /não têm WhatsApp/);
});

test("pausa maior entre blocos de tamanho variável", async () => {
  const ls = [];
  for (let i = 1; i <= 52; i++) ls.push(await lead(i));
  await prisma.whatsappSessao.update({ where: { id: USU }, data: { primeiraConexaoEm: new Date("2026-01-01") } });
  await campanha(ls, { modo: "CONSERVADOR" });
  const esperas = [];
  // o relógio anda 2 min por envio (assim não bate o limite por hora)
  for (let i = 0; i < 52; i++) { esperas.push((await motor.passo(USU)).esperaMs); agora = new Date(agora.getTime() + 120_000); }
  // sorteio 0,5 → bloco de 50 mensagens; a 50ª espera 10 minutos
  assert.equal(esperas[49], 10 * 60_000);
  assert.ok(esperas.slice(0, 49).every((e) => e < 60_001));
});

test("limite de disparos do teste grátis", async () => {
  await prisma.empresa.update({ where: { id: EMP }, data: { limiteDisparos: 2 } });
  const c = await campanha([await lead(1), await lead(2), await lead(3)]);
  await rodar();
  assert.equal(wa.enviados.length, 2);
  const s = await status(c.id);
  assert.equal(s.status, StatusCampanha.PAUSADA);
  assert.match(s.motivo ?? "", /^Disparos do período acabaram/);
});

test("resposta do lead: SAIR marca 'Pediu para sair'; outra resposta vira 'Em conversa'; ambos saem da fila", async () => {
  const a = await lead(1), b = await lead(2), x = await lead(3);
  const c = await campanha([x, a, b]);
  await motor.passo(USU); // envia para x
  await motor.registrarResposta(USU, a.telefone, "  sair ");
  await motor.registrarResposta(USU, b.telefone, "Quero saber o preço");
  const la = await prisma.lead.findUniqueOrThrow({ where: { id: a.id } });
  const lb = await prisma.lead.findUniqueOrThrow({ where: { id: b.id } });
  assert.equal(la.status, StatusLead.PEDIU_SAIR);
  assert.ok(la.pediuSairEm);
  assert.equal(lb.status, StatusLead.EM_CONVERSA);
  assert.ok(lb.ultimaRespostaEm);
  const env = Object.fromEntries((await prisma.envio.findMany({ where: { campanhaId: c.id } })).map((e) => [e.telefone, `${e.status}:${e.motivo ?? ""}`]));
  assert.equal(env[a.telefone], "PULADO:Pediu para sair");
  assert.equal(env[b.telefone], "PULADO:Respondeu");
});

test("anexo vai junto, com o texto como legenda", async () => {
  const arq = await prisma.arquivo.create({ data: { usuarioId: USU, nome: "oferta.png", tipo: "image/png", tamanho: 10 } });
  await campanha([await lead(1)], { arquivoId: arq.id });
  await rodar();
  assert.equal(wa.enviados[0]!.conteudo.anexo?.tipo, "image/png");
  assert.equal(wa.enviados[0]!.conteudo.anexo?.caminho, `/tmp/${arq.id}`);
  assert.match(wa.enviados[0]!.conteudo.texto, /tudo bem\?/);
});

test("randomização usa as variações; pausa/cancelamento na tela valem na hora", async () => {
  const ls = [await lead(1), await lead(2)];
  const c = await campanha(ls, { randomizar: true, mensagem: "Principal {nome}", variacoes: ["Variação A {nome}", "", "Variação C {nome}"] });
  motor = new MotorDisparos(wa, log, { pastaArquivos: "/tmp", dormir: async () => {}, agora: () => agora, sorteio: () => 0.99 });
  await motor.passo(USU);
  assert.match(wa.enviados[0]!.conteudo.texto, /^Variação C Lead/);
  await prisma.campanha.update({ where: { id: c.id }, data: { status: StatusCampanha.PAUSADA } });
  assert.equal((await motor.passo(USU)).acao, "nada");
  assert.equal(wa.enviados.length, 1);
});

test("avisos: padrão 1 por dia de cada tipo; com 'avisar sempre', cada problema avisa (decisão #71)", async () => {
  const ls = [];
  for (let i = 1; i <= 12; i++) ls.push(await lead(i));
  // Padrão: duas pausas por falhas no mesmo dia → 1 aviso
  const c1 = await campanha(ls.slice(0, 10));
  wa.falhar = true;
  for (let i = 0; i < 5; i++) await motor.passo(USU);
  await prisma.campanha.update({ where: { id: c1.id }, data: { status: StatusCampanha.EM_ANDAMENTO } });
  for (let i = 0; i < 5; i++) await motor.passo(USU);
  assert.equal((await status(c1.id)).status, StatusCampanha.PAUSADA);
  assert.equal(avisos.length, 1);
  // "Avisar sempre": cada pausa gera aviso
  await prisma.campanha.delete({ where: { id: c1.id } });
  const c2 = await campanha(ls, { avisarSempre: true });
  for (let i = 0; i < 5; i++) await motor.passo(USU);
  agora = new Date(agora.getTime() + 60_000);
  await prisma.campanha.update({ where: { id: c2.id }, data: { status: StatusCampanha.EM_ANDAMENTO } });
  for (let i = 0; i < 5; i++) await motor.passo(USU);
  assert.equal(avisos.length, 3);
});

// ===== Conta sem acesso (decisão #158 — S2c do Módulo 1) =====
const semAcesso = {
  "plano vencido": async () => { await prisma.empresa.update({ where: { id: EMP }, data: { expiraEm: new Date("2026-11-01") } }); },
  "empresa inativa": async () => { await prisma.empresa.update({ where: { id: EMP }, data: { ativa: false } }); },
  "usuário bloqueado": async () => { await prisma.usuario.update({ where: { id: USU }, data: { status: "BLOQUEADO" } }); },
} as const;
const comAcesso = async () => {
  await prisma.empresa.update({ where: { id: EMP }, data: { expiraEm: new Date("2030-01-01"), ativa: true } });
  await prisma.usuario.update({ where: { id: USU }, data: { status: "ATIVO" } });
};

for (const [nome, barrar] of Object.entries(semAcesso)) {
  test(`conta sem acesso (${nome}): campanha pausa sem enviar nem avisar, e volta sozinha com o acesso`, async () => {
    const c = await campanha([await lead(1), await lead(2)]);
    await barrar();
    const r = await motor.passo(USU);
    assert.equal(r.acao, "nada");
    assert.equal((await status(c.id)).status, StatusCampanha.PAUSADA);
    assert.equal((await status(c.id)).motivo, MOTIVO_CONTA);
    assert.equal(wa.enviados.length, 0);
    assert.equal(avisos.length, 0, "conta barrada não recebe aviso");
    // Ainda barrada: o ciclo não retoma
    await motor.ciclo();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await status(c.id)).status, StatusCampanha.PAUSADA);
    assert.equal(wa.enviados.length, 0);
    // Acesso de volta (renovou / ativou / desbloqueou): volta sozinha
    await comAcesso();
    await motor.ciclo();
    await new Promise((r) => setTimeout(r, 400));
    assert.ok(wa.enviados.length >= 1, "voltou a enviar");
    assert.notEqual((await status(c.id)).motivo, MOTIVO_CONTA);
  });
}

test("conta sem acesso: regra pura (Super Admin nunca é barrado; sem empresa = barrado)", () => {
  const agora0 = new Date("2026-11-23T14:00:00Z");
  const ok = { ativa: true, expiraEm: new Date("2027-01-01") };
  assert.equal(motivoContaSemAcesso({ cargo: "USUARIO", status: "ATIVO", empresa: ok }, agora0), null);
  assert.equal(motivoContaSemAcesso({ cargo: "USUARIO", status: "BLOQUEADO", empresa: ok }, agora0), "bloqueado");
  assert.equal(motivoContaSemAcesso({ cargo: "USUARIO", status: "ATIVO", empresa: { ativa: true, expiraEm: new Date("2026-11-01") } }, agora0), "expirado");
  assert.equal(motivoContaSemAcesso({ cargo: "USUARIO", status: "ATIVO", empresa: { ativa: false, expiraEm: new Date("2027-01-01") } }, agora0), "inativa");
  assert.equal(motivoContaSemAcesso({ cargo: "USUARIO", status: "ATIVO", empresa: null }, agora0), "bloqueado");
  assert.equal(motivoContaSemAcesso({ cargo: "SUPERADMIN", status: "ATIVO", empresa: null }, agora0), null);
  assert.equal(motivoContaSemAcesso({ cargo: "SUPERADMIN", status: "BLOQUEADO", empresa: null }, agora0), "bloqueado");
});
