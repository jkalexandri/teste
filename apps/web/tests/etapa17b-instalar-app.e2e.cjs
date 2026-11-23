// Teste de ponta a ponta da decisão #112: botão "Instalar app" no login, só no celular.
// Uso: node apps/web/tests/etapa17b-instalar-app.e2e.cjs <pasta-prints>
const { chromium, devices } = require('playwright');
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const IOS_UA = devices['iPhone 13'].userAgent;
const AND_UA = devices['Pixel 7'].userAgent;

(async () => {
  const b = await chromium.launch();
  const abrir = async (opcoes) => { const c = await b.newContext(opcoes); const p = await c.newPage(); await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1000); return [c, p]; };
  try {
    // Computador: sem botão
    let [c, p] = await abrir({ viewport: { width: 1440, height: 900 } });
    ok('Computador: sem o botão', (await p.locator('[data-testid=botao-instalar-app]').count()) === 0);
    ok('Computador: o resto do login continua igual (Planos e Entrar)', (await p.locator('button:has-text("Planos")').count()) === 1 && (await p.locator('button[type=submit]').count()) === 1);
    await c.close();
    // iPhone (Safari): botão + passo a passo
    [c, p] = await abrir({ ...devices['iPhone 13'] });
    ok('iPhone: mostra o botão Instalar app', (await p.locator('[data-testid=botao-instalar-app]').count()) === 1);
    await p.screenshot({ path: OUT + '/instalar-iphone-botao.png' });
    await p.click('[data-testid=botao-instalar-app]'); await espera(400);
    ok('iPhone: passo a passo do Safari', (await p.locator('[data-testid=ajuda-instalar]').innerText()).includes('Adicionar à Tela de Início'));
    await p.screenshot({ path: OUT + '/instalar-iphone-ajuda.png' });
    await c.close();
    // iPhone com Chrome: orienta abrir no Safari
    [c, p] = await abrir({ ...devices['iPhone 13'], userAgent: IOS_UA.replace('Version/', 'CriOS/120.0 Version/') });
    await p.click('[data-testid=botao-instalar-app]'); await espera(400);
    ok('iPhone em outro navegador: "Abra no Safari"', (await p.locator('[data-testid=ajuda-instalar]').innerText()).includes('Abra no Safari'));
    await c.close();
    // Dentro do Instagram: orienta abrir no navegador
    [c, p] = await abrir({ ...devices['Pixel 7'], userAgent: AND_UA + ' Instagram 300.0' });
    await p.click('[data-testid=botao-instalar-app]'); await espera(400);
    ok('Dentro do Instagram/WhatsApp: "Abra no navegador"', (await p.locator('[data-testid=ajuda-instalar]').innerText()).includes('Abra no navegador do celular'));
    await c.close();
    // Android/Chrome: usa a janela de instalação do Chrome
    [c, p] = await abrir({ ...devices['Pixel 7'] });
    await p.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = async () => { window.__abriuJanela = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await espera(300);
    await p.click('[data-testid=botao-instalar-app]'); await espera(600);
    ok('Android: abre a janela de instalação do Chrome', await p.evaluate(() => window.__abriuJanela === true));
    ok('Android: depois de instalar, o botão some', (await p.locator('[data-testid=botao-instalar-app]').count()) === 0);
    await c.close();
    // Android sem o pedido do Chrome: passo a passo do menu ⋮
    [c, p] = await abrir({ ...devices['Pixel 7'] });
    await p.click('[data-testid=botao-instalar-app]'); await espera(400);
    ok('Android sem a janela do Chrome: passo a passo do menu', (await p.locator('[data-testid=ajuda-instalar]').innerText()).includes('três pontinhos'));
    await c.close();
    // App já instalado (aberto pelo ícone): sem botão
    [c, p] = await abrir({ ...devices['Pixel 7'] });
    await p.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('standalone') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q)); });
    await p.reload({ waitUntil: 'networkidle' }); await espera(800);
    ok('App já instalado: sem o botão', (await p.locator('[data-testid=botao-instalar-app]').count()) === 0);
    await c.close();
  } catch (e) {
    ok('Erro inesperado', false, String(e.message).split('\n')[0].slice(0, 160));
  } finally { await b.close(); }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
