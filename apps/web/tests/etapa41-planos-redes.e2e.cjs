// Teste de ponta a ponta da decisão #185 (Etapa 2): planos de Redes Sociais criados, sem disparos no plano só de Redes,
// bloqueio de campanhas, upgrade Redes Sociais → Redes Sociais + Disparos e aba "Módulo Business" do login.
// Uso: node apps/web/tests/etapa41-planos-redes.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2] || '/tmp';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const EMP = sql(`select "empresaId" from "Usuario" where email='usuario@disparopro.com.br'`);
  const empAntes = sql(`select coalesce("planoId",'')||'|'||"permiteDisparos"||'|'||"redesSociais" from "Empresa" where id='${EMP}'`);
  const planosAntes = sql(`select coalesce(json_agg(json_build_object('id',id,'visivel',visivel,'preco',"precoAtual")),'[]') from "Plano"`);
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  try {
    // 1. Planos criados na migração
    ok('Há planos nas categorias Redes Sociais e Redes Sociais + Disparos (um por plano mensal)', Number(sql(`select count(*) from "Plano" where categoria='REDES'`)) >= 2 && Number(sql(`select count(*) from "Plano" where categoria='REDES_DISPAROS'`)) >= 2);
    ok('Redes Sociais: sem disparos, sem plano por disparo, com leads das redes', sql(`select count(*) from "Plano" where categoria='REDES' and ("permiteDisparos" or not "redesSociais" or not "leadsAnuncios" or "disparosPorPeriodo" is not null or "precoAtual" is not null)`) === '0');
    ok('Redes Sociais + Disparos: com disparos e redes, e o mesmo preço do mensal de origem', sql(`select count(*) from "Plano" r join "Plano" o on 'redes-disparos-'||o.slug = r.slug where r.categoria='REDES_DISPAROS' and (not r."permiteDisparos" or not r."redesSociais" or r."precoAtual" is distinct from o."precoAtual")`) === '0');
    ok('Redes Sociais Business cita a roleta; Individual não', /roleta/.test(sql(`select array_to_string(recursos,' ') from "Plano" where slug='redes-padrao'`)) && !/roleta/.test(sql(`select array_to_string(recursos,' ') from "Plano" where slug='redes-individual'`)));
    ok('Redes Sociais + Disparos mantém os recursos do plano original e acrescenta as redes', /redes sociais/.test(sql(`select array_to_string(recursos,' ') from "Plano" where slug='redes-disparos-individual'`)));

    // 2. Login com Módulo Business
    const [c0, p0] = await novo();
    await p0.goto(BASE + '/login', { waitUntil: 'networkidle' });
    ok('Login: aba "Módulo Business" (não mais Empresarial)', (await p0.locator('text=Módulo Business').count()) >= 1 && (await p0.locator('text=Módulo Empresarial').count()) === 0);
    await p0.screenshot({ path: OUT + '/login-business.png' });
    await c0.close();

    // 3. Popup: plano de Redes Sociais visível mostra "sem disparos"
    sql(`update "Plano" set visivel=true, "precoAtual"=1990 where slug='redes-individual'; update "Plano" set visivel=true where slug='redes-disparos-individual'`);
    const [cv, v] = await novo();
    await v.goto(BASE + '/login', { waitUntil: 'networkidle' }); await v.click('button:has-text("Planos")'); await espera(1200);
    await v.click('[data-testid=aba-categoria-REDES]'); await espera(400);
    ok('Cartão de Redes Sociais avisa que não tem disparos', (await v.locator('article:has-text("Redes Sociais Individual") [data-testid=disparos-plano]').innerText()).includes('Sem disparos de campanha'));
    await v.screenshot({ path: OUT + '/planos-redes.png' });
    await v.click('[data-testid=aba-categoria-REDES_DISPAROS]'); await espera(400);
    ok('Cartão de Redes + Disparos mostra disparos sem limite e as informações das redes', (await v.locator('article:has-text("Redes Sociais + Disparos Individual")').innerText()).includes('Disparos sem limite') && /redes sociais/i.test(await v.locator('article:has-text("Redes Sociais + Disparos Individual")').innerText()));
    await v.screenshot({ path: OUT + '/planos-redes-disparos.png' });
    await cv.close();

    // 4. Conta Individual com plano só de Redes Sociais: sem campanhas e com upgrade
    const RID = sql(`select id from "Plano" where slug='redes-individual'`);
    sql(`update "Empresa" set "planoId"='${RID}', "permiteDisparos"=false, "redesSociais"=true where id='${EMP}'`);
    const [c, p] = await novo();
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', 'usuario@disparopro.com.br'); await p.fill('#senha', 'User@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
    await p.goto(BASE + '/campanhas'); await espera(1000);
    ok('Campanhas mostra que o plano não inclui disparos', (await p.locator('[data-testid=sem-disparos]').count()) === 1 && (await p.locator('[data-testid=sem-disparos]').innerText()).includes('Redes Sociais + Disparos'));
    ok('Sem formulário de nova campanha', (await p.locator('text=Iniciar campanha').count()) === 0);
    await p.screenshot({ path: OUT + '/campanhas-sem-disparos.png' });
    await p.click('[data-testid=ir-upgrade]'); await espera(1200);
    ok('"Fazer upgrade" abre o popup de upgrade', (await p.locator('[data-testid=popup-upgrade]').count()) === 1);
    const temDisparos = await p.evaluate(async () => { const r = await fetch('/api/upgrade'); return r.ok ? JSON.stringify(await r.json()) : 'erro ' + r.status; });
    ok('O upgrade oferece o plano Redes Sociais + Disparos', temDisparos.includes('Redes Sociais + Disparos Individual'), temDisparos.slice(0, 80));
    await p.screenshot({ path: OUT + '/upgrade-redes.png' });
    await c.close();

    // 5. Depois do upgrade (flags do novo plano), volta a poder disparar
    const DID = sql(`select id from "Plano" where slug='redes-disparos-individual'`);
    sql(`update "Empresa" set "planoId"='${DID}', "permiteDisparos"=true where id='${EMP}'`);
    const [c2, p2] = await novo();
    await p2.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p2.fill('#email', 'usuario@disparopro.com.br'); await p2.fill('#senha', 'User@12345678'); await p2.click('button[type=submit]'); await p2.waitForURL('**/dashboard');
    await p2.goto(BASE + '/campanhas'); await espera(1000);
    ok('Com Redes Sociais + Disparos a tela de campanhas volta', (await p2.locator('[data-testid=sem-disparos]').count()) === 0);
    await c2.close();

    // 6. Cadastro: categoria Redes Sociais força "sem disparos"
    const [c3, p3] = await novo();
    await p3.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p3.fill('#email', 'superadmin@disparopro.com.br'); await p3.fill('#senha', 'Super@12345678'); await p3.click('button[type=submit]'); await p3.waitForURL('**/dashboard');
    await p3.goto(BASE + '/planos'); await espera(800);
    ok('Tela de planos mostra os planos de Redes Sociais nos grupos', (await p3.locator('[data-testid=grupo-REDES]').count()) === 1 && (await p3.locator('tr[data-plano="Redes Sociais Individual"]').count()) === 1);
    await p3.locator('tr[data-plano="Redes Sociais Individual"]').locator('button:has-text("Editar")').click(); await espera(400);
    await p3.fill('#f-disparosPorPeriodo', '500'); await p3.click('button:has-text("Salvar plano")'); await espera(1200);
    ok('Salvar plano de Redes Sociais ignora disparos por período (só mensal)', sql(`select "disparosPorPeriodo" is null and not "permiteDisparos" and "redesSociais" and "leadsAnuncios" from "Plano" where slug='redes-individual'`) === 't');
    await c3.close();
  } catch (e) {
    ok('Erro inesperado', false, String(e.message).split('\n')[0].slice(0, 160));
  } finally {
    const [pid, pd, rs] = empAntes.split('|');
    sql(`update "Empresa" set "planoId"=${pid ? `'${pid}'` : 'null'}, "permiteDisparos"=${pd}, "redesSociais"=${rs} where id='${EMP}'`);
    for (const x of JSON.parse(planosAntes)) sql(`update "Plano" set visivel=${x.visivel}, "precoAtual"=${x.preco == null ? 'null' : x.preco} where id='${x.id}'`);
    await b.close();
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
