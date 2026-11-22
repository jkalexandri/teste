// Teste de ponta a ponta da Ajuda e da versão (decisões #100 e #101).
// Requer: app em http://localhost:3005 e Postgres com seed. Uso: node apps/web/tests/etapa12b-ajuda.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const VERSAO = 'v' + require('../../../package.json').version;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); await c.addInitScript(() => { window.print = () => { window.__imprimiu = true; }; }); return [c, await c.newPage()]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const manuais = async (p) => { await p.goto(BASE + '/ajuda'); await espera(500); return (await p.locator('[data-testid=manual] h2').allInnerTexts()); };

  // Versão no login (ambiente de teste) e no menu
  let [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(800);
  ok(`Login mostra a versão real (${VERSAO})`, (await p.locator(`text=${VERSAO}`).count()) === 1 && (await p.locator('text=v1.25').count()) === 0);
  await p.screenshot({ path: OUT + '/login.png' });
  // Usuário
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
  ok('Rodapé do menu mostra a versão', (await p.locator('[data-testid=versao-menu]').innerText()).includes(VERSAO));
  ok('Usuário vê só o Manual do Usuário', JSON.stringify(await manuais(p)) === JSON.stringify(['Manual do Usuário']));
  await p.click('text=Manual do Usuário'); await p.waitForURL('**/ajuda/usuario'); await espera(800);
  ok('Manual com índice', (await p.locator('[data-testid=indice] li').count()) >= 8);
  ok('Prints das telas carregam', await p.evaluate(() => { const imgs = [...document.querySelectorAll('.manual img')]; return imgs.length >= 8 && imgs.every((i) => i.complete && i.naturalWidth > 0); }));
  await p.screenshot({ path: OUT + '/ajuda-usuario.png' });
  await p.goto(BASE + '/ajuda/super-admin'); await espera(500);
  ok('Usuário não abre o manual do Super Admin', (await p.locator('.manual').count()) === 0);
  await c.close();

  // Admin
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  ok('Admin vê só o Manual do Admin da Empresa', JSON.stringify(await manuais(p)) === JSON.stringify(['Manual do Admin da Empresa']));
  await c.close();

  // Super Admin
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  const sa = await manuais(p);
  ok('Super Admin vê os 4 manuais e as Novidades', ['Manual do Usuário', 'Manual do Admin da Empresa', 'Manual do Super Admin', 'Manual do Desenvolvedor', 'Novidades (versões)'].every((m) => sa.includes(m)), sa.join(', '));
  await p.goto(BASE + '/ajuda/novidades'); await espera(500);
  ok('Novidades mostra a versão atual', (await p.locator('.manual').innerText()).includes(VERSAO));
  await p.goto(BASE + '/ajuda/super-admin'); await espera(500);
  ok('Botão Baixar PDF / Imprimir', (await p.locator('[data-testid=imprimir-manual]').getAttribute('href')) === '/ajuda/super-admin?imprimir=1');
  await p.goto(BASE + '/ajuda/super-admin?imprimir=1', { waitUntil: 'networkidle' }); await espera(1200);
  ok('Impressão: cabeçalho com quem emitiu e a versão', (await p.locator('[data-testid=cabecalho-impressao]').innerText()).includes('Emitido por') && (await p.locator('[data-testid=cabecalho-impressao]').innerText()).includes(VERSAO));
  ok('Impressão abre sozinha', await p.evaluate(() => !!window.__imprimiu));
  await p.emulateMedia({ media: 'print' });
  const pdf = path.join(OUT, 'manual-super-admin.pdf');
  await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  const paginas = Number(/Pages:\s+(\d+)/.exec(execSync(`pdfinfo ${pdf}`).toString())?.[1] ?? 0);
  const texto = execSync(`pdftotext -layout ${pdf} -`).toString();
  ok('PDF do manual com várias páginas e "Página X de Y"', paginas >= 3 && texto.includes(`Página 1 de ${paginas}`) && texto.includes(`Página ${paginas} de ${paginas}`), String(paginas));
  await c.close();
  await b.close();
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FALHOU')).length;
  console.log(`\n${res.length - f}/${res.length} passaram`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
