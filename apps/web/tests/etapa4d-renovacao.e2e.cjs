// Teste de ponta a ponta da etapa 4d (renovação: agendador diário, link, troca de plano, e-mail existente).
// Requer: app em http://localhost:3005 iniciado com CRON_SECRET=segredo-teste (log em /var/tmp/web.log),
// Postgres local e planos visíveis com preço (rode antes os testes 4a e 4b).
// Uso: node apps/web/tests/etapa4d-renovacao.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo';
const cron = async (auth = true) => {
  const r = await fetch(BASE + '/api/cron/renovacao', { headers: auth ? { authorization: 'Bearer segredo-teste' } : {} });
  return { status: r.status, corpo: await r.json() };
};
const emailsPara = (email, trecho) => fs.readFileSync('/var/tmp/web.log', 'utf8').split('[email de desenvolvimento]').filter(b => b.includes('Para: ' + email) && b.includes(trecho));
(async () => {
  // Estado inicial: Empresa Exemplo vence em 9 dias, sem avisos
  sql(`update "Empresa" set "expiraEm"=(current_date + 9)::timestamp + interval '23 hour 59 minute', "tokenRenovacao"=null, "avisoRenovacao10Em"=null, "avisoRenovacao3Em"=null, pacote='Padrão', "limiteUsuarios"=10, "planoId"=null where id='${EMP}'`);
  sql(`update "Pedido" set status='CANCELADO' where "empresaId"='${EMP}' and status='AGUARDANDO'`);
  const usuariosAntes = sql(`select count(*) from "Usuario" where "empresaId"='${EMP}'`);

  const semAuth = await cron(false);
  ok('Agendador recusa chamada sem o segredo', semAuth.status === 401);
  const antes10 = emailsPara('admin-empresa@empresaexemplo.com.br', 'vence em 9 dias').length;
  const r1 = await cron();
  ok('Aviso de 10 dias enviado', r1.corpo.enviados10 >= 1, JSON.stringify(r1.corpo));
  ok('E-mail com link de renovação para o Admin', emailsPara('admin-empresa@empresaexemplo.com.br', 'vence em 9 dias').length === antes10 + 1);
  const r2 = await cron();
  ok('Não repete o aviso de 10 dias', sql(`select count(*) from "Empresa" where id='${EMP}' and "avisoRenovacao3Em" is null`) === '1' && emailsPara('admin-empresa@empresaexemplo.com.br', 'vence em 9 dias').length === antes10 + 1);
  sql(`update "Empresa" set "expiraEm"=(current_date + 2)::timestamp + interval '23 hour' where id='${EMP}'`);
  const r3 = await cron();
  ok('Lembrete de 3 dias enviado', r3.corpo.enviados3 >= 1, JSON.stringify(r3.corpo));
  const token = sql(`select "tokenRenovacao" from "Empresa" where id='${EMP}'`);
  ok('Link usa o token da conta', emailsPara('admin-empresa@empresaexemplo.com.br', '/renovar/' + token).length >= 2);

  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', d => d.accept());
  await p.goto(BASE + '/renovar/' + token, { waitUntil: 'networkidle' });
  ok('Página de renovação mostra a conta', (await p.locator('body').innerText()).includes('Empresa Exemplo'));
  const nomes = await p.locator('article h3').allInnerTexts();
  ok('Só planos do mesmo módulo (empresariais)', nomes.length >= 1 && !nomes.some(n => /Individual|Free/.test(n)), nomes.join(', '));
  await p.screenshot({ path: OUT + '/renovar.png' });
  await p.click('article:has-text("Básico") >> button'); await p.waitForTimeout(1500);
  ok('PIX de renovação gerado', (await p.locator('text=seu acesso será renovado').count()) === 1);
  const expAntes = sql(`select "expiraEm"::date from "Empresa" where id='${EMP}'`);
  // Super Admin confirma
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Entrar como Super Admin'); await p.waitForURL('**/dashboard');
  await p.goto(BASE + '/pedidos');
  const linha = 'tr:has-text("Renovação"):has-text("Básico")';
  ok('Pedido marcado como Renovação na lista', (await p.locator(linha).count()) >= 1);
  await p.click(`${linha} >> button:has-text("Confirmar pagamento")`); await p.waitForTimeout(1800);
  const r = sql(`select pacote||'|'||"limiteUsuarios"||'|'||("expiraEm"::date - '${expAntes}'::date)||'|'||coalesce("tokenRenovacao",'nulo')||'|'||coalesce("avisoRenovacao10Em"::text,'nulo') from "Empresa" where id='${EMP}'`);
  ok('Renovação troca o plano, soma 31 dias e zera os avisos', r === 'Básico|3|31|nulo|nulo', r);
  ok('E-mail de renovação confirmada', emailsPara('admin-empresa@empresaexemplo.com.br', 'foi renovado até').length >= 1);
  ok('Usuários da empresa continuam', sql(`select count(*) from "Usuario" where "empresaId"='${EMP}'`) === usuariosAntes);
  await p.goto(BASE + '/renovar/' + token, { waitUntil: 'networkidle' });
  ok('Link antigo deixa de valer', (await p.locator('text=inválido ou já foi utilizado').count()) === 1);
  await c.close();

  // Compra pela tela de Planos com e-mail existente (decisão #44)
  const comprar = async (email, plano) => fetch(BASE + '/api/pedidos', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planoId: sql(`select id from "Plano" where nome='${plano}'`), nome: 'Cliente Atual', email, whatsapp: '11987654321' }) }).then(async x => ({ s: x.status, d: await x.json() }));
  const a = await comprar('usuario@disparopro.com.br', 'Individual');
  ok('Individual existente: compra vira renovação', a.s === 200 && a.d.renovacao === true, JSON.stringify(a.d).slice(0, 80));
  ok('Pedido ligado à conta existente', sql(`select count(*) from "Pedido" where codigo='${a.d.codigo}' and renovacao and "empresaId"='teste-conta-individual'`) === '1');
  const m = await comprar('usuario@disparopro.com.br', 'Padrão');
  ok('Plano de outro módulo é recusado', m.s === 409 && m.d.erro.includes('módulo Individual'), m.d.erro);
  const u = await comprar('ana@empresaexemplo.com.br', 'Básico');
  ok('Usuário comum de empresa não renova (só o Admin)', u.s === 409 && u.d.erro.includes('administrador'), u.d.erro);
  sql(`update "Pedido" set status='CANCELADO' where codigo='${a.d.codigo}'`);

  console.log(res.join('\n')); await b.close();
})();
