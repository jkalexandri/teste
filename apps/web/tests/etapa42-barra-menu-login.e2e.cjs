// Teste de ponta a ponta da decisão #186: barra de menu do login (Planos e Preços | Fale conosco | Sobre) com o pulso de cometa na borda.
// Uso: node apps/web/tests/etapa42-barra-menu-login.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
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
    // Texto do Sobre editável pelo Super Admin (decisão #189)
    sql(`update "ConfigVenda" set "sobreTexto"='' where id='config'`);
    const cs = await b.newContext({ viewport: { width: 1440, height: 900 } }); const ps = await cs.newPage(); ps.on('dialog', (d) => d.accept());
    await ps.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await ps.fill('#email', 'superadmin@disparopro.com.br'); await ps.fill('#senha', 'Super@12345678'); await ps.click('button[type=submit]'); await ps.waitForURL('**/dashboard');
    await ps.goto(BASE + '/planos'); await espera(900);
    ok('Planos tem o cartão "Texto do Sobre" com o estado "texto padrão"', (await ps.locator('[data-testid=editor-sobre]').count()) === 1 && /texto padrão/i.test(await ps.locator('[data-testid=estado-sobre]').innerText()));
    await ps.click('#ev-sobre'); await espera(400);
    await ps.locator('[data-testid=editor-sobreTexto] textarea').fill('Somos a SOBRE-E2E-189, especialista em WhatsApp.\n\nSaiba mais em https://exemplo.com.br/sobre, ou fale conosco.');
    await ps.click('[data-testid=salvar-sobreTexto]'); await espera(1800);
    ok('Salvar grava o texto do Sobre', /SOBRE-E2E-189/.test(sql(`select "sobreTexto" from "ConfigVenda" where id='config'`)));
    const pv = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await pv.goto(BASE + '/login', { waitUntil: 'networkidle' }); await pv.click('[data-testid=menu-sobre]'); await espera(900);
    const txt = await pv.locator('[data-testid=sobre-texto]').innerText();
    ok('O visitante vê o texto escrito pelo Super Admin (e não o padrão)', /SOBRE-E2E-189/.test(txt) && !/Antibloqueio/.test(txt));
    ok('Endereço https vira link, sem levar a vírgula', (await pv.locator('[data-testid=sobre-texto] a[href="https://exemplo.com.br/sobre"]').count()) === 1);
    ok('Termos, Privacidade e versão continuam embaixo', (await pv.locator('[data-testid=popup-sobre] a[href="/privacidade"]').count()) === 1 && /v\d+\.\d+\.\d+/.test(await pv.locator('[data-testid=popup-sobre]').innerText()));
    await pv.screenshot({ path: OUT + '/login-sobre-editado.png' });
    // HTML digitado não é interpretado
    sql(`update "ConfigVenda" set "sobreTexto"='<b>negrito</b><script>window.__x=1</script>' where id='config'`);
    await pv.reload({ waitUntil: 'networkidle' }); await pv.click('[data-testid=menu-sobre]'); await espera(700);
    ok('HTML no texto aparece como texto, sem executar', (await pv.locator('[data-testid=sobre-texto] b').count()) === 0 && (await pv.evaluate(() => window.__x)) === undefined);
    // Voltar ao padrão: salvar vazio
    await ps.goto(BASE + '/planos'); await espera(900);
    await ps.click('#ev-sobre'); await espera(400);
    await ps.locator('[data-testid=editor-sobreTexto] textarea').fill('');
    await ps.click('[data-testid=salvar-sobreTexto]'); await espera(1800);
    ok('Salvar vazio volta ao texto padrão', sql(`select length("sobreTexto") from "ConfigVenda" where id='config'`) === '0');
    await pv.reload({ waitUntil: 'networkidle' }); await pv.click('[data-testid=menu-sobre]'); await espera(700);
    ok('O Sobre volta a mostrar o texto padrão', /Antibloqueio/.test(await pv.locator('[data-testid=sobre-texto]').innerText()));
    await cs.close();
    // Reduzir movimento: sem pulso e sem animação dos nomes
    const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p2 = await c2.newPage();
    await p2.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1200);
    const px = await p2.evaluate(() => { const c = document.querySelector('[data-testid=pulso-menu]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; });
    ok('Com "reduzir movimento": nada se mexe', px === 0 && (await p2.evaluate(() => getComputedStyle(document.querySelector('.login-menu-item')).animationName)) === 'none');
    await c2.close();
  } catch (e) { ok('Erro inesperado', false, String(e.message).split('\n')[0].slice(0, 160)); }
  finally { sql(`update "ConfigVenda" set "sobreTexto"='' where id='config'`); await b.close(); }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n')); console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
