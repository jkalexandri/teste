// Testes vigia da porta única de cada número e do serviço único (decisão #133 — falhas C2 e A1 da auditoria do Módulo 4).
// Sem os servidores do WhatsApp: a conexão é um "socket" falso que só emite os avisos que o teste mandar.
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import pino from "pino";
import { prisma } from "@filapro/db";
import { GerenciadorSessoes } from "../src/sessoes.js";
import { ERRO_OUTRO_LUGAR } from "../src/queda.js";
import { Instancia } from "../src/instancia.js";
import { Porteiro } from "../src/porteiro.js";
import { prioridadeDeAbertura } from "../src/sessoes.js";
import { chaveDoNumero, registrarNumerosRepetidos } from "../src/numero-unico.js";

const ID = "tst-ses-1";
const ORFA = "tst-ses-orfa";
const BLQ = "tst-ses-blq";
const ID2 = "tst-ses-2";
const M5 = ["tst-m5-plat", "tst-m5-a", "tst-m5-b", "tst-m5-c"];
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Espera até a condição valer (o banco grava em segundo plano), no máximo 3 s. */
async function ate(cond: () => boolean | Promise<boolean>, ms = 6000) { for (let i = 0; i < ms / 20; i++) { if (await cond()) return true; await espera(20); } return false; }
const status = async () => (await prisma.whatsappSessao.findUnique({ where: { id: ID } }))?.status;

/** Conexão falsa do WhatsApp: guarda os avisos e deixa o teste disparar "close"/"open". */
class SocketFalso {
  ev = new EventEmitter();
  user: { id: string } | undefined;
  fechada = false;
  async logout() { this.fechada = true; }
  end() { this.fechada = true; }
  atualizarLogin() { this.ev.emit("creds.update", {}); }
  cair(codigo: number) { this.ev.emit("connection.update", { connection: "close", lastDisconnect: { error: { output: { statusCode: codigo } } } }); }
  qr() { this.ev.emit("connection.update", { qr: "qr-teste" }); }
  abrir(numero = "5511900001111") { this.user = { id: `${numero}:1@s.whatsapp.net` }; this.ev.emit("connection.update", { connection: "open" }); }
}

/** Falhas simuladas (decisão #144 — M1): erro ao ler o login e erro ao apagar o login */
let falharAuth: unknown = null;
let falharApagar = false;
/** B4: quantas gravações do login devem falhar, e quantas vezes tentou gravar */
let falharSalvar = 0;
let salvarChamadas = 0;
let sockets: SocketFalso[] = [];
let apagados: string[] = [];
let g: GerenciadorSessoes;

/** Cada abertura (usarAuth) com a hora: para conferir o ritmo do porteiro (decisão #154) */
let aberturas: { id: string; t: number }[] = [];

function novoGerenciador(extra: { porteiro?: Porteiro } = {}) {
  return new GerenciadorSessoes(randomBytes(32), pino({ level: "silent" }), {
    versao: [2, 3000, 1],
    // Nos testes antigos: sem espera no porteiro e sem variação no intervalo (tempos exatos)
    porteiro: extra.porteiro ?? new Porteiro({ concorrencia: 99, intervaloMs: 0 }),
    aleatorio: () => 0.5,
    // Sem limite de frequência e com espera curta para guardar o login (decisão #155): os testes antigos usam o tempo exato
    intervaloConectarMs: 0, intervaloTentarAgoraMs: 0, esperaSalvarMs: 5,
    criarSocket: () => { const s = new SocketFalso(); sockets.push(s); return s as never; },
    // Login falso "já pareado" (o celular já leu o QR antes)
    usarAuth: async (idAtual: string) => { aberturas.push({ id: idAtual, t: Date.now() }); if (falharAuth) throw falharAuth; return ({
      state: { creds: { me: { id: "5511900001111:1@s.whatsapp.net" } } as never, keys: { get: async () => ({}), set: async () => undefined } as never },
      // Como o real: só grava se o registro existir (decisão #138)
      salvarCreds: async () => { salvarChamadas++; if (falharSalvar > 0) { falharSalvar--; throw new Error("banco fora do ar"); } return (await prisma.whatsappSessao.count({ where: { id: idAtual } })) > 0; },
    }); },
    apagarAuth: async (id: string) => { if (falharApagar) throw new Error("banco fora do ar"); apagados.push(id); },
  });
}

beforeEach(async () => {
  sockets = [];
  apagados = [];
  aberturas = [];
  falharAuth = null; falharApagar = false; falharSalvar = 0; salvarChamadas = 0;
  g?.encerrarTudo();
  g = novoGerenciador();
  await prisma.whatsappSessao.deleteMany({ where: { id: { in: [ID, ID2, ORFA, BLQ, ...M5] } } });
});

after(async () => {
  g?.encerrarTudo();
  await prisma.whatsappSessao.deleteMany({ where: { id: { in: [ID, ID2, ORFA, BLQ, ...M5] } } });
  await prisma.servicoInstancia.deleteMany({ where: { id: "teste-servico" } });
  await prisma.$disconnect();
});

test("cancelar durante a espera da reconexão: nada reabre depois (sem QR fantasma)", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(() => g.reconexaoAgendada(ID))); // queda comum: reconexão agendada para daqui a 2 s
  assert.equal(g.reconexaoAgendada(ID), true);
  await g.desconectar(ID);
  assert.equal(g.reconexaoAgendada(ID), false, "Cancelar desliga o relógio");
  await espera(2300);
  assert.equal(sockets.length, 1, "nenhuma conexão nova depois de cancelar");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).status, "DESCONECTADO");
});

test("conectar durante a espera vira 'tentar agora': uma conexão só, sem duplicar", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(() => g.reconexaoAgendada(ID)));
  await g.conectar(ID);
  assert.equal(sockets.length, 2, "reconectou na hora");
  assert.equal(g.reconexaoAgendada(ID), false);
  await espera(2300);
  assert.equal(sockets.length, 2, "o relógio antigo não abriu uma 3ª conexão");
});

test("conectar duas vezes ao mesmo tempo abre uma conexão só", async () => {
  await Promise.all([g.conectar(ID), g.conectar(ID), g.conectar(ID)]);
  assert.equal(sockets.length, 1);
});

test("aviso atrasado de uma conexão antiga não derruba a conexão nova", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(() => g.reconexaoAgendada(ID)));
  await g.conectar(ID);
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); await espera(150); // "close" repetido da conexão antiga
  assert.equal(g.conectado(ID), true, "a conexão nova continua");
  assert.equal(g.reconexaoAgendada(ID), false, "nenhuma reconexão por causa da conexão antiga");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).status, "CONECTADO");
});

test("'aberto em outro lugar' (440) encerra SEM apagar o login; desconectado pelo celular (401) apaga", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(440); assert.ok(await ate(async () => (await status()) === "DESCONECTADO"));
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "DESCONECTADO");
  assert.equal(s.erro, ERRO_OUTRO_LUGAR);
  assert.deepEqual(apagados, [], "o login continua salvo");
  assert.equal(g.reconexaoAgendada(ID), false, "não fica disputando em loop");
  // Conectar volta (com o login salvo, sem QR)
  await g.conectar(ID);
  assert.equal(sockets.length, 2);
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[1]!.cair(401);
  assert.ok(await ate(() => apagados.length === 1));
  assert.deepEqual(apagados, [ID]);
});

test("serviço único: o 2º não assume enquanto o 1º está no ar; assume quando ele libera ou para de confirmar", async () => {
  await prisma.servicoInstancia.deleteMany({ where: { id: "teste-servico" } });
  const log = pino({ level: "silent" });
  const a = new Instancia(log, { registro: "teste-servico" }), b = new Instancia(log, { registro: "teste-servico" });
  assert.equal(await a.tentarAssumir(), true, "1º serviço assume");
  assert.equal(await a.tentarAssumir(), true, "e confirma");
  assert.equal(await b.tentarAssumir(), false, "2º recusa enquanto o 1º confirma");
  // O 1º travou sem confirmar por mais de 60 s: o 2º assume
  assert.equal(await b.tentarAssumir(new Date(Date.now() + 61_000)), true);
  assert.equal(await a.tentarAssumir(), false, "o 1º percebe que perdeu (e para)");
  // Desligamento normal libera na hora
  await b.liberar();
  assert.equal(await a.tentarAssumir(), true);
  await a.liberar();
});

test("registro apagado com a conexão aberta (usuário excluído): encerra e NÃO recria (decisão #138)", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await prisma.whatsappSessao.delete({ where: { id: ID } }); // o site apagou junto com o usuário
  sockets[0]!.atualizarLogin(); // o WhatsApp atualiza o login: antes isso recriava o registro
  assert.ok(await ate(() => sockets[0]!.fechada), "a conexão foi encerrada (saiu do WhatsApp)");
  assert.ok(await ate(() => apagados.includes(ID)), "o login foi apagado");
  await espera(200);
  assert.equal(await prisma.whatsappSessao.count({ where: { id: ID } }), 0, "o registro não voltou");
  assert.equal(g.conectado(ID), false);
});

test("ao ligar, número sem dono não volta a funcionar: conecta só para sair e é apagado (decisão #138)", async () => {
  await prisma.whatsappSessao.create({ data: { id: ORFA, usuarioId: null, creds: "v1:x:y:z" } });
  await g.iniciarTodas();
  const s = sockets.find((x) => x) ; // a conexão aberta para sair
  assert.ok(s, "abriu a conexão para fazer a saída");
  // o falso aceita qualquer id: acha a conexão do número sem dono
  for (const k of sockets) k.abrir();
  assert.ok(await ate(async () => (await prisma.whatsappSessao.count({ where: { id: ORFA } })) === 0), "registro sem dono apagado");
  assert.ok(apagados.includes(ORFA), "login apagado");
  assert.equal(g.conectado(ORFA), false);
});

test("queda comum: grava 'Reconectando' com quando caiu, tentativa e próxima; ao voltar, limpa (decisão #139)", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const antes = Date.now();
  sockets[0]!.cair(428);
  assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.tentativaReconexao, 1);
  assert.ok(s.quedaEm && s.quedaEm.getTime() >= antes - 1000, "quando caiu");
  assert.ok(s.proximaTentativaEm && s.proximaTentativaEm.getTime() > Date.now(), "próxima tentativa no futuro");
  // "Tentar agora" (Conectar) reconecta na hora; ao abrir, os dados da queda são limpos
  await g.conectar(ID);
  sockets[1]!.abrir();
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const d = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(d.quedaEm, null); assert.equal(d.tentativaReconexao, 0); assert.equal(d.proximaTentativaEm, null);
});

test("ao ligar, número bloqueado (saiu do plano) com login salvo sai do WhatsApp; o registro e as conversas ficam (decisão #140)", async () => {
  const dono = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.create({ data: { id: BLQ, usuarioId: dono, bloqueada: true, creds: "v1:x:y:z", status: "CONECTADO" } });
  await g.iniciarTodas();
  for (const k of sockets) k.abrir();
  assert.ok(await ate(() => apagados.includes(BLQ)), "login apagado");
  const s = await prisma.whatsappSessao.findUnique({ where: { id: BLQ } });
  assert.ok(s, "o registro continua (conversas e apelido guardados)");
  assert.equal(s!.bloqueada, true);
  assert.equal(s!.status, "DESCONECTADO");
  assert.equal(g.conectado(BLQ), false);
});

test("o serviço recusa conectar número bloqueado, venha o pedido de onde vier (decisão #140)", async () => {
  const dono = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.create({ data: { id: BLQ, usuarioId: dono, bloqueada: true } });
  await g.conectar(BLQ);
  assert.equal(sockets.length, 0, "nenhuma conexão aberta");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: BLQ } })).status, "DESCONECTADO");
});

test("aquecimento por chip: o mesmo chip mantém a idade; chip diferente ou sem como comparar recomeça (decisão #141)", async () => {
  const antigo = new Date("2026-10-01T12:00:00Z");
  const idade = async () => (await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).primeiraConexaoEm!.getTime();
  // 1) Mesmo chip reconectado: mantém
  await prisma.whatsappSessao.create({ data: { id: ID, primeiraConexaoEm: antigo, numeroAquecimento: "5511900001111" } });
  await g.conectar(ID);
  sockets[0]!.abrir("5511900001111"); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await espera(150);
  assert.equal(await idade(), antigo.getTime(), "mesmo chip continua com a idade");
  // 2) Outro chip no mesmo espaço: recomeça e registra nos Logs
  await g.desconectar(ID);
  await g.conectar(ID);
  sockets[1]!.abrir("5511977772222");
  assert.ok(await ate(async () => (await idade()) > Date.now() - 60_000), "chip novo recomeça o aquecimento");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).numeroAquecimento, "5511977772222");
  assert.ok(await ate(async () => (await prisma.log.count({ where: { texto: { contains: "+5511977772222): aquecimento recomeça" } } })) > 0), "fica nos Logs");
  // 3) Espaço de antes da regra (sem número para comparar): recomeça por segurança
  await g.desconectar(ID);
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { primeiraConexaoEm: antigo, numeroAquecimento: null } });
  await g.conectar(ID);
  sockets[2]!.abrir("5511977772222");
  assert.ok(await ate(async () => (await idade()) > Date.now() - 60_000), "sem como comparar: recomeça");
  await prisma.log.deleteMany({ where: { texto: { contains: "aquecimento recomeça" } } });
});

test("aviso de queda (decisão #142): ao voltar chama o aviso 'voltou' e limpa as marcas; desconexão de vez avisa na hora com o motivo", async () => {
  const voltas: string[] = [];
  const desconexoes: string[] = [];
  g.aoVoltar = async (s) => { voltas.push(s.id); };
  g.aoDesconectarDeVez = async (s, motivo) => { desconexoes.push(`${s.id}|${motivo}`); };
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z", avisoQuedaEm: new Date(), avisoProblemaEm: new Date() } }); // com login salvo, como em produção
  await g.conectar(ID); // tentar agora
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  assert.ok(await ate(() => voltas.length === 1), "avisou que voltou");
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.avisoQuedaEm, null); assert.equal(s.avisoProblemaEm, null);
  // Queda comum que volta sem ter avisado: não chama "voltou"
  sockets[1]!.cair(428); assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  await g.conectar(ID); sockets[2]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await espera(100);
  assert.equal(voltas.length, 1, "queda sem aviso não gera 'voltou'");
  // Desconectado pelo celular (401): avisa na hora
  sockets[2]!.cair(401);
  assert.ok(await ate(() => desconexoes.length === 1));
  assert.match(desconexoes[0]!, /^tst-ses-1\|O WhatsApp foi desconectado pelo celular/);
  // Cancelar pelo usuário NÃO avisa
  await g.conectar(ID); sockets[3]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await g.desconectar(ID);
  await espera(100);
  assert.equal(desconexoes.length, 1);
});

// ===== M1 (decisão #144): falha ao ABRIR a conexão não deixa o número parado =====
const BANCO_FORA = Object.assign(new Error("Can't reach database server"), { code: "P1001" });
const logsDe = async (trecho: string) => prisma.log.count({ where: { tipo: "WHATSAPP", texto: { contains: trecho } } });

test("M1: falha ao reabrir (banco fora do ar) agenda nova tentativa, mostra o motivo e volta sozinho quando o problema passa", async () => {
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z" } }); // login salvo, como depois de ler o QR
  falharAuth = BANCO_FORA;
  sockets[0]!.cair(428); // reconexão em 2 s — vai falhar ao ler o login
  assert.ok(await ate(async () => (await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).erro === "Banco de dados indisponível.", 4000), "motivo curto na tela");
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO");
  assert.equal(s.tentativaReconexao, 2);
  assert.ok(s.proximaTentativaEm && s.proximaTentativaEm.getTime() > Date.now(), "próxima tentativa marcada");
  assert.equal(g.reconexaoAgendada(ID), true, "NÃO fica parado: há nova tentativa agendada");
  assert.equal(await logsDe("Falha ao reabrir o WhatsApp (Banco de dados indisponível); tentando de novo sozinho"), 1, "1ª falha nos Logs");
  // O problema passa: a próxima tentativa abre a conexão e o número volta sozinho
  falharAuth = null;
  assert.ok(await ate(() => sockets.length === 2, 6000), "reabriu sozinho");
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const d = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(d.erro, null); assert.equal(d.quedaEm, null);
  // Uma linha só na volta (decisão #153): quando caiu, o motivo, quanto ficou fora e a falha ao reabrir (decisão #144)
  assert.ok(await ate(async () => (await logsDe("1 falha ao reabrir")) === 1), "recuperação nos Logs");
  await prisma.log.deleteMany({ where: { texto: { contains: "1 falha ao reabrir" } } });
});

test("M1: falhas repetidas vão para os Logs só uma vez; o recuo cresce e a tentativa não para", async () => {
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
  await prisma.whatsappSessao.create({ data: { id: ID, creds: "v1:x:y:z", status: "CONECTADO" } });
  falharAuth = BANCO_FORA;
  await g.conectar(ID); // "Tentar agora" com o banco ainda fora
  const um = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(um.status, "RECONECTANDO"); assert.equal(um.tentativaReconexao, 1);
  await g.conectar(ID); // outra vez
  const dois = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(dois.tentativaReconexao, 1, "'Tentar agora' recomeça o recuo");
  assert.equal(g.reconexaoAgendada(ID), true);
  assert.equal(await logsDe("Falha ao reabrir o WhatsApp"), 1, "só a 1ª falha da sequência");
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: login que não descriptografa NÃO é apagado; continua tentando e mostra o motivo", async () => {
  await prisma.whatsappSessao.create({ data: { id: ID, creds: "v1:x:y:z", status: "CONECTADO" } });
  falharAuth = new Error("Formato criptografado inválido");
  await g.conectar(ID);
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO");
  assert.equal(s.erro, "Não foi possível ler o login salvo.");
  assert.equal(s.creds, "v1:x:y:z", "o login continua guardado");
  assert.deepEqual(apagados, [], "nada foi apagado");
  assert.equal(g.reconexaoAgendada(ID), true);
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: primeira conexão (sem login) que falha ao abrir avisa e para, sem tentar sozinha", async () => {
  falharAuth = BANCO_FORA;
  await g.conectar(ID);
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "DESCONECTADO");
  assert.equal(s.erro, "Não foi possível conectar agora. Tente de novo em instantes.");
  assert.equal(g.reconexaoAgendada(ID), false);
});

test("M1: ao ligar o serviço, número que falha ao abrir fica reconectando (sem derrubar os outros)", async () => {
  const dono = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: dono, creds: "v1:x:y:z", status: "CONECTADO" } });
  falharAuth = BANCO_FORA;
  await g.iniciarTodas(); // não pode lançar erro
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO"); assert.equal(g.reconexaoAgendada(ID), true);
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: erro ao tratar a queda (não conseguiu apagar o login) também agenda nova tentativa", async () => {
  await g.conectar(ID);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z" } });
  falharApagar = true;
  sockets[0]!.cair(401); // desconectado pelo celular: apagar o login falha por causa do banco
  assert.ok(await ate(() => g.reconexaoAgendada(ID)), "não ficou parado");
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.status, "RECONECTANDO"); assert.equal(s.erro, "Falha ao abrir a conexão.");
  await prisma.log.deleteMany({ where: { texto: { contains: "reabrir o WhatsApp" } } });
});

test("M1: a frase mostrada na tela é curta e fixa (sem detalhe técnico)", async () => {
  const { motivoDaFalha } = await import("../src/queda.js");
  assert.equal(motivoDaFalha(BANCO_FORA), "Banco de dados indisponível.");
  assert.equal(motivoDaFalha(new Error("Unsupported state or unable to authenticate data")), "Não foi possível ler o login salvo.");
  assert.equal(motivoDaFalha(new Error("senha=abc123 vazou")), "Falha ao abrir a conexão.");
  assert.equal(motivoDaFalha("qualquer coisa"), "Falha ao abrir a conexão.");
});

// ===== M3 (decisão #152): um número de WhatsApp só em UM espaço =====
const NUM = "5511987654321";
const donos = async () => (await prisma.usuario.findMany({ take: 2, select: { id: true }, orderBy: { id: "asc" } })).map((u) => u.id);
/** Espaço que já tem o número conectado (com login salvo) */
const ocupar = (id: string, usuarioId: string | null, numero = NUM, extra: Record<string, unknown> = {}) =>
  prisma.whatsappSessao.create({ data: { id, usuarioId, status: "CONECTADO", numero, creds: "v1:x:y:z", conectadoEm: new Date(Date.now() - 3600_000), ...extra } });
const limparLogsM3 = () => prisma.log.deleteMany({ where: { OR: [{ texto: { contains: "Número recusado" } }, { texto: { contains: "Tentativa de conectar este número" } }, { texto: { contains: "Número repetido" } }] } });

test("M3: mesmo usuário lendo o QR de um número que já está em outro dos seus WhatsApps é recusado; o antigo segue", async () => {
  const [dono] = await donos();
  await ocupar(ID2, dono!, NUM, { apelido: "Vendas 2" });
  await g.conectar(ID, dono);
  sockets[0]!.qr(); sockets[0]!.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "DESCONECTADO"), "a conexão nova foi recusada");
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.erro, 'Este número já está conectado em outro dos seus WhatsApps (WhatsApp "Vendas 2").');
  assert.equal(s.numero, null); assert.equal(sockets[0]!.fechada, true, "saiu do celular");
  assert.ok(apagados.includes(ID), "login novo apagado");
  assert.equal(g.conectado(ID), false);
  const antigo = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID2 } });
  assert.equal(antigo.status, "CONECTADO"); assert.equal(antigo.creds, "v1:x:y:z", "o espaço que já tinha o número continua intacto");
  assert.ok(await ate(async () => (await prisma.log.count({ where: { usuarioId: dono, texto: { contains: "Número recusado (+5511987654321): já está conectado em outro dos seus WhatsApps" } } })) === 1));
  await limparLogsM3();
});

test("M3: número que está em OUTRA conta é recusado sem dizer de quem; o dono dele vê a tentativa nos Logs", async () => {
  const [a, b] = await donos();
  await ocupar(ID2, b!);
  await g.conectar(ID, a);
  sockets[0]!.qr(); sockets[0]!.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "DESCONECTADO"));
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).erro, "Este número já está em uso em outra conta do FilaPro Leads. Se ele é seu, fale com o suporte.");
  assert.ok(await ate(async () => (await prisma.log.count({ where: { usuarioId: b, texto: { contains: "Tentativa de conectar este número (+5511987654321) em outra conta foi recusada" } } })) === 1), "o dono vê a tentativa");
  const log = await prisma.log.findFirstOrThrow({ where: { usuarioId: b, texto: { contains: "Tentativa de conectar" } } });
  assert.doesNotMatch(log.texto, new RegExp(String(a)), "sem dizer quem tentou");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID2 } })).status, "CONECTADO");
  await limparLogsM3();
});

test("M3: o 9º dígito não conta (com e sem ele é o mesmo número) e a plataforma também entra na regra", async () => {
  assert.equal(chaveDoNumero("5511987654321"), chaveDoNumero("551187654321"));
  assert.notEqual(chaveDoNumero("5511987654321"), chaveDoNumero("5511987654322"));
  const [dono] = await donos();
  await ocupar(ID2, null, "551187654321"); // outro espaço (sem dono, como a plataforma) com a forma antiga, sem o 9
  await g.conectar(ID, dono);
  sockets[0]!.qr(); sockets[0]!.abrir("5511987654321");
  assert.ok(await ate(async () => (await status()) === "DESCONECTADO"), "recusou mesmo com o formato diferente");
  await limparLogsM3();
});

test("M3: reconexão de login salvo NUNCA é recusada (mesmo com número repetido de antes)", async () => {
  const [dono] = await donos();
  await ocupar(ID2, dono!);
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: dono, status: "RECONECTANDO", numero: NUM, creds: "v1:x:y:z", quedaEm: new Date() } });
  await g.conectar(ID, dono); // reconexão: tem login salvo, não lê QR
  sockets[0]!.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "CONECTADO"), "reconectou normalmente");
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).erro, null);
  assert.deepEqual(apagados, [], "nada foi apagado");
});

test("M3: número diferente (troca de chip) e espaço livre funcionam normalmente", async () => {
  const [dono] = await donos();
  await ocupar(ID2, dono!, "5511911112222");
  await g.conectar(ID, dono);
  sockets[0]!.qr(); sockets[0]!.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  assert.equal((await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).numero, NUM);
});

test("M3: duas conexões lendo o QR do MESMO número ao mesmo tempo: só uma passa", async () => {
  const [a, b] = await donos();
  await g.conectar(ID, a); await g.conectar(ID2, b);
  // Depois de ler o QR o login já está gravado (o login falso do teste não grava): simula isso nas duas
  await prisma.whatsappSessao.updateMany({ where: { id: { in: [ID, ID2] } }, data: { creds: "v1:x:y:z" } });
  sockets[0]!.qr(); sockets[1]!.qr();
  sockets[0]!.abrir(NUM); sockets[1]!.abrir(NUM);
  const estados = async () => (await prisma.whatsappSessao.findMany({ where: { id: { in: [ID, ID2] } }, select: { id: true, status: true, erro: true, numero: true } })).map((x) => `${x.id}:${x.status}:${x.numero ?? "-"}:${x.erro ? "erro" : "-"}`).join(" | ");
  const um = await ate(async () => { const r = await prisma.whatsappSessao.findMany({ where: { id: { in: [ID, ID2] } }, select: { status: true } }); return r.filter((x) => x.status === "CONECTADO").length === 1 && r.filter((x) => x.status === "DESCONECTADO").length === 1; }, 12_000);
  assert.ok(um, "uma conectou e a outra foi recusada: " + (await estados()));
  await limparLogsM3();
});

test("M3: números que já estavam repetidos só vão para os Logs do Super Admin, sem desconectar ninguém, e sem repetir em 24 h", async () => {
  const [a, b] = await donos();
  await ocupar(ID, a!); await ocupar(ID2, b!);
  await limparLogsM3();
  const n = await registrarNumerosRepetidos();
  assert.ok(n >= 1);
  const logs = await prisma.log.findMany({ where: { texto: { contains: "Número repetido: +5511987654321" } } });
  assert.equal(logs.length, 1); assert.equal(logs[0]!.empresaId, null); assert.equal(logs[0]!.quem, "Sistema");
  assert.match(logs[0]!.texto, /está conectado em 2 espaços/); assert.match(logs[0]!.texto, /Nenhum foi desconectado/);
  await registrarNumerosRepetidos();
  assert.equal(await prisma.log.count({ where: { texto: { contains: "Número repetido: +5511987654321" } } }), 1, "não repete no mesmo dia");
  const ainda = await prisma.whatsappSessao.findMany({ where: { id: { in: [ID, ID2] } } });
  assert.ok(ainda.every((x) => x.status === "CONECTADO" && x.creds), "ninguém foi desconectado");
  await limparLogsM3();
});

// ===== M4 (decisão #153): Logs contam a história das quedas =====
const logsDesde = (inicio: Date, trecho: string, usuarioId?: string) => prisma.log.findMany({ where: { tipo: "WHATSAPP", criadoEm: { gte: inicio }, texto: { contains: trecho }, ...(usuarioId ? { usuarioId } : {}) } });

test("M4: queda comum que volta = UMA linha nos Logs com a hora, o motivo (com código) e o tempo fora; sem 'conectado' solto", async () => {
  const [dono] = await donos();
  await g.conectar(ID, dono);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  await espera(150);
  const inicio = new Date();
  sockets[0]!.cair(428);
  assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z" } });
  await g.conectar(ID); // "Tentar agora"
  sockets[1]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  assert.ok(await ate(async () => (await logsDesde(inicio, "WhatsApp voltou às", dono)).length === 1));
  const [l] = await logsDesde(inicio, "WhatsApp voltou às", dono);
  assert.match(l!.texto, /^WhatsApp voltou às \d\d:\d\d \(caiu às \d\d:\d\d: conexão perdida \(código 428\); ficou \d+ s fora\)$/);
  assert.equal((await logsDesde(inicio, "WhatsApp conectado (+", dono)).length, 0, "a volta não vira 'conectado'");
  await prisma.log.deleteMany({ where: { id: l!.id } });
});

test("M4: primeira conexão (QR) continua 'WhatsApp conectado (+número)'", async () => {
  const [dono] = await donos();
  const inicio = new Date();
  await g.conectar(ID, dono);
  sockets[0]!.qr(); sockets[0]!.abrir("5511977776666");
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  assert.ok(await ate(async () => (await logsDesde(inicio, "WhatsApp conectado (+5511977776666)", dono)).length === 1));
  assert.equal((await logsDesde(inicio, "WhatsApp voltou", dono)).length, 0);
  await prisma.log.deleteMany({ where: { criadoEm: { gte: inicio }, texto: { contains: "5511977776666" } } });
});

test("M4: reconexão por reinício do serviço tem linha própria, separada de queda", async () => {
  const [dono] = await donos();
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: dono, status: "CONECTADO", numero: NUM, creds: "v1:x:y:z" } });
  const inicio = new Date();
  await g.iniciarTodas();
  for (const k of sockets) k.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  assert.ok(await ate(async () => (await logsDesde(inicio, "reconectado depois do reinício do serviço (+5511987654321)", dono)).length >= 1));
  assert.equal((await logsDesde(inicio, "WhatsApp voltou", dono)).length, 0, "reinício não é queda");
  await prisma.log.deleteMany({ where: { criadoEm: { gte: inicio }, texto: { contains: "reinício do serviço" } } });
});

// ===== M5 (decisão #154): reconexão aos poucos, sem rajada =====
const ouvir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const criar = (id: string, usuarioId: string | null) => prisma.whatsappSessao.create({ data: { id, usuarioId, status: "CONECTADO", creds: "v1:x:y:z" } });

test("M5: ao ligar, abre aos poucos (1 a cada intervalo) e na ordem: plataforma, quem tem campanha em andamento, os demais", async () => {
  const [a, b] = await donos();
  const campanha = await prisma.campanha.create({ data: { usuarioId: a!, status: "EM_ANDAMENTO", assunto: "tst-m5" } });
  try {
    await prisma.whatsappSessao.deleteMany({ where: { id: "plataforma" } });
    // criadas fora de ordem de propósito: o primeiro da fila NÃO pode ser o da plataforma por acaso
    await criar("tst-m5-c", b!); await criar("tst-m5-b", b!); await criar("tst-m5-a", a!); await criar("plataforma", null);
    g.encerrarTudo();
    g = novoGerenciador({ porteiro: new Porteiro({ concorrencia: 2, intervaloMs: 150 }) });
    const t0 = Date.now();
    await g.iniciarTodas();
    const minhas = aberturas.filter((x) => ["plataforma", "tst-m5-a", "tst-m5-b", "tst-m5-c"].includes(x.id));
    assert.equal(minhas.length, 4);
    assert.equal(minhas[0]!.id, "plataforma", "o número da plataforma abre primeiro");
    assert.equal(minhas[1]!.id, "tst-m5-a", "depois quem tem campanha em andamento");
    for (let i = 1; i < minhas.length; i++) assert.ok(minhas[i]!.t - minhas[i - 1]!.t >= 135, `abertura ${i} veio só ${minhas[i]!.t - minhas[i - 1]!.t} ms depois da anterior`);
    assert.ok(Date.now() - t0 >= 3 * 135, "as 4 aberturas levaram pelo menos 3 intervalos");
  } finally {
    await prisma.campanha.delete({ where: { id: campanha.id } });
    await prisma.whatsappSessao.deleteMany({ where: { id: "plataforma" } });
  }
});

test("M5: o que o usuário faz (Conectar) NÃO espera a fila do porteiro", async () => {
  const [a, b] = await donos();
  await criar("tst-m5-a", a!); await criar("tst-m5-b", b!);
  g.encerrarTudo();
  g = novoGerenciador({ porteiro: new Porteiro({ concorrencia: 1, intervaloMs: 3000 }) });
  const fila = g.iniciarTodas(); // não espera: a 2ª abertura só sai daqui a 3 s
  await ouvir(300);
  const antes = aberturas.filter((x) => x.id.startsWith("tst-m5-")).length;
  assert.equal(antes, 1, "só a primeira abriu; a segunda espera a vez");
  const t = Date.now();
  await g.conectar(ID, a); // clique do usuário: imediato
  assert.ok(Date.now() - t < 1000, "Conectar não esperou os 3 s do porteiro");
  assert.ok(aberturas.some((x) => x.id === ID), "a conexão do usuário abriu na hora");
  assert.equal(aberturas.filter((x) => x.id.startsWith("tst-m5-")).length, 1, "e a fila automática continua esperando");
  await fila;
  assert.equal(aberturas.filter((x) => x.id.startsWith("tst-m5-")).length, 2, "a fila terminou sozinha depois");
});

test("M5: quedas ao mesmo tempo reconectam espaçadas (sem rajada)", async () => {
  const [a, b] = await donos();
  g.encerrarTudo();
  g = novoGerenciador({ porteiro: new Porteiro({ concorrencia: 2, intervaloMs: 500 }) });
  await g.conectar(ID, a); await g.conectar(ID2, b);
  sockets[0]!.abrir(); sockets[1]!.abrir();
  assert.ok(await ate(async () => (await prisma.whatsappSessao.count({ where: { id: { in: [ID, ID2] }, status: "CONECTADO" } })) === 2));
  await prisma.whatsappSessao.updateMany({ where: { id: { in: [ID, ID2] } }, data: { creds: "v1:x:y:z" } });
  aberturas = [];
  sockets[0]!.cair(428); sockets[1]!.cair(428); // queda geral: as duas tentativas vencem juntas (2 s)
  assert.ok(await ate(() => aberturas.filter((x) => x.id === ID || x.id === ID2).length === 2, 8000), "as duas tentaram de novo");
  const [x, y] = aberturas.filter((z) => z.id === ID || z.id === ID2);
  assert.ok(y!.t - x!.t >= 450, `a 2ª tentativa veio só ${y!.t - x!.t} ms depois da 1ª`);
});

test("M5: prioridade de abertura: plataforma 0, campanha em andamento 1, demais 2, só-para-sair 3", () => {
  const com = new Set(["u1"]);
  assert.equal(prioridadeDeAbertura({ id: "plataforma", usuarioId: null, bloqueada: false }, com), 0);
  assert.equal(prioridadeDeAbertura({ id: "x", usuarioId: "u1", bloqueada: false }, com), 1);
  assert.equal(prioridadeDeAbertura({ id: "y", usuarioId: "u2", bloqueada: false }, com), 2);
  assert.equal(prioridadeDeAbertura({ id: "z", usuarioId: null, bloqueada: false }, com), 3, "sem dono só conecta para sair");
  assert.equal(prioridadeDeAbertura({ id: "w", usuarioId: "u1", bloqueada: true }, com), 3, "bloqueado só conecta para sair");
});

// ===== B2 (decisão #155): "Conectado desde" mantém a data da conexão de verdade =====
test("B2: depois de queda o 'desde' NÃO muda e a reconexão fica em reconectadoEm; primeira conexão marca só o desde", async () => {
  const [dono] = await donos();
  await g.conectar(ID, dono);
  sockets[0]!.qr(); sockets[0]!.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const primeira = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.ok(primeira.conectadoEm); assert.equal(primeira.reconectadoEm, null, "primeira conexão não é reconexão");
  await prisma.whatsappSessao.update({ where: { id: ID }, data: { creds: "v1:x:y:z", conectadoEm: new Date(Date.now() - 2 * 86_400_000) } }); // conectado há 2 dias
  const desde = (await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } })).conectadoEm!.getTime();
  sockets[0]!.cair(428);
  assert.ok(await ate(async () => (await status()) === "RECONECTANDO"));
  await g.conectar(ID); // tentar agora
  sockets[1]!.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const volta = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(volta.conectadoEm!.getTime(), desde, "o 'Conectado desde' continua o de 2 dias atrás");
  assert.ok(volta.reconectadoEm && Date.now() - volta.reconectadoEm.getTime() < 10_000, "a reconexão foi marcada");
  await prisma.log.deleteMany({ where: { texto: { contains: "WhatsApp voltou às" }, usuarioId: dono } });
});

test("B2: reinício do serviço também mantém o 'desde' e marca a reconexão", async () => {
  const [dono] = await donos();
  const antigo = new Date(Date.now() - 5 * 86_400_000);
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: dono, status: "CONECTADO", numero: NUM, creds: "v1:x:y:z", conectadoEm: antigo } });
  await g.iniciarTodas();
  for (const k of sockets) k.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.equal(s.conectadoEm!.getTime(), antigo.getTime());
  assert.ok(s.reconectadoEm);
  await prisma.log.deleteMany({ where: { texto: { contains: "reinício do serviço" }, usuarioId: dono } });
});

test("B2: desconectar e conectar de novo é conexão NOVA (o 'desde' recomeça e a reconexão some)", async () => {
  const [dono] = await donos();
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: dono, status: "CONECTADO", numero: NUM, creds: "v1:x:y:z", conectadoEm: new Date(Date.now() - 86_400_000), reconectadoEm: new Date() } });
  await g.desconectar(ID);
  await g.conectar(ID, dono);
  sockets[0]!.qr(); sockets[0]!.abrir(NUM);
  assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const s = await prisma.whatsappSessao.findUniqueOrThrow({ where: { id: ID } });
  assert.ok(Date.now() - s.conectadoEm!.getTime() < 10_000, "recomeçou agora");
  assert.equal(s.reconectadoEm, null);
  await prisma.log.deleteMany({ where: { texto: { contains: "5511987654321" }, usuarioId: dono } });
});

// ===== B4 (decisão #155): guardar o login com 3 tentativas e avisar nos Logs =====
const logsLogin = (inicio: Date, trecho: string) => prisma.log.findMany({ where: { tipo: "WHATSAPP", criadoEm: { gte: inicio }, texto: { contains: trecho } } });

test("B4: se guardar o login falha 2 vezes, na 3ª tentativa guarda e não avisa", async () => {
  const [dono] = await donos();
  await g.conectar(ID, dono);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const inicio = new Date(); salvarChamadas = 0; falharSalvar = 2;
  sockets[0]!.atualizarLogin();
  assert.ok(await ate(() => salvarChamadas === 3), "tentou 3 vezes");
  await espera(100);
  assert.equal((await logsLogin(inicio, "guardar o login")).length, 0, "conseguiu na 3ª: sem aviso");
});

test("B4: se falha nas 3, avisa nos Logs UMA vez; quando volta a guardar, avisa que guardou", async () => {
  const [dono] = await donos();
  await g.conectar(ID, dono);
  sockets[0]!.abrir(); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  const inicio = new Date(); salvarChamadas = 0; falharSalvar = 99;
  sockets[0]!.atualizarLogin();
  assert.ok(await ate(async () => (await logsLogin(inicio, "Não foi possível guardar o login do WhatsApp: se o serviço reiniciar, será preciso ler o QR Code de novo")).length === 1));
  assert.equal(salvarChamadas, 3);
  sockets[0]!.atualizarLogin(); // continua falhando: NÃO repete o aviso
  assert.ok(await ate(() => salvarChamadas === 6));
  await espera(100);
  assert.equal((await logsLogin(inicio, "Não foi possível guardar o login")).length, 1, "um aviso só");
  falharSalvar = 0; sockets[0]!.atualizarLogin(); // voltou
  assert.ok(await ate(async () => (await logsLogin(inicio, "Login do WhatsApp guardado de novo")).length === 1));
  await prisma.log.deleteMany({ where: { criadoEm: { gte: inicio }, OR: [{ texto: { contains: "guardar o login" } }, { texto: { contains: "guardado de novo" } }] } });
});

// ===== B5 (decisão #155): intervalo mínimo entre pedidos do usuário =====
test("B5: dois 'Conectar' seguidos (gerar QR) — o segundo espera 10 s; o Desconectar nunca é limitado", async () => {
  g.encerrarTudo();
  g = new GerenciadorSessoes(randomBytes(32), pino({ level: "silent" }), {
    versao: [2, 3000, 1], porteiro: new Porteiro({ concorrencia: 99, intervaloMs: 0 }), aleatorio: () => 0.5,
    intervaloConectarMs: 400, intervaloTentarAgoraMs: 200,
    criarSocket: () => { const s = new SocketFalso(); sockets.push(s); return s as never; },
    usarAuth: async (idAtual: string) => ({ state: { creds: { me: undefined } as never, keys: { get: async () => ({}), set: async () => undefined } as never }, salvarCreds: async () => (await prisma.whatsappSessao.count({ where: { id: idAtual } })) > 0 }),
    apagarAuth: async () => undefined,
  });
  const [dono] = await donos();
  assert.deepEqual(await g.conectar(ID, dono), { ok: true, mensagem: "Conectando…" });
  await g.desconectar(ID); // cancelar sempre pode
  const cedo = await g.conectar(ID, dono);
  assert.equal(cedo.ok, false); assert.equal(cedo.mensagem, "Aguarde alguns segundos antes de tentar de novo.");
  assert.equal(sockets.length, 1, "o pedido recusado não abriu outra conexão");
  await espera(450);
  assert.equal((await g.conectar(ID, dono)).ok, true, "passado o intervalo, conecta");
  assert.equal(sockets.length, 2);
});

test("B5: 'Tentar agora' tem intervalo próprio (5 s) e o pedido recusado NÃO cancela a reconexão agendada", async () => {
  g.encerrarTudo();
  g = new GerenciadorSessoes(randomBytes(32), pino({ level: "silent" }), {
    versao: [2, 3000, 1], porteiro: new Porteiro({ concorrencia: 99, intervaloMs: 0 }), aleatorio: () => 0.5,
    intervaloConectarMs: 0, intervaloTentarAgoraMs: 600,
    criarSocket: () => { const s = new SocketFalso(); sockets.push(s); return s as never; },
    usarAuth: async (idAtual: string) => ({ state: { creds: { me: { id: "5511900001111:1@s.whatsapp.net" } } as never, keys: { get: async () => ({}), set: async () => undefined } as never }, salvarCreds: async () => (await prisma.whatsappSessao.count({ where: { id: idAtual } })) > 0 }),
    apagarAuth: async () => undefined,
  });
  const [dono] = await donos();
  await prisma.whatsappSessao.create({ data: { id: ID, usuarioId: dono, status: "RECONECTANDO", numero: NUM, creds: "v1:x:y:z", quedaEm: new Date() } });
  assert.equal((await g.conectar(ID)).ok, true, "1º 'Tentar agora'");
  sockets[0]!.abrir(NUM); assert.ok(await ate(async () => (await status()) === "CONECTADO"));
  sockets[0]!.cair(428); assert.ok(await ate(() => g.reconexaoAgendada(ID)), "reconexão agendada");
  const cedo = await g.conectar(ID);
  assert.equal(cedo.ok, false);
  assert.equal(g.reconexaoAgendada(ID), true, "o pedido recusado não cancelou a reconexão automática");
  await prisma.log.deleteMany({ where: { usuarioId: dono, texto: { contains: "reinício do serviço" } } });
});
