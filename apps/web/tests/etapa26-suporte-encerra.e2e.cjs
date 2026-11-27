// Teste de ponta a ponta da decisão #156: o atendimento do suporte é encerrado após 10 min de inatividade do cliente.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (código novo) e Postgres com seed.
// Uso: node apps/web/tests/etapa26-suporte-encerra.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => { const l = `${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`; res.push(l); console.error(l); };
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (f, ms = 15000) => { for (let i = 0; i < ms / 300; i++) { if (await f()) return true; await espera(300); } return false; };
const TOKEN = (fs.readFileSync(path.resolve(__dirname, '../../worker/.env'), 'utf8').match(/^WORKER_TOKEN="?([^"\n]+)"?/m) || [])[1];
const encerrar = async () => (await (await fetch('http://127.0.0.1:4000/suporte/encerrar-inativos', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: '{}' })).json()).encerrados;

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const ligadaAntes = sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`);
  sql(`update "ConfigVenda" set "iaSuporteLigada"=false where id='config'`); // sem IA: só o fluxo do encerramento
  sql(`delete from "SuporteConversa"`);
  const conv = sql(`insert into "SuporteConversa"(id,"usuarioId","ultimaMensagemEm") values ('tse26','${ANA}', now() - interval '11 minutes') returning id`).split('\n')[0];
  const m = (id, autor, min, texto) => sql(`insert into "SuporteMensagem"(id,"conversaId",autor,"autorId",texto,"criadoEm") values ('${id}','tse26','${autor}','${autor === 'CLIENTE' ? ANA : 'sa'}','${texto}', now() - interval '${min} minutes')`);
  m('tse26a', 'CLIENTE', 15, 'Preciso de ajuda com a campanha'); m('tse26b', 'SUPORTE', 11, 'Claro, me mande o print');

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => { await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`); await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard'); };
  try {
    const [cS, pS] = await novo(); await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    const [cU, pU] = await novo(); await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');

    ok('Antes de conferir: o atendimento está aberto', sql(`select "encerradaEm" is null from "SuporteConversa" where id='tse26'`) === 't');
    ok('Encerra 1 atendimento inativo há mais de 10 min (a vez era do cliente)', (await encerrar()) === 1);
    ok('Marcado como encerrado', sql(`select "encerradaEm" is not null from "SuporteConversa" where id='tse26'`) === 't');
    ok('Mensagem do sistema gravada com o texto combinado', sql(`select texto from "SuporteMensagem" where "conversaId"='tse26' and autor='SISTEMA'`) === 'Atendimento encerrado por inatividade. Se precisar, é só escrever de novo.');
    ok('Não gerou notificação nova para o cliente', sql(`select "naoLidasCliente" from "SuporteConversa" where id='tse26'`) === '0');
    ok('Conferir de novo não repete', (await encerrar()) === 0 && sql(`select count(*) from "SuporteMensagem" where "conversaId"='tse26' and autor='SISTEMA'`) === '1');

    // Cliente vê a mensagem do sistema, centralizada
    await pU.goto(BASE + '/leads'); await espera(800);
    await pU.click('[data-testid=botao-suporte]'); await espera(1500);
    // Decisão #177: depois de encerrado, quem abre o chat do zero vê a tela LIMPA (o histórico fica guardado, só escondido)
    ok('Cliente abre o chat depois de encerrado: tela limpa (nada do atendimento anterior)', (await pU.locator('[data-testid=janela-suporte] [data-testid=msg-sistema]').count()) === 0 && (await pU.locator('[data-testid=janela-suporte] >> text=Preciso de ajuda com a campanha').count()) === 0 && (await pU.locator('[data-testid=janela-suporte] [data-testid=chat-vazio]').count()) === 1);
    await pU.screenshot({ path: OUT + '/suporte-encerrado-cliente.png' });

    // Super Admin vê o selo na lista e no cabeçalho; histórico completo
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1500);
    ok('Atendimento: selo "Encerrada" na lista', (await pS.locator('[data-testid=item-atendimento] [data-testid=selo-encerrada]').count()) === 1);
    ok('Atendimento: selo no cabeçalho e chat principal limpo, com o aviso do atendimento encerrado (decisão #177)', (await pS.locator('[data-testid=selo-encerrada-chat]').count()) === 1 && (await pS.locator('[data-testid=chat-mensagens] >> text=Preciso de ajuda com a campanha').count()) === 0 && /Atendimento encerrado/.test(await pS.locator('[data-testid=chat-vazio]').innerText()));
    await pS.click('[data-testid=abrir-anteriores]'); await espera(1200);
    ok('Atendimentos anteriores: o histórico continua guardado e aparece aqui, só leitura', (await pS.locator('[data-testid=atendimento-anterior]').count()) === 1 && (await pS.locator('[data-testid=anteriores] >> text=Preciso de ajuda com a campanha').count()) === 1 && /encerrado por inatividade/.test(await pS.locator('[data-testid=anteriores]').innerText()));
    await pS.click('[data-testid=fechar-anteriores]');
    await pS.screenshot({ path: OUT + '/suporte-encerrado-admin.png' });

    // Cliente escreve: reabre sozinho (novo atendimento)
    sql(`update "SuporteConversa" set "iaPausada"=true, "iaPausaMotivo"='Assumida pelo Super Admin' where id='tse26'`);
    await pU.fill('[aria-label="Mensagem para o suporte"]', 'Voltei, ainda preciso de ajuda'); await pU.click('[data-testid=janela-suporte] button:has-text("Enviar")'); await espera(1500);
    ok('Mensagem do cliente reabre o atendimento (selo some, pausa antiga limpa)', sql(`select ("encerradaEm" is null)::text||'|'||"iaPausada"::text from "SuporteConversa" where id='tse26'`) === 'true|false');
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1500);
    ok('Atendimento: o selo "Encerrada" desapareceu', (await pS.locator('[data-testid=selo-encerrada]').count()) === 0 && (await pS.locator('[data-testid=selo-encerrada-chat]').count()) === 0);

    // Cliente esperando o atendente NUNCA é encerrado (a IA passou o caso)
    sql(`delete from "SuporteMensagem" where "conversaId"='tse26'`);
    sql(`update "SuporteConversa" set "ultimaMensagemEm"=now() - interval '30 minutes', "iaPausada"=true, "iaPausaMotivo"='A IA não soube responder', "encerradaEm"=null where id='tse26'`);
    m('tse26c', 'CLIENTE', 31, 'Pergunta difícil'); m('tse26d', 'IA', 30, 'Vou chamar um atendente');
    ok('IA passou o caso e ninguém respondeu: NÃO encerra, por mais tempo que passe', (await encerrar()) === 0 && sql(`select "encerradaEm" is null from "SuporteConversa" where id='tse26'`) === 't');
    // E depois que o Super Admin responde, o relógio passa a correr
    m('tse26e', 'SUPORTE', 12, 'Já vi, vou resolver');
    sql(`update "SuporteConversa" set "ultimaMensagemEm"=now() - interval '12 minutes' where id='tse26'`);
    ok('Super Admin respondeu e o cliente sumiu 12 min: encerra', (await encerrar()) === 1);
    await cS.close(); await cU.close();
  } finally {
    await b.close();
    sql(`delete from "SuporteConversa"`);
    sql(`update "ConfigVenda" set "iaSuporteLigada"=${ligadaAntes === 't' ? 'true' : 'false'} where id='config'`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
