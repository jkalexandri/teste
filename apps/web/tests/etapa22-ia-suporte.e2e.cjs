// Teste de ponta a ponta da IA no suporte dos clientes (decisão #146), com a IA "simulado".
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa22-ia-suporte.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (f, ms = 15000) => { for (let i = 0; i < ms / 300; i++) { if (await f()) return true; await espera(300); } return false; };

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const configIA = sql(`select provedor||'|'||modelo from "ConfigIA" where tarefa='conversar'`);
  const ligadaAntes = sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) || 'f';
  sql(`delete from "SuporteConversa"`);
  // IA simulada (sem custo) durante o teste
  if (configIA) sql(`update "ConfigIA" set provedor='simulado', modelo='simulado', chave=null where tarefa='conversar'`);
  else sql(`insert into "ConfigIA"(tarefa,provedor,modelo,"urlBase","precoEntrada","precoSaida","atualizadoEm") values ('conversar','simulado','simulado','',0,0,now())`);
  sql(`update "ConfigVenda" set "iaSuporteLigada"=false where id='config'`);

  const b = await chromium.launch();
  const novo = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const escrever = async (p, texto) => { await p.fill('[aria-label="Mensagem para o suporte"]', texto); await p.click('[data-testid=janela-suporte] button:has-text("Enviar")'); };
  const ia = () => Number(sql(`select count(*) from "SuporteMensagem" m join "SuporteConversa" c on c.id=m."conversaId" where c."usuarioId"='${ANA}' and m.autor='IA'`));

  try {
    const [cS, pS] = await novo(); await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    const [cU, pU] = await novo(); await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');

    // ===== Chave geral: começa desligada =====
    await pS.goto(BASE + '/atendimento'); await espera(800);
    ok('Chave da IA no suporte começa desligada', (await pS.locator('[data-testid=ia-suporte-estado]').innerText()) === 'desligada');
    // Desligada: cliente escreve e a IA NÃO responde
    await pU.click('[data-testid=botao-suporte]');
    await escrever(pU, 'Como conecto o meu WhatsApp?'); await espera(6500);
    ok('Com a IA desligada, ninguém responde sozinho', ia() === 0);

    // ===== Liga a chave =====
    await pS.click('[data-testid=ia-suporte-alternar]'); await espera(1500);
    ok('Ligar a IA grava a chave geral', sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) === 't');
    ok('A tela mostra "ligada"', (await pS.locator('[data-testid=ia-suporte-estado]').innerText()) === 'ligada');

    // ===== IA responde =====
    await escrever(pU, 'Como conecto o meu WhatsApp?');
    ok('A IA responde o cliente em poucos segundos', await ate(() => ia() === 1));
    ok('Cliente vê a resposta com o rótulo "Assistente virtual (IA)"', await ate(async () => (await pU.locator('[data-testid=janela-suporte] >> text=Assistente virtual (IA)').count()) >= 1, 8000));
    ok('A resposta usa o manual (QR Code)', (await pU.locator('[data-testid=janela-suporte] >> text=QR Code').count()) >= 1);
    ok('Conversa segue com a IA atendendo', sql(`select "iaPausada" from "SuporteConversa" where "usuarioId"='${ANA}'`) === 'f');
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1500);
    ok('Super Admin vê "IA atendendo" e a mensagem da IA do lado dele', (await pS.locator('[data-testid=ia-suporte-conversa]').innerText()) === 'IA atendendo' && (await pS.locator('[data-testid=chat-mensagens] >> text=QR Code').count()) >= 1);
    await pS.screenshot({ path: OUT + '/ia-suporte-atendendo.png' });

    // ===== Assunto sensível: passa para o atendente, sem IA =====
    await escrever(pU, 'Quero cancelar o meu plano');
    ok('Assunto sensível: avisa o cliente que um atendente vai responder', await ate(async () => (await pU.locator('[data-testid=janela-suporte] >> text=Vou chamar um atendente').count()) >= 1, 12000));
    ok('A IA pausou com o motivo', await ate(() => /Assunto que fica com o atendente/.test(sql(`select coalesce("iaPausaMotivo",'') from "SuporteConversa" where "usuarioId"='${ANA}'`)), 4000));
    const antes = ia();
    await escrever(pU, 'Alguém aí?'); await espera(6500);
    ok('Com a IA pausada, nova mensagem não é respondida por ela', ia() === antes);
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1500);
    ok('Super Admin vê "Com você" e o motivo', /Com você/.test(await pS.locator('[data-testid=ia-suporte-conversa]').innerText()));
    await pS.screenshot({ path: OUT + '/ia-suporte-com-voce.png' });

    // ===== Devolver para a IA =====
    await pS.click('[data-testid=painel-chat] button:has-text("Devolver para a IA")'); await espera(1500);
    ok('Devolver para a IA tira a pausa', sql(`select "iaPausada" from "SuporteConversa" where "usuarioId"='${ANA}'`) === 'f');

    // ===== Super Admin escreve: assume =====
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1200);
    await pS.fill('[aria-label="Mensagem para o suporte"]', 'Oi, aqui é o suporte. Já vejo isso para você.');
    await pS.click('[data-testid=chat-suporte] button:has-text("Enviar")'); await espera(1200);
    const assumida = sql(`select "iaPausada"||'|'||coalesce("iaPausaMotivo",'') from "SuporteConversa" where "usuarioId"='${ANA}'`);
    ok('Quando o Super Admin escreve, a IA pausa (assumida)', assumida === 'true|Assumida pelo Super Admin', assumida + ' / msgs: ' + sql(`select string_agg(autor,',' order by "criadoEm") from "SuporteMensagem" m join "SuporteConversa" c on c.id=m."conversaId" where c."usuarioId"='${ANA}'`));

    // ===== Desligar a chave =====
    await pS.goto(BASE + '/atendimento'); await espera(800);
    await pS.click('[data-testid=ia-suporte-alternar]'); await espera(1200);
    ok('Desligar a IA grava a chave geral', sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) === 'f');

    // ===== Controle de acesso: cliente não liga a IA =====
    const r = await pU.evaluate(async () => (await fetch('/api/suporte/ia', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ligada: true }) })).status);
    ok('Cliente não consegue ligar a chave geral', r !== 200 && sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) === 'f', String(r));
    await cS.close(); await cU.close();
  } finally {
    await b.close();
    sql(`update "ConfigVenda" set "iaSuporteLigada"=${ligadaAntes === 't' ? 'true' : 'false'} where id='config'`);
    if (configIA) { const [p, m] = configIA.split('|'); sql(`update "ConfigIA" set provedor='${p}', modelo='${m}' where tarefa='conversar'`); } else sql(`delete from "ConfigIA" where tarefa='conversar'`);
    sql(`delete from "SuporteConversa"`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
