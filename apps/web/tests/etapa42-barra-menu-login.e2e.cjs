// Teste de ponta a ponta da decisão #186: barra de menu do login (Planos e Preços | Fale conosco | Sobre) com o pulso de cometa na borda.
// Uso: node apps/web/tests/etapa42-barra-menu-login.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2] || '/tmp';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch();
  try {
    for (const [nome, w, h] of [['pc', 1440, 900], ['notebook', 1280, 720], ['celular', 390, 844]]) {
      const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
      await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(800);
      const nomes = (await p.locator('[data-testid=barra-menu-login] button').allInnerTexts()).join('|');
      ok(`${nome}: barra com Planos e Preços, Fale conosco e Sobre`, nomes === 'Planos e Preços|Fale conosco|Sobre', nomes);
      const med = await p.evaluate(() => { const c = document.querySelector('.login-card').getBoundingClientRect(); const bar = document.querySelector('[data-testid=barra-menu-login]').getBoundingClientRect(); return { fim: c.bottom, vh: innerHeight, barraTopo: bar.top, barraLarg: bar.width, cardLarg: c.width, barraSobCard: bar.bottom <= c.top + 1 }; });
      ok(`${nome}: o card de login continua inteiro na tela e a barra tem a largura dele`, med.fim <= med.vh && Math.abs(med.barraLarg - med.cardLarg) < 2 && med.barraSobCard, JSON.stringify(med));
      ok(`${nome}: o pulso (canvas) está na barra`, (await p.locator('[data-testid=pulso-menu]').count()) === 1);
      // o canvas desenha: depois de um instante há pixels coloridos
      await espera(1500);
      const pixels = await p.evaluate(() => { const c = document.querySelector('[data-testid=pulso-menu]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; });
      ok(`${nome}: o pulso está sendo desenhado`, pixels > 50, String(pixels));
      const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.login-menu-item')).animationName);
      ok(`${nome}: os nomes pulsam`, anim === 'loginTextoPulso', anim);
      if (nome === 'pc') {
        await p.screenshot({ path: OUT + '/login-barra-pc.png' });
        await p.click('[data-testid=menu-planos]'); await espera(1200);
        ok('Planos e Preços abre o popup de planos', (await p.locator('[aria-label=Planos]').count()) === 1);
        await p.keyboard.press('Escape'); await espera(300);
        await p.click('[data-testid=menu-fale-conosco]'); await espera(1000);
        ok('Fale conosco abre o chat para interessados', (await p.locator('[role=dialog]').count()) >= 1 && /Fale conosco|nome|WhatsApp/i.test(await p.locator('body').innerText()));
        await p.reload({ waitUntil: 'networkidle' }); await espera(500);
        await p.click('[data-testid=menu-sobre]'); await espera(600);
        ok('Sobre abre o popup com os textos do login e os links legais', (await p.locator('[data-testid=popup-sobre]').count()) === 1 && /O futuro do disparo inteligente/.test(await p.locator('[data-testid=popup-sobre]').innerText()) && (await p.locator('[data-testid=popup-sobre] a[href="/termos"]').count()) === 1);
        await p.screenshot({ path: OUT + '/login-sobre.png' });
        await p.keyboard.press('Escape'); await espera(300);
        ok('Esc fecha o Sobre', (await p.locator('[data-testid=popup-sobre]').count()) === 0);
      }
      if (nome === 'celular') await p.screenshot({ path: OUT + '/login-barra-celular.png' });
      await p.context().close();
    }
    // Reduzir movimento: sem pulso e sem animação dos nomes
    const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p2 = await c2.newPage();
    await p2.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1200);
    const px = await p2.evaluate(() => { const c = document.querySelector('[data-testid=pulso-menu]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; });
    ok('Com "reduzir movimento": nada se mexe', px === 0 && (await p2.evaluate(() => getComputedStyle(document.querySelector('.login-menu-item')).animationName)) === 'none');
    await c2.close();
  } catch (e) { ok('Erro inesperado', false, String(e.message).split('\n')[0].slice(0, 160)); }
  finally { await b.close(); }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n')); console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
