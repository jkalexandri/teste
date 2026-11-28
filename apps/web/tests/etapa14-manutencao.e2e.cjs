// Teste de ponta a ponta da decisão #103: modo manutenção durante as atualizações.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa14-manutencao.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ligar = () => sql(`insert into "Manutencao"(id,ligada,desde) values ('geral',true,now()) on conflict (id) do update set ligada=true, desde=now()`);
const desligar = () => sql(`insert into "Manutencao"(id,ligada) values ('geral',false) on conflict (id) do update set ligada=false, desde=null`);

(async () => {
  desligar();
  sql(`delete from "Lead" where codigo like 'TL14-%'`);
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  try {
    // Usuário já dentro do sistema quando a atualização começa
    let [cU, pU] = await novo();
    await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
    await pU.goto(BASE + '/leads'); await espera(800);
    await pU.click('[data-testid=botao-suporte]');
    await pU.fill('[aria-label="Mensagem para o suporte"]', 'Texto que não pode se perder');
    let [cS, pS] = await novo();
    await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');

    ligar();
    await espera(3500); // cache do estado (3 s)
    // Ação no servidor é recusada (rota da API e ação de formulário)
    const api = await pU.evaluate(async () => { const r = await fetch('/api/suporte', { method: 'POST', body: new FormData() }); return [r.status, (await r.json()).mensagem]; });
    ok('Rota da API recusada na manutenção', api[0] === 503 && /atualização/.test(api[1]), api.join(' '));
    const acao = await pU.evaluate(async () => (await fetch('/leads', { method: 'POST', headers: { 'next-action': 'x' } })).status);
    ok('Ação de formulário recusada na manutenção', acao === 503, String(acao));
    // A tela de atualização aparece para quem já estava dentro (no próximo sinal de presença)
    await pU.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await espera(1500);
    ok('Quem já estava dentro vê "Sistema em atualização"', (await pU.locator('[data-testid=tela-manutencao]').count()) === 1);
    await pU.screenshot({ path: OUT + '/manutencao-dentro.png' });
    // Abrir outra tela: só a tela de atualização (a página não carrega)
    await pU.goto(BASE + '/campanhas'); await espera(1200);
    ok('Página nova mostra só a tela de atualização', (await pU.locator('[data-testid=tela-manutencao]').count()) === 1 && (await pU.locator('text=Nova campanha').count()) === 0);
    // Super Admin continua usando e vê a faixa
    await pS.goto(BASE + '/dashboard'); await espera(800);
    ok('Super Admin não fica bloqueado', (await pS.locator('[data-testid=tela-manutencao]').count()) === 0);
    ok('Super Admin vê a faixa de manutenção', (await pS.locator('[data-testid=faixa-manutencao]').count()) === 1);
    const saApi = await pS.evaluate(async () => (await fetch('/api/suporte/x')).status);
    ok('Rotas do Super Admin funcionam na manutenção', saApi !== 503, String(saApi));
    await pS.screenshot({ path: OUT + '/manutencao-sa.png' });

    // Login: aviso por cima, só o Super Admin entra
    let [cL, pL] = await novo();
    await pL.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(800);
    ok('Login mostra o aviso de atualização', (await pL.locator('[data-testid=tela-manutencao]').count()) === 1);
    await pL.screenshot({ path: OUT + '/manutencao-login.png' });
    await pL.click('text=Sou Super Admin — entrar para conferir');
    await pL.click('text=Módulo Business');
    await pL.fill('#email', 'admin-empresa@empresaexemplo.com.br'); await pL.fill('#senha', 'Admin@12345678'); await pL.click('button[type=submit]'); await espera(1500);
    ok('Cliente não consegue entrar na manutenção', !pL.url().includes('/dashboard') && (await pL.locator('text=Sistema em atualização').count()) >= 1);
    await cL.close();
    [cL, pL] = await novo();
    await pL.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(800);
    await pL.click('text=Sou Super Admin — entrar para conferir');
    await pL.fill('#email', 'superadmin@disparopro.com.br'); await pL.fill('#senha', 'Super@12345678'); await pL.click('button[type=submit]');
    await pL.waitForURL('**/dashboard', { timeout: 8000 }).catch(() => undefined);
    ok('Super Admin entra na manutenção', pL.url().includes('/dashboard'));
    await cL.close();

    // Leads de anúncios continuam sendo recebidos (guardados para depois)
    const tokAntes = sql(`select coalesce("tokenAnuncios",'') from "Usuario" where email='superadmin@disparopro.com.br'`);
    const tok = tokAntes || 'tok-manutencao-etapa14-abcdef';
    if (!tokAntes) sql(`update "Usuario" set "tokenAnuncios"='${tok}' where email='superadmin@disparopro.com.br'`);
    {
      const st = await pS.evaluate(async (t) => (await fetch('/api/anuncios/' + t, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: 'Lead Manutenção', telefone: '11990014141' }) })).status, tok);
      ok('Lead de anúncio é guardado na manutenção', st < 300, String(st));
      await espera(1500);
      ok('Lead de anúncio fica esperando (IA não atende na manutenção)', sql(`select status from "LeadAnuncio" where nome='Lead Manutenção'`) === 'RECEBIDO');
      if (!tokAntes) sql(`update "Usuario" set "tokenAnuncios"=null where email='superadmin@disparopro.com.br'`);
    }

    // Fim da atualização: a tela some sozinha e o texto do chat volta
    desligar(); await espera(3500);
    await pU.goto(BASE + '/leads'); // volta para a tela anterior (a tela de atualização recarrega sozinha)
    await espera(1500);
    ok('Depois da atualização o sistema volta ao normal', (await pU.locator('[data-testid=tela-manutencao]').count()) === 0);
    await pU.click('[data-testid=botao-suporte]'); await espera(800);
    ok('Texto digitado no chat não se perde', (await pU.inputValue('[aria-label="Mensagem para o suporte"]')) === 'Texto que não pode se perder');
    const depois = await pU.evaluate(async () => (await fetch('/api/suporte')).status);
    ok('Ações liberadas depois', depois === 200, String(depois));

    // Super Admin desliga pela faixa
    ligar(); await espera(3500);
    await pS.reload(); await espera(800);
    await pS.click('[data-testid=faixa-manutencao] button:has-text("Liberar o sistema")'); await espera(1500);
    ok('Super Admin libera o sistema pela faixa', sql(`select ligada from "Manutencao" where id='geral'`) === 'f');
    await cU.close(); await cS.close();
  } finally {
    desligar();
    sql(`delete from "LeadAnuncio" where nome='Lead Manutenção'`);
    await b.close();
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
