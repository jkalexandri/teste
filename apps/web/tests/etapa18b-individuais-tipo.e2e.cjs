// Teste de ponta a ponta: Super Admin → Usuários Individuais → Novo usuário com o Tipo (Mensal | Por disparo — decisão #113).
// Confere a lista de planos de cada tipo e o limite de disparos da conta criada.
// Requer: app em http://localhost:3005 e Postgres com seed.
// Uso: node apps/web/tests/etapa18b-individuais-tipo.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const suf = Date.now().toString().slice(-6);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 40) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };

(async () => {
  const FREE = sql(`select id from "Plano" where gratis and modulo='INDIVIDUAL' order by ordem limit 1`);
  const antes = sql(`select coalesce("testeDisparos"::text,'null') from "Plano" where id='${FREE}'`);
  sql(`update "Plano" set "testeDisparos"=20, "testeDias"=7 where id='${FREE}'`);
  const conta = (email) => sql(`select coalesce(e."limiteDisparos"::text,'null')||'|'||e."prazoDias" from "Empresa" e join "Usuario" u on u."empresaId"=e.id where u.email='${email}'`);

  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  const abrir = async () => { await p.goto(BASE + '/usuarios-individuais'); await espera(700); await p.click('button:has-text("Novo usuário individual")'); await espera(300); };
  const opcoes = async () => (await p.locator('#ind-plano option').allInnerTexts()).join(' | ');
  const criar = async (email) => {
    await p.fill('#ind-nome', 'Teste Tipo'); await p.fill('#ind-email', email); await p.fill('#ind-whats', '11990001111');
    await p.click('button:has-text("Criar e enviar acesso")');
    return ate(() => sql(`select count(*) from "Usuario" where email='${email}'`) === '1');
  };

  // 1. Tipo "Mensal": só planos sem limite de disparos (o Free por disparo não aparece)
  await abrir();
  ok('Formulário tem o campo Tipo (Mensal | Por disparo)', (await p.locator('#ind-tipo option').allInnerTexts()).join('|').includes('Mensal') && (await p.locator('#ind-tipo option').allInnerTexts()).join('|').includes('Por disparo'));
  let o = await opcoes();
  ok('Mensal lista o Individual e não o Free por disparo', o.includes('Individual') && !o.includes('Free'), o);

  // 2. Tipo "Por disparo": Free com os disparos do teste; conta criada com 20 disparos
  await p.selectOption('#ind-tipo', 'quantidade'); await espera(200);
  o = await opcoes();
  ok('Por disparo lista "Free (teste de 20 disparos)"', o.includes('Free (teste de 20 disparos)'), o);
  await p.screenshot({ path: OUT + '/individual-tipo.png' });
  const e1 = `tipo-disparo-${suf}@x.com`;
  ok('Cria usuário no Free por disparo', await criar(e1));
  ok('Conta com 20 disparos e 7 dias', conta(e1) === '20|7', conta(e1));

  // 3. Free por dias (sem disparos do teste) aparece em Mensal; conta sem limite de disparos
  sql(`update "Plano" set "testeDisparos"=null where id='${FREE}'`);
  await abrir();
  o = await opcoes();
  ok('Mensal lista "Free (teste de 7 dias)"', o.includes('Free (teste de 7 dias)'), o);
  await p.selectOption('#ind-plano', FREE);
  const e2 = `tipo-dias-${suf}@x.com`;
  ok('Cria usuário no Free por dias', await criar(e2));
  ok('Conta sem limite de disparos e 7 dias', conta(e2) === 'null|7', conta(e2));
  await b.close();

  // Limpeza
  sql(`update "Plano" set "testeDisparos"=${antes} where id='${FREE}'`);
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.filter((r) => r.startsWith('PASSOU')).length} passaram, ${res.filter((r) => r.startsWith('FALHOU')).length} falharam`);
})().catch((e) => { console.error(e); try { sql(`update "Plano" set "testeDisparos"=20 where gratis and modulo='INDIVIDUAL'`); } catch {} process.exit(1); });
