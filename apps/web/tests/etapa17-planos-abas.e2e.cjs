// Teste de ponta a ponta da decisão #111: planos em duas abas (Sem limite / Por quantidade), Novo plano, Duplicar, Excluir,
// destaque por aba e travas de preço zero. Usa planos próprios do teste (apagados no fim) e restaura os da instalação.
// Uso: node apps/web/tests/etapa17-planos-abas.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const antes = sql(`select coalesce(json_agg(json_build_object('id',id,'visivel',visivel,'destaque',destaque,'ordem',ordem)),'[]') from "Plano"`);
  sql(`delete from "Plano" where nome like 'T17%'`);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on('dialog', (d) => d.accept());
  try {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
    await p.goto(BASE + '/planos'); await espera(800);
    // Novo plano
    await p.click('button:has-text("+ Novo plano")');
    await p.fill('#novo-nome', 'T17 Quantidade'); await p.selectOption('#novo-modulo', 'EMPRESARIAL'); await p.click('button:has-text("Criar")'); await espera(1200);
    const q = sql(`select id||'|'||visivel from "Plano" where nome='T17 Quantidade'`);
    ok('Novo plano nasce oculto', q.endsWith('|false'), q);
    const QID = q.split('|')[0];
    // Editar: disparos por período → aba Por quantidade; preço zero não pode ficar visível
    await p.locator('tr', { hasText: 'T17 Quantidade' }).locator('button:has-text("Editar")').click(); await espera(400);
    await p.fill('#f-precoAtual', '0'); await p.fill('#f-disparosPorPeriodo', '3000'); await p.fill('#f-pacoteDisparos', '500'); await p.fill('#f-precoPacoteDisparos', '0');
    await p.check('#f-limiteLeads-ilimitado').catch(() => undefined);
    await p.click('button:has-text("Salvar plano")'); await espera(1200);
    ok('Plano com disparos vai para a aba Por quantidade', (await p.locator('tr', { hasText: 'T17 Quantidade' }).locator('[data-testid=aba-do-plano]').innerText()).includes('Por quantidade'));
    await p.locator('tr', { hasText: 'T17 Quantidade' }).locator('button:has-text("Oculto")').click(); await espera(1000);
    ok('Preço zero não pode ficar visível', sql(`select visivel from "Plano" where id='${QID}'`) === 'f');
    sql(`update "Plano" set "precoAtual"=9990 where id='${QID}'`);
    await p.reload(); await espera(800);
    await p.locator('tr', { hasText: 'T17 Quantidade' }).locator('button:has-text("Oculto")').click(); await espera(1000);
    ok('Com preço, fica visível', sql(`select visivel from "Plano" where id='${QID}'`) === 't');
    // Duplicar
    await p.locator('tr', { hasText: 'T17 Quantidade' }).locator('button:has-text("Duplicar")').click(); await espera(1200);
    ok('Duplicar cria cópia oculta', sql(`select count(*)||'|'||bool_and(not visivel) from "Plano" where nome='T17 Quantidade (cópia)'`) === '1|true');
    // Destaque por aba: destacar o T17 não tira o destaque de um plano da aba Sem limite
    const semLimDest = sql(`select id from "Plano" where not gratis and not personalizado and "disparosPorPeriodo" is null and nome not like 'T17%' order by ordem limit 1`);
    sql(`update "Plano" set destaque=true where id='${semLimDest}'`);
    await p.reload(); await espera(800);
    await p.locator('tr', { hasText: 'T17 Quantidade' }).first().locator('button:has-text("Destacar")').click(); await espera(1000);
    ok('Um destaque por aba', sql(`select destaque from "Plano" where id='${QID}'`) === 't' && sql(`select destaque from "Plano" where id='${semLimDest}'`) === 't');
    // Excluir: sem pedidos → sai; com pedido → não
    const COP = sql(`select id from "Plano" where nome='T17 Quantidade (cópia)'`);
    await p.locator('tr', { hasText: 'T17 Quantidade (cópia)' }).locator('button:has-text("Excluir")').click(); await espera(1000);
    ok('Excluir plano sem pedidos', sql(`select count(*) from "Plano" where id='${COP}'`) === '0');
    sql(`insert into "Pedido"(id,codigo,status,"planoId","planoNome",modulo,"prazoDias",valor,nome,email,whatsapp,"pixCopiaECola","expiraEm") values ('ped-t17','T17PED','CANCELADO','${QID}','T17','EMPRESARIAL',31,9990,'x','t17@x.com','1199','x',now())`);
    await p.reload(); await espera(800);
    await p.locator('tr', { hasText: 'T17 Quantidade' }).locator('button:has-text("Excluir")').click(); await espera(1000);
    ok('Plano com pedidos não pode ser excluído', sql(`select count(*) from "Plano" where id='${QID}'`) === '1' && (await p.locator('text=Use Oculto para tirar do popup').count()) >= 1);
    sql(`delete from "Pedido" where id='ped-t17'`);
    // Popup do visitante: duas abas largas
    const v = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await v.goto(BASE + '/login', { waitUntil: 'networkidle' }); await v.click('button:has-text("Planos")'); await espera(1200);
    ok('Popup mostra as duas abas', (await v.locator('[data-testid^=aba-planos-]').count()) === 2);
    ok('Abre na aba Sem limite', (await v.locator('[data-testid=aba-planos-ilimitado]').getAttribute('aria-selected')) === 'true' && (await v.locator('article:has-text("T17 Quantidade")').count()) === 0);
    await v.click('[data-testid=aba-planos-quantidade]'); await espera(500);
    ok('Aba Por quantidade mostra o plano com disparos', (await v.locator('article:has-text("T17 Quantidade") [data-testid=disparos-plano]').innerText()).includes('3.000 disparos/mês'));
    await v.screenshot({ path: OUT + '/planos-abas.png' });
    // Pedido com preço zero é recusado
    sql(`update "Plano" set "precoAtual"=0 where id='${QID}'`);
    const r = await v.evaluate(async (id) => (await fetch('/api/pedidos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planoId: id, nome: 'X', email: 'zero@x.com', whatsapp: '11999990000', empresaNome: 'X' }) })).status, QID);
    ok('Pedido de plano com preço zero é recusado', r >= 400, String(r));
  } catch (e) {
    ok('Erro inesperado', false, String(e.message).split('\n')[0].slice(0, 160));
  } finally {
    sql(`delete from "Pedido" where id='ped-t17'`);
    sql(`delete from "Plano" where nome like 'T17%'`);
    for (const x of JSON.parse(antes)) sql(`update "Plano" set visivel=${x.visivel}, destaque=${x.destaque}, ordem=${x.ordem} where id='${x.id}'`);
    await b.close();
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
