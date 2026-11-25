// Teste de ponta a ponta das decisões #112 e #123: botão "Instalar app" no login, só no celular.
// Android: só aparece quando o Chrome libera a instalação e instala direto. iPhone/apps internos: passo a passo.
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
    const ajudaIos = await p.locator('[data-testid=ajuda-instalar]').innerText();
    ok('iPhone: passo a passo do Safari', ajudaIos.includes('Adicionar à Tela de Início'));
    ok('iPhone: desenho do botão Compartilhar e "Já instalou?"', (await p.locator('[data-testid=ajuda-instalar] .lucide-share').count()) >= 1 && ajudaIos.includes('Já instalou?'));
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
    // Android/Chrome sem a liberação do Chrome (ex.: app já instalado): o botão não aparece (decisão #123, item a)
    [c, p] = await abrir({ ...devices['Pixel 7'] });
    ok('Android sem liberação do Chrome (ou app já instalado): sem o botão', (await p.locator('[data-testid=botao-instalar-app]').count()) === 0);
    // Aviso do Chrome que chega antes de a página carregar não se perde (script no início da página)
    await p.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        const e = new Event('beforeinstallprompt', { cancelable: true });
        e.prompt = async () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' });
        window.dispatchEvent(e);
      });
    });
    await p.reload({ waitUntil: 'networkidle' }); await espera(800);
    ok('Aviso do Chrome que chega cedo não se perde: botão aparece', (await p.locator('[data-testid=botao-instalar-app]').count()) === 1);
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
    ok('Android: abre a janela de instalação do Chrome (instala direto, sem passo a passo)', await p.evaluate(() => window.__abriuJanela === true) && (await p.locator('[data-testid=ajuda-instalar]').count()) === 0);
    ok('Android: depois de instalar, o botão some', (await p.locator('[data-testid=botao-instalar-app]').count()) === 0);
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
