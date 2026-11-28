// Teste de ponta a ponta da decisão #183 (Etapa 1): categorias do popup Planos (Individual, Business, Redes Sociais, Redes Sociais + Disparos),
// campo "Categoria" no cadastro, regras por tipo de conta e nome "Business". Usa planos próprios (T40*) apagados no fim.
// Uso: node apps/web/tests/etapa40-categorias-planos.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2] || '/tmp';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const antes = sql(`select coalesce(json_agg(json_build_object('id',id,'visivel',visivel,'destaque',destaque,'categoria',categoria)),'[]') from "Plano"`);
  sql(`delete from "Plano" where nome like 'T40%'`);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on('dialog', (d) => d.accept());
  try {
    ok('Planos já existentes migraram: Free/Individual em Individual e Empresariais em Business',
      sql(`select count(*) from "Plano" where (modulo='EMPRESARIAL' and categoria<>'BUSINESS') or (modulo='INDIVIDUAL' and categoria<>'INDIVIDUAL') and nome not like 'T40%'`) === '0');
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
    await p.goto(BASE + '/planos'); await espera(800);

    // Novo plano em Redes Sociais (conta Business) e em Redes Sociais + Disparos (conta Individual)
    await p.click('button:has-text("+ Novo plano")');
    await p.fill('#novo-nome', 'T40 Redes Business'); await p.selectOption('#novo-modulo', 'EMPRESARIAL'); await p.selectOption('#novo-categoria', 'REDES'); await p.click('button:has-text("Criar")'); await espera(1200);
    ok('Novo plano de Redes Sociais (Business) criado com a categoria', sql(`select categoria||'|'||modulo from "Plano" where nome='T40 Redes Business'`) === 'REDES|EMPRESARIAL');
    await p.click('button:has-text("+ Novo plano")');
    await p.fill('#novo-nome', 'T40 Redes Disparos Ind'); await p.selectOption('#novo-modulo', 'INDIVIDUAL'); await p.selectOption('#novo-categoria', 'REDES_DISPAROS'); await p.click('button:has-text("Criar")'); await espera(1200);
    ok('Novo plano de Redes Sociais + Disparos (Individual) criado', sql(`select categoria||'|'||modulo from "Plano" where nome='T40 Redes Disparos Ind'`) === 'REDES_DISPAROS|INDIVIDUAL');
    await p.click('button:has-text("+ Novo plano")');
    await p.fill('#novo-nome', 'T40 Automatico'); await p.selectOption('#novo-modulo', 'EMPRESARIAL'); await p.click('button:has-text("Criar")'); await espera(1200);
    ok('Sem escolher categoria: conta Business vira categoria Business', sql(`select categoria from "Plano" where nome='T40 Automatico'`) === 'BUSINESS');
    ok('A tabela mostra categoria e tipo de conta (Business, não Empresarial)', /Redes Sociais • Business/.test(await p.locator('tr', { hasText: 'T40 Redes Business' }).locator('[data-testid=aba-do-plano]').innerText()) && !(await p.locator('tbody').innerText()).includes('Empresarial'));

    // Editar: o seletor só oferece as categorias do tipo de conta
    await p.locator('tr', { hasText: 'T40 Automatico' }).locator('button:has-text("Editar")').click(); await espera(400);
    const opcoes = await p.locator('#f-categoria option').allInnerTexts();
    ok('Conta Business oferece Business, Redes Sociais e Redes Sociais + Disparos (não Individual)', opcoes.join('|') === 'Business|Redes Sociais|Redes Sociais + Disparos', opcoes.join('|'));
    await p.selectOption('#f-categoria', 'REDES_DISPAROS'); await p.fill('#f-precoAtual', '349,90'); await p.check('#f-limiteLeads-ilimitado').catch(() => undefined);
    await p.click('button:has-text("Salvar plano")'); await espera(1200);
    ok('Mudar a categoria no cadastro grava', sql(`select categoria from "Plano" where nome='T40 Automatico'`) === 'REDES_DISPAROS');
    // Regra no servidor: Individual não pode ser categoria Business
    sql(`update "Plano" set categoria='INDIVIDUAL' where nome='T40 Redes Disparos Ind'`);

    // Deixar visíveis com preço e conferir o popup do visitante
    sql(`update "Plano" set visivel=true, "precoAtual"=3990 where nome in ('T40 Redes Business','T40 Redes Disparos Ind') `);
    sql(`update "Plano" set categoria='REDES' where nome='T40 Redes Business'; update "Plano" set categoria='REDES_DISPAROS' where nome='T40 Redes Disparos Ind'`);
    const v = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await v.goto(BASE + '/login', { waitUntil: 'networkidle' }); await v.click('button:has-text("Planos")'); await espera(1200);
    ok('Popup mostra as 4 categorias como abas', (await v.locator('[data-testid^=aba-categoria-]').count()) === 4);
    const nomes = await v.locator('[data-testid^=aba-categoria-]').allInnerTexts();
    ok('Abas: Individual, Business, Redes Sociais, Redes Sociais + Disparos', /Individual/.test(nomes[0]) && /Business/.test(nomes[1]) && /Redes Sociais/.test(nomes[2]) && /Redes Sociais \+ Disparos/.test(nomes[3]), nomes.map((n) => n.split('\n')[0]).join('|'));
    ok('Individual mostra Free e Individual juntos', (await v.locator('[data-testid=grade-planos] article:has-text("Free")').count()) >= 1 && (await v.locator('[data-testid=grade-planos] article:has-text("Individual")').count()) >= 1);
    await v.screenshot({ path: OUT + '/categorias-individual.png' });
    await v.click('[data-testid=aba-categoria-BUSINESS]'); await espera(400);
    ok('Business não mostra os planos de Redes Sociais', (await v.locator('article:has-text("T40 Redes")').count()) === 0 && (await v.locator('[data-testid=grade-planos] article').count()) >= 1);
    await v.screenshot({ path: OUT + '/categorias-business.png' });
    await v.click('[data-testid=aba-categoria-REDES]'); await espera(400);
    ok('Redes Sociais mostra só o plano de Redes Sociais', (await v.locator('article:has-text("T40 Redes Business")').count()) === 1 && (await v.locator('article:has-text("T40 Redes Disparos")').count()) === 0);
    await v.screenshot({ path: OUT + '/categorias-redes.png' });
    await v.click('[data-testid=aba-categoria-REDES_DISPAROS]'); await espera(400);
    ok('Redes Sociais + Disparos mostra o plano misto', (await v.locator('article:has-text("T40 Redes Disparos Ind")').count()) === 1 && (await v.locator('article:has-text("T40 Redes Business")').count()) === 0);
    await v.screenshot({ path: OUT + '/categorias-redes-disparos.png' });
    ok('Nenhum texto "Empresarial" no popup', !(await v.locator('[aria-label=Planos]').innerText()).includes('Empresarial'));

    // Tela de ajuste separada em 4 grupos (decisão #184)
    await p.goto(BASE + '/planos'); await espera(800);
    ok('Tela de planos tem os 4 grupos de categoria', (await p.locator('[data-testid^=grupo-]').count()) === 4);
    const ordemGrupos = await p.locator('[data-testid^=grupo-]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    ok('Grupos na ordem Individual, Business, Redes Sociais, Redes Sociais + Disparos', ordemGrupos.join() === 'grupo-INDIVIDUAL,grupo-BUSINESS,grupo-REDES,grupo-REDES_DISPAROS');
    ok('O plano de Redes Sociais fica dentro do grupo dele', await p.evaluate(() => { const g = document.querySelector('[data-testid=grupo-REDES]'); const n = g && g.nextElementSibling; return !!n && n.textContent.includes('T40 Redes Business'); }));
    // Subir/descer só troca com plano da mesma categoria
    sql(`update "Plano" set categoria='BUSINESS' where nome='T40 Redes Business'`);
    await p.reload(); await espera(800);
    const ordA = sql(`select ordem from "Plano" where nome='T40 Redes Business'`);
    await p.locator('tr', { hasText: 'T40 Redes Business' }).locator('button[aria-label^="Subir"]').click(); await espera(1000);
    ok('Subir troca a ordem só dentro da categoria', sql(`select ordem from "Plano" where nome='T40 Redes Business'`) !== ordA && sql(`select count(*) from "Plano" where categoria='INDIVIDUAL' and ordem=(select ordem from "Plano" where nome='T40 Redes Business')`) === '0');
    sql(`update "Plano" set categoria='REDES' where nome='T40 Redes Business'`);

    // Destaque: um por categoria
    sql(`update "Plano" set destaque=true where nome='T40 Redes Business'`);
    await p.goto(BASE + '/planos'); await espera(800);
    const dest = sql(`select count(*) from "Plano" where destaque and categoria='BUSINESS'`);
    await p.locator('tr', { hasText: 'T40 Redes Disparos Ind' }).locator('button:has-text("Destacar")').click(); await espera(1000);
    ok('Destacar um plano não tira o destaque de outra categoria', sql(`select destaque from "Plano" where nome='T40 Redes Business'`) === 't' && sql(`select destaque from "Plano" where nome='T40 Redes Disparos Ind'`) === 't' && sql(`select count(*) from "Plano" where destaque and categoria='BUSINESS'`) === dest);

    // Admin da empresa vê "Business" na própria conta (tela de pedidos do Super Admin)
    await p.goto(BASE + '/pedidos'); await espera(800);
    ok('Pedidos: sem o nome Empresarial', !(await p.locator('body').innerText()).includes('Empresarial •'));
  } catch (e) {
    ok('Erro inesperado', false, String(e.message).split('\n')[0].slice(0, 160));
  } finally {
    sql(`delete from "Plano" where nome like 'T40%'`);
    for (const x of JSON.parse(antes)) sql(`update "Plano" set visivel=${x.visivel}, destaque=${x.destaque}, categoria='${x.categoria}' where id='${x.id}'`);
    await b.close();
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
