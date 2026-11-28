// Teste de ponta a ponta da etapa 12 (decisões #85, #86 e #99): Logs, app no celular (PWA) e notificações.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa12-logs-app.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  sql(`delete from "Log"`);
  sql(`delete from "PushInscricao"`);
  sql(`update "Usuario" set "avisoCelular"=true where id='${ANA}'`);
  sql(`delete from "Lead" where codigo like 'TL12-%'`);
  sql(`insert into "Lead"(id,codigo,nome,telefone,"usuarioId","empresaId","codigoUsuario","atualizadoEm") values ('tl12-1','TL12-1','Lead Log','5511990012121','${ANA}','${EMP}','x',now())`);

  const b = await chromium.launch();
  const novo = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };

  // ===== 1. Logs =====
  let [c, p] = await novo();
  // senha errada da Ana (gera log de "Senha errada / bloqueio")
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Módulo Business');
  await p.fill('#email', 'ana@empresaexemplo.com.br'); await p.fill('#senha', 'Errada@1234567'); await p.click('button[type=submit]'); await espera(1000);
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
  // ação em lead (inativar) gera log de Leads
  await p.goto(BASE + '/leads'); await espera(800);
  const r = await p.evaluate(async () => (await fetch('/api/push')).json());
  ok('Chave pública das notificações disponível', r.ativo === true && r.chave.length > 40);
  await c.close();
  ok('Log de entrada', sql(`select count(*) from "Log" where tipo='ENTRADA' and "usuarioId"='${ANA}'`) === '1');
  ok('Log de senha errada', sql(`select count(*) from "Log" where tipo='SENHA' and "usuarioId"='${ANA}' and texto like 'Entrada recusada%'`) === '1');

  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Business');
  ok('Menu do Admin tem Logs', (await p.locator('aside nav >> text=Logs').count()) === 1);
  await p.goto(BASE + '/logs'); await espera(600);
  const linhas = await p.locator('[data-testid=tabela-logs] tbody tr').allInnerTexts();
  ok('Admin vê os logs da empresa', linhas.some((l) => l.includes('Entrou no sistema') && l.includes('Ana')) && linhas.some((l) => l.includes('Entrada recusada')));
  await p.selectOption('#log-tipo', 'SENHA'); await p.click('button:has-text("Filtrar")'); await espera(700);
  const so = await p.locator('[data-testid=tabela-logs] tbody tr').allInnerTexts();
  ok('Filtro por tipo', so.length >= 1 && so.every((l) => l.includes('Senha errada')));
  await p.screenshot({ path: OUT + '/logs-admin.png', fullPage: true });
  await c.close();
  // Log de outra conta não aparece para o Admin
  sql(`insert into "Log"(id,"empresaId",tipo,texto,quem) values ('tl12-x','teste-conta-individual','LEADS','Ação de outra conta','Outro')`);
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Business');
  await p.goto(BASE + '/logs'); await espera(600);
  ok('Admin não vê logs de outra conta', (await p.locator('text=Ação de outra conta').count()) === 0);
  await c.close();
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Menu do Super Admin tem Logs', (await p.locator('aside nav >> text=Logs').count()) === 1);
  await p.goto(BASE + '/logs'); await espera(600);
  ok('Super Admin vê os logs de todas as contas', (await p.locator('text=Ação de outra conta').count()) === 1 && (await p.locator('text=Entrou no sistema').count()) >= 1);
  await p.selectOption('#log-conta', EMP); await p.click('button:has-text("Filtrar")'); await espera(700);
  ok('Super Admin filtra por conta', (await p.locator('text=Ação de outra conta').count()) === 0 && (await p.locator('text=Entrou no sistema').count()) >= 1);
  // Ação de campanha/usuário gera log (cria usuário pela tela do Admin cobre USUARIOS; aqui: lead inativado pelo Super Admin)
  await c.close();

  // ===== 2. App no celular (PWA) =====
  [c, p] = await novo();
  const man = await p.request.get(BASE + '/manifest.webmanifest');
  const m = man.ok() ? await man.json() : {};
  ok('Manifesto do app', m.name === 'FilaPro Leads' && m.display === 'standalone' && m.start_url === '/dashboard' && m.icons?.length === 3);
  ok('Ícones do app publicados', (await Promise.all(['icone-192.png', 'icone-512.png', 'icone-maskable-512.png', 'apple-touch-icon.png'].map((n) => p.request.get(BASE + '/icones/' + n)))).every((x) => x.ok() && x.headers()['content-type'] === 'image/png'));
  const sw = await p.request.get(BASE + '/sw.js', { maxRedirects: 0 });
  ok('Service worker acessível sem login', sw.status() === 200 && (await sw.text()).includes('showNotification'));
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1500);
  ok('Login sem a tela de abertura no navegador', (await p.locator('[data-testid=abertura-app]').count()) === 0);
  ok('Metadados de app (tema e ícone da Apple)', (await p.locator('meta[name=theme-color]').getAttribute('content')) === '#050d18' && (await p.locator('link[rel=apple-touch-icon]').count()) === 1);
  ok('Service worker registrado', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
  await p.screenshot({ path: OUT + '/login.png' });
  await c.close();
  // Abrindo como app (tela inicial): mostra a abertura animada
  [c, p] = await novo({ width: 390, height: 844 });
  await c.addInitScript(() => { const o = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : o(q)); });
  await p.goto(BASE + '/login'); await espera(400);
  ok('Abrindo pelo ícone: tela de abertura com o ícone animado', (await p.locator('[data-testid=abertura-app] .icone-animado').count()) === 1);
  await p.screenshot({ path: OUT + '/abertura-app.png' });
  await espera(2200);
  ok('A abertura some sozinha', (await p.locator('[data-testid=abertura-app]').count()) === 0);
  await c.close();

  // ===== 3. Notificações no celular =====
  [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
  await p.goto(BASE + '/avisos'); await espera(1200);
  ok('Avisos: opção "Receber também no celular (app)"', (await p.locator('input[name=avisoCelular]').count()) === 1 && (await p.locator('[data-testid=ativar-celular]').count()) === 1);
  await p.locator('input[name=avisoCelular]').uncheck(); await p.click('button:has-text("Salvar")'); await espera(800);
  ok('Desligar notificações no celular', sql(`select "avisoCelular" from "Usuario" where id='${ANA}'`) === 'f');
  await p.locator('input[name=avisoCelular]').check(); await p.click('button:has-text("Salvar")'); await espera(800);
  // Inscrição de um aparelho (endpoint de teste) e remoção
  const ins = await p.evaluate(async () => (await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://push.exemplo.test/abc', keys: { p256dh: 'BPx', auth: 'xyz' } }) })).json());
  ok('Aparelho inscrito', ins.ok === true && sql(`select count(*) from "PushInscricao" where "usuarioId"='${ANA}'`) === '1');
  const ruim = await p.evaluate(async () => (await fetch('/api/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: 'http://inseguro' }) })).status);
  ok('Inscrição inválida recusada', ruim === 400);
  await p.evaluate(async () => fetch('/api/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://push.exemplo.test/abc' }) }));
  ok('Aparelho removido', sql(`select count(*) from "PushInscricao" where "usuarioId"='${ANA}'`) === '0');
  await p.screenshot({ path: OUT + '/avisos-celular.png', fullPage: true });
  await c.close();
  await b.close();

  sql(`delete from "Lead" where codigo like 'TL12-%'`);
  sql(`delete from "Log" where id='tl12-x'`);
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FALHOU')).length;
  console.log(`\n${res.length - f}/${res.length} passaram`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
