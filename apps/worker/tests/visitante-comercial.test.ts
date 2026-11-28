// Fale conosco (decisão #178): texto dos planos (preço, promoção, condições, descontos), material comercial e o fluxo do atendente
// (resposta e teste do Super Admin) com a IA "falsa" que registra o que recebeu. Banco real.
import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import pino from "pino";
import { prisma, Cargo, Modulo } from "@filapro/db";
import { AtendenteInteressados, LIMITE_TESTES_VISITANTE_HORA } from "../src/interessados.js";
import { lerMaterialComercial, textoDoPlano, textoDosPlanos, MAX_MATERIAL_COMERCIAL, type PlanoParaTexto } from "../src/comercial.js";

const plano = (extra: Partial<PlanoParaTexto> = {}): PlanoParaTexto => ({
  nome: "Plano Teste", modulo: "INDIVIDUAL", usuarios: null, gratis: false, personalizado: false, precoAntigo: null, precoAtual: 2990, periodo: "mês", prazoDias: 31,
  testeDias: null, testeDisparos: null, limiteLeads: null, leadsAnuncios: false, maxWhatsapps: 1, precoWhatsappExtra: null, descontos: [10, 15, 20, 25], maxPacotes: 1,
  disparosPorPeriodo: null, pacoteDisparos: null, precoPacoteDisparos: null, selo: "", frase: "", condicoes: "", ofertaTexto: "", recursos: [], ...extra,
});
const nbsp = (s: string) => s.replace(/ /g, " ");

test("plano com promoção cadastrada (de/por): o texto traz o preço antigo e o atual EXATAMENTE como estão", () => {
  const t = nbsp(textoDoPlano(plano({ precoAntigo: 4990, precoAtual: 2990, ofertaTexto: "Só até domingo", condicoes: "Primeira compra", selo: "Mais vendido" })));
  assert.match(t, /PROMOÇÃO: de R\$ 49,90 por R\$ 29,90 por 31 dias/);
  assert.match(t, /oferta: Só até domingo/);
  assert.match(t, /condições: Primeira compra/);
  assert.match(t, /selo: Mais vendido/);
});

test("sem promoção: só o preço; preço antigo igual ou menor que o atual não vira promoção; sob consulta e personalizado", () => {
  assert.doesNotMatch(textoDoPlano(plano()), /PROMOÇÃO/);
  assert.doesNotMatch(textoDoPlano(plano({ precoAntigo: 2990, precoAtual: 2990 })), /PROMOÇÃO/);
  assert.doesNotMatch(textoDoPlano(plano({ precoAntigo: 1000, precoAtual: 2990 })), /PROMOÇÃO/);
  assert.match(textoDoPlano(plano({ precoAtual: null })), /preço sob consulta/);
  assert.match(textoDoPlano(plano({ personalizado: true, precoAtual: 9900 })), /preço sob consulta/, "personalizado nunca mostra preço");
});

test("plano gratuito: mostra os limites do teste como cadastrados e que é 1 teste por e-mail", () => {
  const t = textoDoPlano(plano({ nome: "Free", gratis: true, precoAtual: null, testeDias: 7, testeDisparos: 20 }));
  assert.match(t, /gratuito/);
  assert.match(t, /teste grátis de 7 dias ou 20 disparos, o que acontecer primeiro; 1 teste por e-mail/);
  assert.doesNotMatch(t, /sem limite de disparos/);
});

test("Individual com WhatsApp extra: máximo de números, preço do extra e desconto progressivo", () => {
  const t = nbsp(textoDoPlano(plano({ maxWhatsapps: 4, precoWhatsappExtra: 1990, descontos: [10, 15, 20, 25] })));
  assert.match(t, /até 4 números de WhatsApp \(o principal \+ extras\); cada extra custa R\$ 19,90 por período, com desconto progressivo: 2º 10%, 3º 15%, 4º 20%, 5º 25%/);
  assert.match(textoDoPlano(plano()), /1 número de WhatsApp/);
});

test("Empresarial: pacote de usuários, pacotes a escolher com desconto; quantidade de disparos e pacote extra", () => {
  const t = nbsp(textoDoPlano(plano({ nome: "Padrão", modulo: "EMPRESARIAL", usuarios: 10, maxPacotes: 5, disparosPorPeriodo: 5000, pacoteDisparos: 1000, precoPacoteDisparos: 4900, limiteLeads: 20000, leadsAnuncios: true, recursos: ["Relatórios"] })));
  assert.match(t, /pacote de 10 usuários; a empresa pode escolher até 5 pacotes, com desconto progressivo \(2º 10%, 3º 15%, 4º 20%, 5º 25%\)/);
  assert.match(t, /5000 disparos por período; pacote extra de 1000 disparos por R\$ 49,00/);
  assert.match(t, /até 20000 leads/);
  assert.match(t, /inclui leads de anúncios/);
  assert.match(t, /Relatórios/);
});

test("planos separados por módulo, na ordem recebida", () => {
  const t = textoDosPlanos([plano({ nome: "A" }), plano({ nome: "B", modulo: "EMPRESARIAL", usuarios: 3 })]);
  assert.ok(t.indexOf("Módulo Individual") < t.indexOf("- A:") && t.indexOf("- A:") < t.indexOf("Módulo Empresarial") && t.indexOf("Módulo Empresarial") < t.indexOf("- B:"));
  assert.equal(textoDosPlanos([]), "");
});

test("material comercial: o arquivo existe, cabe no limite e traz o que combinamos (papel, honestidade, o que nunca fazer, chamar atendente)", async () => {
  const m = await lerMaterialComercial();
  assert.ok(m.length > 3000 && m.length <= MAX_MATERIAL_COMERCIAL, `tamanho ${m.length}`);
  for (const trecho of ["Seu papel", "Objeções comuns", "O que nunca fazer", "Quando chamar um atendente", "nenhum sistema elimina esse risco", "Nunca garantir resultado", "Nunca pedir dados de pagamento"]) assert.ok(m.includes(trecho), `falta: ${trecho}`);
  assert.doesNotMatch(m, /sk-[A-Za-z0-9]{10,}|CHAVE_CRIPTO|WORKER_TOKEN|senha do banco/i, "sem segredos nem assuntos internos");
});

// ---------------- Fluxo do atendente (banco real, IA falsa) ----------------
type Chamada = Parameters<NonNullable<ConstructorParameters<typeof AtendenteInteressados>[1]>["ia"] & ((...a: never[]) => unknown)>;
let chamadas: { dados: Record<string, unknown>; quem: Record<string, unknown> }[] = [];
let naoSei = false;
const iaFalsa = (async (dados: Record<string, unknown>, quem: Record<string, unknown>) => {
  chamadas.push({ dados, quem });
  return { resposta: "Resposta de teste da IA", temperatura: "QUENTE", status: "EM_CONVERSA", naoSei, motivo: "teste", custoUsd: 0 };
}) as never;
const at = () => new AtendenteInteressados(pino({ level: "silent" }), { esperaMs: () => 0, ia: iaFalsa, lerMaterial: async () => "MATERIAL-DE-TESTE", avisarSuporte: async () => undefined });

const SA = "tvc-sa", INT = "tvc-int", PLANO = "tvc-plano";
let fichaAntes: Awaited<ReturnType<typeof prisma.fichaEmpresa.findUnique>> = null;
let ligadaAntes = false;

before(async () => {
  await prisma.usuario.deleteMany({ where: { id: SA } });
  await prisma.empresa.deleteMany({ where: { id: "tvc-emp" } });
  ligadaAntes = (await prisma.configVenda.findUnique({ where: { id: "config" } }))?.iaVisitanteLigada ?? false;
  await prisma.configVenda.upsert({ where: { id: "config" }, update: { iaVisitanteLigada: true }, create: { id: "config", iaVisitanteLigada: true } });
  // O atendente usa o PRIMEIRO Super Admin criado: guardamos a ficha dele e usamos os campos de teste
  const sa = await prisma.usuario.findFirst({ where: { cargo: Cargo.SUPERADMIN }, orderBy: { criadoEm: "asc" }, select: { id: true } });
  assert.ok(sa, "precisa do Super Admin do seed");
  fichaAntes = await prisma.fichaEmpresa.findUnique({ where: { superAdminId: sa.id } });
  await prisma.fichaEmpresa.upsert({ where: { superAdminId: sa.id }, update: { orientacoesVisitante: "SCRIPT-DE-TESTE: abra perguntando o ramo" }, create: { superAdminId: sa.id, nome: "", orientacoesVisitante: "SCRIPT-DE-TESTE: abra perguntando o ramo" } });
  await prisma.plano.deleteMany({ where: { slug: PLANO } });
  await prisma.plano.create({ data: { id: PLANO, slug: PLANO, nome: "Plano Promo Teste", modulo: Modulo.INDIVIDUAL, precoAntigo: 5990, precoAtual: 3990, prazoDias: 31, visivel: true, ordem: 999, ofertaTexto: "Oferta de lançamento", recursos: ["Recurso A"] } });
});
beforeEach(async () => {
  chamadas = []; naoSei = false;
  await prisma.interessado.deleteMany({ where: { id: INT } });
  await prisma.interessado.create({ data: { id: INT, tokenHash: "tvc-hash", nome: "Visitante Teste", whatsapp: "5511900000001", email: "visitante-teste@exemplo.com", aceitouEm: new Date() } });
  await prisma.interessadoMensagem.create({ data: { interessadoId: INT, autor: "VISITANTE", texto: "quanto custa?" } });
});
after(async () => {
  await prisma.interessado.deleteMany({ where: { id: INT } });
  await prisma.plano.deleteMany({ where: { slug: PLANO } });
  const sa = await prisma.usuario.findFirst({ where: { cargo: Cargo.SUPERADMIN }, orderBy: { criadoEm: "asc" }, select: { id: true } });
  if (sa) {
    if (fichaAntes) await prisma.fichaEmpresa.update({ where: { superAdminId: sa.id }, data: { orientacoesVisitante: fichaAntes.orientacoesVisitante } });
    else await prisma.fichaEmpresa.deleteMany({ where: { superAdminId: sa.id } });
  }
  await prisma.configVenda.update({ where: { id: "config" }, data: { iaVisitanteLigada: ligadaAntes } });
  await prisma.$disconnect();
});

test("a resposta ao visitante recebe: script do dono, material comercial e os planos COM a promoção cadastrada", async () => {
  await at().responder(INT);
  assert.equal(chamadas.length, 1);
  const d = chamadas[0]!.dados as { ficha: string; comercial: string; orientacoesVisitante: string; visitanteSite: boolean };
  assert.equal(d.visitanteSite, true);
  assert.equal(d.comercial, "MATERIAL-DE-TESTE");
  assert.match(d.orientacoesVisitante, /SCRIPT-DE-TESTE/);
  assert.match(nbsp(d.ficha), /Plano Promo Teste: PROMOÇÃO: de R\$ 59,90 por R\$ 39,90 por 31 dias — oferta: Oferta de lançamento/);
  assert.match(d.ficha, /Planos à venda \(valores, promoções e condições valem EXATAMENTE como estão aqui\)/);
  const m = await prisma.interessadoMensagem.findMany({ where: { interessadoId: INT }, orderBy: { criadoEm: "asc" } });
  assert.equal(m.at(-1)?.autor, "IA");
  assert.equal(m.at(-1)?.texto, "Resposta de teste da IA");
});

test("plano NÃO visível não aparece para a IA", async () => {
  await prisma.plano.update({ where: { slug: PLANO }, data: { visivel: false } });
  await at().responder(INT);
  assert.doesNotMatch((chamadas[0]!.dados as { ficha: string }).ficha, /Plano Promo Teste/);
  await prisma.plano.update({ where: { slug: PLANO }, data: { visivel: true } });
});

test("a IA que não soube responder pausa o visitante (comportamento anterior mantido)", async () => {
  naoSei = true;
  await at().responder(INT);
  assert.equal((await prisma.interessado.findUniqueOrThrow({ where: { id: INT } })).iaPausada, true);
});

test("teste do Super Admin: responde com o script salvo, NÃO cria conversa nem mensagem e tem limite por hora", async () => {
  const sa = (await prisma.usuario.findFirst({ where: { cargo: Cargo.SUPERADMIN }, orderBy: { criadoEm: "asc" }, select: { id: true } }))!.id;
  const antesI = await prisma.interessado.count(); const antesM = await prisma.interessadoMensagem.count();
  const a = at();
  assert.equal((await a.testar(sa, "   ")).ok, false, "pergunta vazia");
  const r = await a.testar(sa, "Oi, quanto custa?");
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.resposta, "Resposta de teste da IA"); assert.equal(r.temperatura, "QUENTE"); assert.equal(r.vaiParaAtendente, false); }
  if (r.ok) {
    assert.equal(r.usando.script, "SCRIPT-DE-TESTE: abra perguntando o ramo".length, "o teste informa quantos caracteres do script a IA recebeu");
    assert.equal(r.usando.material, "MATERIAL-DE-TESTE".length);
    assert.ok(r.usando.planos >= 1 && r.usando.promocoes >= 1, "conta os planos visíveis e os que têm promoção");
  }
  const d = chamadas.at(-1)!.dados as { orientacoesVisitante: string; recentes: { texto: string }[]; nomeLead: string; usando?: unknown };
  assert.equal(d.usando, undefined, "o resumo 'usando' é só para a tela: não vai para a IA");
  assert.match(d.orientacoesVisitante, /SCRIPT-DE-TESTE/);
  assert.equal(d.recentes[0]!.texto, "Oi, quanto custa?");
  assert.equal(await prisma.interessado.count(), antesI);
  assert.equal(await prisma.interessadoMensagem.count(), antesM);
  for (let i = 0; i < LIMITE_TESTES_VISITANTE_HORA - 1; i++) assert.equal((await a.testar(sa, `teste ${i}`)).ok, true);
  const bloqueado = await a.testar(sa, "mais um");
  assert.equal(bloqueado.ok, false);
  if (!bloqueado.ok) assert.match(bloqueado.mensagem, /Limite de 10 testes por hora/);
});

test("script salvo por OUTRO Super Admin: se a ficha do primeiro não tem script, a IA usa o que existe (não fica sem as diretrizes)", async () => {
  const primeiro = (await prisma.usuario.findFirst({ where: { cargo: Cargo.SUPERADMIN }, orderBy: { criadoEm: "asc" }, select: { id: true } }))!.id;
  await prisma.usuario.deleteMany({ where: { id: "tvc-sa2" } });
  await prisma.usuario.create({ data: { id: "tvc-sa2", codigo: "TVC2", nome: "Outro Super Admin", email: "tvc-sa2@teste.local", cargo: Cargo.SUPERADMIN } });
  const antes = (await prisma.fichaEmpresa.findUnique({ where: { superAdminId: primeiro } }))!.orientacoesVisitante;
  try {
    await prisma.fichaEmpresa.update({ where: { superAdminId: primeiro }, data: { orientacoesVisitante: "" } });
    await prisma.fichaEmpresa.upsert({ where: { superAdminId: "tvc-sa2" }, update: { orientacoesVisitante: "SCRIPT-DO-OUTRO-SA" }, create: { superAdminId: "tvc-sa2", nome: "", orientacoesVisitante: "SCRIPT-DO-OUTRO-SA" } });
    await at().responder(INT);
    assert.match((chamadas.at(-1)!.dados as { orientacoesVisitante: string }).orientacoesVisitante, /SCRIPT-DO-OUTRO-SA/);
  } finally {
    await prisma.fichaEmpresa.update({ where: { superAdminId: primeiro }, data: { orientacoesVisitante: antes } });
    await prisma.fichaEmpresa.deleteMany({ where: { superAdminId: "tvc-sa2" } });
    await prisma.usuario.deleteMany({ where: { id: "tvc-sa2" } });
  }
});
