// Teste de ponta a ponta da decisão #115, etapa A: Super Admin → Pagamento → Asaas.
// Ambiente, chave de API (só salva se o teste de conexão der certo, guardada criptografada), troca de ambiente e webhook.
// Requer: site em http://localhost:3005 iniciado com ASAAS_URL=http://127.0.0.1:4010 e Postgres com seed.
// O "Asaas de mentira" (tests/asaas-falso.cjs) é ligado por este teste.
// Uso: node apps/web/tests/etapa19a-asaas-config.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const falso = require('./asaas-falso.cjs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 40) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };

(async () => {
  const srv = await falso.iniciar();
  sql(`update "ConfigVenda" set "asaasChave"=null, "asaasConta"=null, "asaasTestadoEm"=null, "asaasAmbiente"='sandbox' where id='config'`);
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  await p.goto(BASE + '/pagamento'); await espera(800);
  const estado = async () => (await p.locator('[data-testid=estado-asaas]').innerText()).replace(/\s+/g, ' ');

  ok('Pagamento mostra o Asaas "Não configurado"', (await estado()).includes('Não configurado'));
  const url = await p.inputValue('#webhook-url'); const token = await p.inputValue('#webhook-token');
  ok('Mostra a URL do webhook', url.endsWith('/api/asaas/webhook'), url);
  ok('Gera o token do webhook (guardado criptografado)', token.startsWith('fp_') && sql(`select "asaasTokenWebhook" from "ConfigVenda" where id='config'`).startsWith('v1:'));

  // Chave errada: não salva
  await p.fill('#asaasChave', '$aact_hmlg_errada'); await p.click('[data-testid=salvar-asaas]');
  ok('Chave recusada pelo Asaas: mostra o erro e não salva', await ate(async () => (await p.locator('[data-testid=erro-asaas]').count()) === 1 && (await p.locator('[data-testid=erro-asaas]').innerText()).includes('recusada')) && sql(`select coalesce("asaasChave",'nulo') from "ConfigVenda" where id='config'`) === 'nulo');
  // Chave de Produção com ambiente Testes: avisa
  await p.fill('#asaasChave', '$aact_prod_teste'); await p.click('[data-testid=salvar-asaas]');
  ok('Chave de Produção no ambiente Testes: avisa', await ate(async () => (await p.locator('[data-testid=erro-asaas]').innerText().catch(() => '')).includes('Produção')));
  // Chave certa
  await p.fill('#asaasChave', '$aact_hmlg_teste'); await p.click('[data-testid=salvar-asaas]');
  ok('Chave certa: conectado à "Conta Teste Sandbox"', await ate(async () => (await estado()).includes('Conectado') && (await estado()).includes('Conta Teste Sandbox')), await estado());
  const salva = sql(`select "asaasChave" from "ConfigVenda" where id='config'`);
  ok('Chave guardada criptografada (não aparece em texto)', salva.startsWith('v1:') && !salva.includes('aact'));
  ok('A chave não volta para a tela', (await p.inputValue('#asaasChave')) === '' && !(await p.content()).includes('$aact_hmlg_teste'));
  // Salvar de novo sem chave (mesmo ambiente): mantém
  await p.click('[data-testid=salvar-asaas]');
  ok('Salvar sem chave nova mantém a atual', await ate(async () => (await p.locator('[data-testid=erro-asaas]').count()) === 0) && sql(`select "asaasChave" from "ConfigVenda" where id='config'`).startsWith('v1:'));
  await p.screenshot({ path: OUT + '/pagamento-asaas.png', fullPage: true });
  // Trocar para Produção sem colar a chave de Produção: pede a chave
  await p.selectOption('#asaasAmbiente', 'producao'); await p.click('[data-testid=salvar-asaas]');
  ok('Trocar para Produção pede a chave de Produção', await ate(async () => (await p.locator('[data-testid=erro-asaas]').innerText().catch(() => '')).includes('Produção')));
  await p.fill('#asaasChave', '$aact_prod_teste'); await p.click('[data-testid=salvar-asaas]');
  ok('Produção conectada', await ate(async () => (await estado()).includes('Conta Teste Produção')) && sql(`select "asaasAmbiente" from "ConfigVenda" where id='config'`) === 'producao');
  // Remover
  await p.click('button:has-text("Remover chave")');
  ok('Remover chave volta para "Não configurado"', await ate(async () => (await estado()).includes('Não configurado')));
  ok('Token do webhook continua o mesmo', (await p.inputValue('#webhook-token')) === token);
  // Endereço do aviso (webhook): token certo responde 200, errado 401
  const aviso = async (tk) => (await fetch(BASE + '/api/asaas/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': tk }, body: JSON.stringify({ event: 'PAYMENT_CREATED' }) })).status;
  ok('Webhook com o token certo responde 200', (await aviso(token)) === 200);
  ok('Webhook com token errado responde 401', (await aviso('fp_errado')) === 401);
  await b.close(); srv.close();

  sql(`update "ConfigVenda" set "asaasChave"=null, "asaasConta"=null, "asaasTestadoEm"=null, "asaasAmbiente"='sandbox' where id='config'`);
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.filter((r) => r.startsWith('PASSOU')).length} passaram, ${res.filter((r) => r.startsWith('FALHOU')).length} falharam`);
})().catch((e) => { console.error(e); process.exit(1); });
