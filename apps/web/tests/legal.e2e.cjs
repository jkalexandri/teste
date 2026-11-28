// Teste da Política de Privacidade e dos Termos de Uso (decisão #88).
// Uso: node apps/web/tests/legal.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
(async () => {
  sql(`delete from "ConfigLegal"`);
  const b = await chromium.launch();
  let p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  // Sem login
  await p.goto(BASE + '/privacidade'); 
  ok('Política pública (sem login)', p.url().endsWith('/privacidade') && (await p.locator('h1:has-text("Política de Privacidade")').count()) === 1);
  ok('Sem dados: mostra "[a preencher]" em vez de inventar', (await p.locator('text=[a preencher pelo responsável]').count()) >= 3);
  ok('Fala da IA, do SAIR e dos direitos da LGPD', (await p.locator('text=não é usado para treinar').count()) === 1 && (await p.locator('text=art. 18 da LGPD').count()) === 1);
  await p.goto(BASE + '/termos');
  ok('Termos públicos', p.url().endsWith('/termos') && (await p.locator('text=não é uma ferramenta oficial do WhatsApp').count()) === 1);
  // Checkout mostra o aceite
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.click('button:has-text("Planos")'); await p.waitForTimeout(800);
  // O Padrão fica na aba Empresarial (decisão #113)
  if (await p.locator('[data-testid=aba-categoria-BUSINESS]').count()) { await p.click('[data-testid=aba-categoria-BUSINESS]'); await p.waitForTimeout(300); }
  await p.click('[aria-label="Planos"] article:has-text("Padrão") >> [data-parte=botao]'); await p.waitForTimeout(400);
  ok('Checkout: aceite com links para Termos e Política', (await p.locator('[data-testid=aceite-termos] a[href="/termos"]').count()) === 1 && (await p.locator('[data-testid=aceite-termos] a[href="/privacidade"]').count()) === 1);
  // Super Admin preenche
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  await p.click('aside nav >> text=Dados legais'); await p.waitForURL('**/dados-legais');
  ok('Aviso de campos vazios', (await p.locator('[data-testid=aviso-legal]').count()) === 1);
  await p.fill('#dl-responsavel', 'Empresa Teste Ltda'); await p.fill('#dl-documento', '00.000.000/0001-00'); await p.fill('#dl-endereco', 'Rua Exemplo, 1 - São Paulo/SP');
  await p.fill('#dl-emailPrivacidade', 'emailruim'); await p.click('button:has-text("Salvar")'); await p.waitForTimeout(800);
  ok('E-mail inválido recusado', (await p.locator('text=Confira os e-mails').count()) === 1);
  await p.fill('#dl-emailPrivacidade', 'privacidade@teste.com'); await p.fill('#dl-encarregadoNome', 'Fulano DPO'); await p.fill('#dl-encarregadoEmail', 'dpo@teste.com'); await p.fill('#dl-foro', 'São Paulo/SP');
  await p.click('button:has-text("Salvar")'); await p.waitForTimeout(1000);
  ok('Dados salvos', sql(`select responsavel||'|'||foro from "ConfigLegal"`) === 'Empresa Teste Ltda|São Paulo/SP');
  await p.goto(BASE + '/privacidade');
  ok('Política mostra os dados do responsável', (await p.locator('text=Empresa Teste Ltda').count()) >= 1 && (await p.locator('text=[a preencher pelo responsável]').count()) === 0);
  await p.screenshot({ path: OUT + '/privacidade.png', fullPage: false });
  sql(`delete from "ConfigLegal"`);
  await b.close();
  console.log(res.join('\n')); console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
