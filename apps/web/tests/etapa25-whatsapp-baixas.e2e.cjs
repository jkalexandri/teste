// Teste de ponta a ponta das baixas do Módulo 4 (decisão #155): B1 (aba escondida não consulta o servidor) e B2 ("Conectado desde"
// mantém a data e aparece a última reconexão). Requer: app em http://localhost:3005, serviço 24/7 no ar e Postgres com seed.
// Uso: node apps/web/tests/etapa25-whatsapp-baixas.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => { const l = `${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`; res.push(l); console.error(l); };
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const USU = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  sql(`delete from "WhatsappSessao" where id='${USU}'`);
  sql(`insert into "WhatsappSessao"(id,"usuarioId",status,numero,"conectadoEm","atualizadoEm") values ('${USU}','${USU}','CONECTADO','5511999990000', now() - interval '2 days', now())`);
  const b = await chromium.launch();
  try {
    const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage();
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', 'usuario@disparopro.com.br'); await p.fill('#senha', 'User@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
    let consultas = 0;
    p.on('request', (r) => { if (r.url().includes('/api/whatsapp/proprio') && r.method() === 'GET') consultas++; });
    await p.goto(BASE + '/whatsapp'); await espera(1500);

    // ===== B1: aba visível consulta; escondida, não =====
    const antesVisivel = consultas; await espera(7000);
    ok('Aba visível: a tela consulta o servidor (a cada 3 s)', consultas - antesVisivel >= 2, String(consultas - antesVisivel));
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await espera(500); const aoEsconder = consultas; await espera(7000);
    ok('Aba escondida: NÃO consulta o servidor', consultas === aoEsconder, String(consultas - aoEsconder));
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await espera(800);
    ok('Ao voltar para a aba, consulta na hora', consultas > aoEsconder, String(consultas - aoEsconder));

    // ===== B2: "Conectado desde" original + última reconexão =====
    const desde = sql(`select to_char("conectadoEm" at time zone 'America/Sao_Paulo','DD/MM') from "WhatsappSessao" where id='${USU}'`);
    await p.reload(); await espera(1500);
    ok('Sem reconexão: mostra "Conectado desde" e NÃO mostra "Última reconexão"', /Conectado desde/.test(await p.locator('body').innerText()) && (await p.locator('[data-testid=ultima-reconexao]').count()) === 0);
    sql(`update "WhatsappSessao" set "reconectadoEm"=now() where id='${USU}'`);
    await p.reload(); await espera(1500);
    const texto = await p.locator('main').innerText();
    ok('Depois de reconexão: o "Conectado desde" continua o de 2 dias atrás', texto.includes(`Conectado desde ${desde}`), desde);
    ok('E aparece "Última reconexão"', (await p.locator('[data-testid=ultima-reconexao]').count()) === 1 && /Última reconexão: \d\d\/\d\d/.test(await p.locator('[data-testid=ultima-reconexao]').innerText()));
    await p.screenshot({ path: OUT + '/whatsapp-ultima-reconexao.png', clip: { x: 230, y: 60, width: 1050, height: 330 } });
    await c.close();
  } finally {
    await b.close();
    sql(`delete from "WhatsappSessao" where id='${USU}'`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
