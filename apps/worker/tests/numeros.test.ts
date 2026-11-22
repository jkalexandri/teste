// Testes da etapa 10c (decisões #79 e #95): vários WhatsApps por usuário — rodízio, limites por número,
// número que cai, número bloqueado e conversa pelo número que recebeu. WhatsApp falso, IA "simulado" e banco real.
// Rodar: DATABASE_URL=... pnpm --filter worker test
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, Cargo, Modulo, StatusCampanha, StatusEnvio } from "@filapro/db";
import { MotorDisparos, type Conteudo, type Remetente } from "../src/disparos.js";
import { Atendente } from "../src/conversas.js";

const EMP = "teste-num-emp", USU = "teste-num-usu", EXTRA = "teste-num-extra", EXTRA2 = "teste-num-extra2";
const log = pino({ level: "silent" });
let agora = new Date("2026-11-23T14:00:00Z"); // segunda, 11h em São Paulo

class Falso implements Remetente {
  ligados = new Set<string>([USU, EXTRA]);
  enviados: { sessao: string; jid: string; conteudo: Conteudo }[] = [];
  conectado(id: string) { return this.ligados.has(id); }
  async verificarNumero(_s: string, tel: string) { return `${tel}@s.whatsapp.net`; }
  async digitando() {}
  async enviar(sessao: string, jid: string, conteudo: Conteudo) { this.enviados.push({ sessao, jid, conteudo }); }
}

let wa: Falso, motor: MotorDisparos, avisos: string[];
let configAntes: Awaited<ReturnType<typeof prisma.configIA.findUnique>> = null;

async function leads(n: number) {
  const r = [];
  for (let i = 0; i < n; i++) {
    r.push(await prisma.lead.create({ data: { codigo: `TN${i}`, nome: `Lead ${i}`, telefone: `55119911${String(i).padStart(5, "0")}`, usuarioId: USU, empresaId: EMP, codigoUsuario: "x" } }));
  }
  return r;
}
async function campanha(ls: { id: string; telefone: string; nome: string }[], sessoes: string[]) {
  const c = await prisma.campanha.create({ data: { usuarioId: USU, empresaId: EMP, assunto: "Rodízio", mensagem: "Oi {nome}", status: StatusCampanha.EM_ANDAMENTO, iniciadaEm: agora, totalLeads: ls.length, randomizar: false, sessoes } });
  await prisma.envio.createMany({ data: ls.map((l, i) => ({ campanhaId: c.id, leadId: l.id, telefone: l.telefone, nome: l.nome, ordem: i })) });
  return c;
}
async function rodar(limite = 50) {
  for (let i = 0; i < limite; i++) {
    const p = await motor.passo(USU);
    if (p.acao === "nada" || (p.acao === "aguardar" && p.esperaMs > 0)) return p;
  }
  return null;
}

before(async () => {
  configAntes = await prisma.configIA.findUnique({ where: { tarefa: "conversar" } });
  const d = { provedor: "simulado", modelo: "simulado", urlBase: "", chave: null, precoEntrada: 0, precoSaida: 0 };
  await prisma.configIA.upsert({ where: { tarefa: "conversar" }, update: d, create: { tarefa: "conversar", ...d } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.create({ data: { id: EMP, codigo: "99902", nome: "Conta Números", modulo: Modulo.INDIVIDUAL, pacote: "Teste", limiteUsuarios: 1, expiraEm: new Date("2030-01-01"), whatsappsExtras: 2 } });
  await prisma.usuario.create({ data: { id: USU, codigo: "99902", nome: "Nina", email: "nina@num.local", whatsapp: "(11) 97777-0002", cargo: Cargo.USUARIO, empresaId: EMP } });
  await prisma.configEnvio.deleteMany();
});
beforeEach(async () => {
  agora = new Date("2026-11-23T14:00:00Z");
  await prisma.campanha.deleteMany({ where: { usuarioId: USU } });
  await prisma.lead.deleteMany({ where: { usuarioId: USU } });
  await prisma.whatsappSessao.deleteMany({ where: { usuarioId: USU } });
  const antigo = new Date("2026-09-01");
  await prisma.whatsappSessao.createMany({ data: [
    { id: USU, usuarioId: USU, status: "CONECTADO", primeiraConexaoEm: antigo, numero: "5511900000001" },
    { id: EXTRA, usuarioId: USU, status: "CONECTADO", primeiraConexaoEm: antigo, numero: "5511900000002", apelido: "Vendas 2", ordem: 1 },
    { id: EXTRA2, usuarioId: USU, status: "DESCONECTADO", primeiraConexaoEm: antigo, numero: "5511900000003", ordem: 2, bloqueada: true },
  ] });
  wa = new Falso();
  avisos = [];
  motor = new MotorDisparos(wa, log, { pastaArquivos: "/tmp", dormir: async () => {}, agora: () => agora, sorteio: () => 0.5, notificar: async (_p, t) => { avisos.push(t); } });
});
after(async () => {
  await prisma.campanha.deleteMany({ where: { usuarioId: USU } });
  await prisma.usuario.deleteMany({ where: { id: USU } });
  await prisma.empresa.deleteMany({ where: { id: EMP } });
  if (configAntes) { const { tarefa, ...r } = configAntes; await prisma.configIA.update({ where: { tarefa }, data: r }); }
  else await prisma.configIA.deleteMany({ where: { tarefa: "conversar" } });
  await prisma.$disconnect();
});

test("rodízio: os envios alternam entre os números escolhidos e cada envio guarda o número", async () => {
  const c = await campanha(await leads(4), [USU, EXTRA]);
  await rodar();
  assert.deepEqual(wa.enviados.map((e) => e.sessao), [USU, EXTRA, USU, EXTRA]);
  const envios = await prisma.envio.findMany({ where: { campanhaId: c.id }, orderBy: { ordem: "asc" } });
  assert.deepEqual(envios.map((e) => e.sessaoId), [USU, EXTRA, USU, EXTRA]);
  assert.equal((await prisma.campanha.findUniqueOrThrow({ where: { id: c.id } })).status, StatusCampanha.CONCLUIDA);
});

test("número bloqueado (saiu na renovação) não é usado", async () => {
  wa.ligados.add(EXTRA2);
  await campanha(await leads(3), [USU, EXTRA2]);
  await rodar();
  assert.deepEqual(wa.enviados.map((e) => e.sessao), [USU, USU, USU]);
});

test("um número cai: a campanha continua pelos outros e avisa; todos caem: pausa", async () => {
  wa.ligados.delete(EXTRA);
  const c = await campanha(await leads(2), [USU, EXTRA]);
  await rodar();
  assert.deepEqual(wa.enviados.map((e) => e.sessao), [USU, USU]);
  assert.ok(avisos.some((a) => /"Vendas 2" está desconectado.*continua pelos outros/.test(a)), avisos.join(" | "));
  assert.equal((await prisma.campanha.findUniqueOrThrow({ where: { id: c.id } })).status, StatusCampanha.CONCLUIDA);

  wa.ligados.clear();
  const c2 = await campanha(await prisma.lead.findMany({ where: { usuarioId: USU } }), [USU, EXTRA]);
  await rodar();
  assert.equal((await prisma.campanha.findUniqueOrThrow({ where: { id: c2.id } })).status, StatusCampanha.PAUSADA);
  wa.ligados.add(EXTRA);
  await motor.ciclo();
  motor.parar();
  assert.equal((await prisma.campanha.findUniqueOrThrow({ where: { id: c2.id } })).status, StatusCampanha.EM_ANDAMENTO, "volta quando um dos números reconecta");
});

test("limites por número: o número novo no aquecimento para no limite e o outro continua", async () => {
  await prisma.whatsappSessao.update({ where: { id: EXTRA }, data: { primeiraConexaoEm: new Date(agora.getTime() - 86400_000) } });
  // O extra já enviou 20 hoje (limite de número com menos de 3 dias)
  const antiga = await prisma.campanha.create({ data: { usuarioId: USU, assunto: "antiga", mensagem: "x", status: StatusCampanha.CONCLUIDA } });
  await prisma.envio.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ campanhaId: antiga.id, telefone: `5511800000${String(i).padStart(3, "0")}`, nome: "", ordem: i, status: StatusEnvio.ENVIADO, enviadoEm: new Date(agora.getTime() - 3600_000 * 2), sessaoId: EXTRA })) });
  await campanha(await leads(3), [USU, EXTRA]);
  await rodar();
  assert.deepEqual(wa.enviados.map((e) => e.sessao), [USU, USU, USU]);
});

test("conversa: responde pelo número que recebeu; se ele cair, pelo principal", async () => {
  const [l] = await leads(1);
  const at = new Atendente(wa, log, { pastaArquivos: "/tmp", esperaMs: () => 0, agora: () => agora });
  await at.receber(EXTRA, USU, l!.telefone, { texto: "Oi, quero saber mais", tipo: "texto" });
  for (let i = 0; i < 100 && at.pendentes(); i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(wa.enviados.at(-1)!.sessao, EXTRA);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: l!.id } });
  assert.equal(lead.sessaoId, EXTRA);
  const m = await prisma.mensagem.findMany({ where: { leadId: l!.id }, orderBy: { criadoEm: "asc" } });
  assert.deepEqual(m.map((x) => x.sessaoId), [EXTRA, EXTRA]);
  wa.ligados.delete(EXTRA);
  const r = await at.enviarManual(l!.id, USU, "Oi, aqui é a Nina");
  assert.equal(r.ok, true);
  assert.equal(wa.enviados.at(-1)!.sessao, USU);
});
