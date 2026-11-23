// Teste de ponta a ponta da decisão #113, etapa 2 (preço por quantidade).
// Cobre: seletor no cartão Empresarial (pacotes de usuários), conta e limites × pacotes, "Alterar pacote"
// do Super Admin, renovação diminuindo usuários (os mais recentes ficam bloqueados) e os até 10 números do Super Admin.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa18-preco-quantidade.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const suf = Date.now().toString().slice(-6);
const EMAIL = `pacotes${suf}@empresa.com`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 40) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };

(async () => {
  // Plano Padrão de teste: R$ 199,90, 10 usuários, até 5 pacotes, 1.000 disparos e 500 leads por pacote
  const PLANO = sql(`select id from "Plano" where nome='Padrão' and modulo='EMPRESARIAL'`);
  const antes = sql(`select coalesce("precoAtual"::text,'null')||'|'||"maxPacotes"||'|'||coalesce("disparosPorPeriodo"::text,'null')||'|'||coalesce("limiteLeads"::text,'null')||'|'||visivel from "Plano" where id='${PLANO}'`).split('|');
  sql(`update "Plano" set "precoAtual"=19990, "maxPacotes"=5, "disparosPorPeriodo"=1000, "limiteLeads"=500, visivel=true, descontos='{10,15,20,25}' where id='${PLANO}'`);
  const SA = sql(`select id from "Usuario" where email='superadmin@disparopro.com.br'`);
  sql(`delete from "WhatsappSessao" where "usuarioId"='${SA}' and id <> '${SA}'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrarSA = async (p) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  // Abre o cartão do plano no popup: aba Empresarial e, se preciso, a aba "Por disparo"
  const cartaoPadrao = async (p) => {
    await p.click('[data-testid=aba-modulo-EMPRESARIAL]'); await espera(300);
    if (!(await p.locator('[aria-label="Planos"] article:has-text("Padrão")').count())) { await p.click('[data-testid=aba-planos-quantidade]'); await espera(300); }
    return p.locator('[aria-label="Planos"] article:has-text("Padrão")').first();
  };

  // ===== 1. Cartão Empresarial com o seletor de usuários =====
  let [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.click('button:has-text("Planos")'); await espera(800);
  let card = await cartaoPadrao(p);
  const rotulos = await card.locator('[data-testid=seletor-quantidade] button').allInnerTexts();
  ok('Seletor do Padrão: 10, 20, 30, 40, 50 usuários', rotulos.join(',') === '10,20,30,40,50', rotulos.join(','));
  ok('Preço com 10 usuários = R$ 199,90', (await card.locator('[data-parte=preco]').innerText()).includes('199,90'));
  await card.locator('[data-testid=qtd-3]').click();
  // 199,90 + 179,91 (−10%) + 169,92 (−15%) = 549,73
  ok('30 usuários: R$ 199,90 + R$ 179,91 + R$ 169,92 = R$ 549,73', (await card.locator('[data-parte=preco]').innerText()).includes('549,73'));
  ok('Disparos multiplicam: 3.000 disparos', (await card.locator('[data-testid=disparos-plano]').innerText()).includes('3.000'));
  await p.screenshot({ path: OUT + '/cartao-padrao-30.png' });
  await card.locator('[data-parte=botao]').click(); await espera(400);
  ok('Pagamento abre com 30 usuários', (await p.locator('#ck-quantidade').inputValue()) === '3');
  await p.fill('#ck-nome', 'Paula Pacotes'); await p.fill('#ck-email', EMAIL); await p.fill('#ck-whats', '11987650000');
  await p.fill('#ck-empresa', 'Pacotes ' + suf);
  await p.click('text=Gerar PIX');
  ok('Pedido com 3 pacotes e R$ 549,73', await ate(() => sql(`select pacotes||'|'||valor from "Pedido" where email='${EMAIL}'`) === '3|54973'));
  await c.close();

  // ===== 2. Super Admin confirma: conta com limites × 3 =====
  [c, p] = await novo();
  await entrarSA(p);
  await p.goto(BASE + '/pedidos'); await espera(800);
  ok('Pedidos mostra "Padrão — 30 usuários"', (await p.locator(`tr:has-text("${EMAIL}")`).innerText()).includes('30 usuários'));
  await p.click(`tr:has-text("${EMAIL}") >> text=Confirmar pagamento`);
  const EMP = await ate(() => sql(`select count(*) from "Empresa" where nome='Pacotes ${suf}'`) === '1') ? sql(`select id from "Empresa" where nome='Pacotes ${suf}'`) : '';
  const limites = () => sql(`select "limiteUsuarios"||'|'||pacotes||'|'||coalesce("limiteDisparos"::text,'null')||'|'||coalesce("limiteLeads"::text,'null') from "Empresa" where id='${EMP}'`);
  ok('Conta: 30 usuários, 3 pacotes, 3.000 disparos, 1.500 leads', !!EMP && limites() === '30|3|3000|1500', EMP && limites());

  // ===== 3. Empresas → Alterar pacote com a quantidade =====
  await p.goto(BASE + '/empresas'); await espera(800);
  const art = `article:has-text("Pacotes ${suf}")`;
  await p.click(`${art} >> text=Alterar pacote`); await espera(300);
  ok('Alterar pacote mostra a quantidade atual (30 usuários)', (await p.locator(`${art} select[name=pacotes]`).inputValue()) === '3');
  await p.selectOption(`${art} select[name=pacotes]`, '5');
  await p.screenshot({ path: OUT + '/alterar-pacote.png' });
  await p.click(`${art} >> text=Salvar pacote`);
  ok('Alterado para 50 usuários: disparos e leads acompanham', await ate(() => limites() === '50|5|5000|2500'), limites());
  await c.close();

  // ===== 4. Renovação diminuindo para 10 usuários: os mais recentes ficam bloqueados =====
  for (let i = 1; i <= 12; i++) {
    sql(`insert into "Usuario"(id,nome,email,cargo,"empresaId","criadoEm","atualizadoEm") values ('t18-u${i}','Vendedor ${i}','t18-u${i}-${suf}@x.com','USUARIO','${EMP}',now() - interval '${100 - i} minutes',now())`);
  }
  sql(`update "Empresa" set "tokenRenovacao"='tok-18-${suf}' where id='${EMP}'`);
  [c, p] = await novo();
  await p.goto(BASE + `/renovar/tok-18-${suf}`, { waitUntil: 'networkidle' }); await espera(600);
  if (!(await p.locator('article:has-text("Padrão")').count())) { await p.click('[data-testid=aba-planos-quantidade]'); await espera(300); }
  card = p.locator('article:has-text("Padrão")').first();
  ok('Renovação: cartão abre com 50 usuários', (await card.locator('[data-testid=qtd-5]').getAttribute('aria-pressed')) === 'true');
  await card.locator('[data-testid=qtd-1]').click(); await card.locator('[data-parte=botao]').click();
  ok('PIX de renovação com 1 pacote (R$ 199,90)', await ate(() => sql(`select pacotes||'|'||valor from "Pedido" where "empresaId"='${EMP}' and renovacao order by "criadoEm" desc limit 1`) === '1|19990'));
  await c.close();
  [c, p] = await novo();
  await entrarSA(p);
  await p.goto(BASE + '/pedidos'); await espera(800);
  await p.locator('tr', { has: p.locator('text=Pacotes ' + suf) }).filter({ hasText: 'Renova' }).first().locator('text=Confirmar pagamento').click()
    .catch(async () => { await p.locator(`tr:has-text("${EMAIL}") >> text=Confirmar pagamento`).first().click(); });
  ok('Renovado: 10 usuários, 1.000 disparos, 500 leads', await ate(() => limites() === '10|1|1000|500'), limites());
  const bloqueados = sql(`select string_agg(id, ',' order by id) from "Usuario" where "empresaId"='${EMP}' and status='BLOQUEADO'`);
  ok('Os 2 mais recentes ficam bloqueados', bloqueados === 't18-u11,t18-u12', bloqueados);

  // ===== 5. Super Admin: até 10 números próprios, sem pagamento =====
  await p.goto(BASE + '/whatsapp'); await espera(800);
  ok('Super Admin vê "Mais números" (1 de 10)', (await p.locator('[data-testid=numeros-superadmin]').innerText()).includes('1 de 10'));
  await p.click('[data-testid=sa-adicionar-numero]');
  ok('Adicionou o 2º número', await ate(async () => (await p.locator('[data-testid=numero]').count()) === 2));
  await p.click('[data-testid=sa-adicionar-numero]');
  ok('Adicionou o 3º número', await ate(async () => (await p.locator('[data-testid=numero]').count()) === 3));
  ok('Sem pedido de pagamento', sql(`select count(*) from "Pedido" where email='superadmin@disparopro.com.br'`) === '0');
  await p.screenshot({ path: OUT + '/superadmin-numeros.png', fullPage: true });
  await p.click('[data-testid=sa-remover-numero]');
  ok('Removeu o último (fica guardado, desconectado)', await ate(async () => (await p.locator('[data-testid=numero]').count()) === 2) && sql(`select count(*) from "WhatsappSessao" where "usuarioId"='${SA}' and bloqueada`) === '1');
  sql(`insert into "WhatsappSessao"(id,"usuarioId",ordem,"atualizadoEm") select '${SA}-n' || g, '${SA}', g, now() from generate_series(10, 17) g`);
  await p.reload(); await espera(800);
  ok('No máximo 10 números: botão desativado', (await p.locator('[data-testid=numero]').count()) === 10 && (await p.locator('[data-testid=sa-adicionar-numero]').isDisabled()) && (await p.locator('[data-testid=numeros-superadmin]').innerText()).includes('10 de 10'));
  await c.close();
  await b.close();

  // Limpeza
  sql(`delete from "WhatsappSessao" where "usuarioId"='${SA}' and id <> '${SA}'`);
  sql(`delete from "Usuario" where id like 't18-u%'`);
  const [preco, maxP, disp, leads, vis] = antes;
  sql(`update "Plano" set "precoAtual"=${preco}, "maxPacotes"=${maxP}, "disparosPorPeriodo"=${disp}, "limiteLeads"=${leads}, visivel=${vis === 'true' || vis === 't'} where id='${PLANO}'`);
  console.log(res.join('\n'));
  console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => {
  console.error(e);
  // Restaura o plano Padrão do seed se o teste parar no meio
  try { sql(`update "Plano" set "maxPacotes"=1, "disparosPorPeriodo"=null, "limiteLeads"=null where nome='Padrão' and modulo='EMPRESARIAL'`); } catch {}
  process.exit(1);
});
