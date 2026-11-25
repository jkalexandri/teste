// Teste de ponta a ponta da decisão #124 (etapa D do Asaas): cobrança automática no cartão (assinatura no Asaas).
// Cobre: opção "Cobrar automaticamente" (só cartão, marcada, esconde parcelas), assinatura criada, 1º pagamento liga a conta,
// novo período cria e confirma a renovação, aviso repetido não duplica, Prorrogar move a próxima cobrança, plano sem período fixo
// desliga, selo "Renova em" do dono (desligar) e do usuário comum (sem botão), Super Admin desliga em Empresas, aviso de 3 dias.
// Requer: site em http://localhost:3005 com ASAAS_URL=http://127.0.0.1:4010 e CRON_SECRET=segredo-teste; Postgres com seed; log em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa19d-asaas-automatica.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const falso = require('./asaas-falso.cjs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const suf = Date.now().toString().slice(-6);
const CPF = '529.982.247-25';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 60) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };
const evento = (n) => `evt_19d_${suf}_${n}`;
/** Data AAAA-MM-DD do vencimento da conta no horário de Brasília (como o FilaPro manda ao Asaas) */
const vencimentoBR = (emp) => sql(`select to_char("expiraEm" - interval '3 hours','YYYY-MM-DD') from "Empresa" where id='${emp}'`);

(async () => {
  const srv = await falso.iniciar();
  const PLANO = sql(`select id from "Plano" where nome='Individual' and modulo='INDIVIDUAL'`);
  const antes = sql(`select "prazoDias"||'|'||periodo||'|'||coalesce("precoAtual"::text,'null') from "Plano" where id='${PLANO}'`).split('|');
  // Individual trimestral (93 dias) a R$ 29,90, com juros configurados (para conferir que as parcelas somem)
  sql(`update "Plano" set "prazoDias"=93, periodo='trimestre', "precoAtual"=2990 where id='${PLANO}'`);
  sql(`update "ConfigVenda" set "asaasChave"=null, "jurosParcelaMes"=2.99 where id='config'`);
  const DEMO_IND = sql(`select "empresaId" from "Usuario" where email='usuario@disparopro.com.br'`);
  const DEMO_EMP = sql(`select "empresaId" from "Usuario" where email='ana@empresaexemplo.com.br'`);

  const b = await chromium.launch();
  const novo = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, empresarial) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    if (empresarial) await p.click('text=Módulo Empresarial');
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const abrirCompra = async (p, email) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.click('button:has-text("Planos")'); await espera(800);
    await p.locator('[aria-label="Planos"] article:has-text("Individual")').first().locator('[data-parte=botao]').click(); await espera(500);
    await p.fill('#ck-nome', 'Ana Automática'); await p.fill('#ck-email', email); await p.fill('#ck-whats', '11987650002'); await p.fill('#ck-documento', CPF);
  };

  // ===== 0. Super Admin liga o Asaas e o aviso =====
  let [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.goto(BASE + '/pagamento'); await espera(800);
  await p.fill('#asaasChave', '$aact_hmlg_teste'); await p.click('[data-testid=salvar-asaas]');
  await ate(async () => (await p.locator('[data-testid=estado-asaas]').innerText()).includes('Conectado'));
  await p.click('[data-testid=configurar-aviso]');
  ok('Asaas conectado e aviso cadastrado', await ate(() => falso.webhooks.length >= 1));
  await c.close();

  // ===== 1. Tela de pagamento: opção "Cobrar automaticamente" =====
  [c, p] = await novo();
  const e1 = `auto${suf}@x.com`;
  await abrirCompra(p, e1);
  ok('PIX: sem a opção de cobrança automática', (await p.locator('[data-testid=cobranca-automatica]').count()) === 0);
  await p.click('[data-testid=forma-CARTAO]');
  ok('Cartão: opção "Cobrar automaticamente" aparece marcada', (await p.locator('[data-testid=cobranca-automatica]').count()) === 1 && (await p.isChecked('[data-testid=cobranca-automatica]')));
  ok('Marcada: sem parcelas (sempre à vista)', (await p.locator('#ck-parcelas').count()) === 0);
  await p.screenshot({ path: OUT + '/cartao-automatica.png' });
  await p.uncheck('[data-testid=cobranca-automatica]');
  ok('Desmarcada: as parcelas voltam, como antes', (await p.locator('#ck-parcelas').count()) === 1);
  await p.check('[data-testid=cobranca-automatica]');
  await p.click('button:has-text("Pagar com cartão")');
  ok('Link para a página do Asaas', await ate(async () => (await p.locator('[data-testid=pagar-cartao]').count()) === 1));
  await c.close();
  const [cod1, pay1, sub1, auto1, valor1, id1] = sql(`select codigo||'|'||coalesce("asaasId",'')||'|'||coalesce("asaasAssinaturaId",'')||'|'||automatica::text||'|'||valor||'|'||id from "Pedido" where email='${e1}'`).split('|');
  const assinatura = falso.assinaturas.find((a) => a.id === sub1) || {};
  ok('Pedido automático com assinatura e 1ª cobrança', auto1 === 'true' && sub1.startsWith('sub_') && pay1.startsWith('pay_') && valor1 === '2990');
  ok('Assinatura no Asaas: cartão, trimestral, R$ 29,90, referência = pedido', assinatura.billingType === 'CREDIT_CARD' && assinatura.cycle === 'QUARTERLY' && assinatura.value === 29.9 && assinatura.externalReference === cod1);

  // ===== 2. 1º pagamento aprovado: conta criada e cobrança automática ligada =====
  await falso.avisar('PAYMENT_CONFIRMED', { id: evento(1), payment: { id: pay1, subscription: sub1, value: 29.9, netValue: 28.91, externalReference: cod1, billingType: 'CREDIT_CARD' } });
  ok('1º pagamento confirma o pedido', await ate(() => sql(`select status from "Pedido" where id='${id1}'`) === 'PAGO'));
  const EMP = sql(`select "empresaId" from "Pedido" where id='${id1}'`);
  ok('Cobrança automática ligada na conta', await ate(() => sql(`select coalesce("asaasAssinaturaId",'') from "Empresa" where id='${EMP}'`) === sub1));
  ok('Próxima cobrança marcada para o dia do vencimento (item b)', await ate(() => assinatura.nextDueDate === vencimentoBR(EMP)), `${assinatura.nextDueDate} x ${vencimentoBR(EMP)}`);

  // ===== 3. Novo período: o Asaas gera a cobrança e cobra o cartão =====
  const expAntes = sql(`select to_char("expiraEm",'YYYY-MM-DD') from "Empresa" where id='${EMP}'`);
  const pay2 = `pay_19d_${suf}_ciclo2`;
  await falso.avisar('PAYMENT_CREATED', { id: evento(2), payment: { id: pay2, subscription: sub1, value: 29.9, dueDate: vencimentoBR(EMP), externalReference: cod1, billingType: 'CREDIT_CARD' } });
  ok('Cobrança do novo período cria o pedido de renovação (aguardando)', await ate(() => sql(`select status||'|'||renovacao::text||'|'||automatica::text from "Pedido" where "asaasId"='${pay2}'`) === 'AGUARDANDO|true|true'));
  await falso.avisar('PAYMENT_CONFIRMED', { id: evento(3), payment: { id: pay2, subscription: sub1, value: 29.9, netValue: 28.91, externalReference: cod1, billingType: 'CREDIT_CARD' } });
  ok('Cartão cobrado: renovação confirmada pelo Asaas', await ate(() => sql(`select status||'|'||"confirmadoPor" from "Pedido" where "asaasId"='${pay2}'`) === 'PAGO|Asaas'));
  ok('Prazo somado (+93 dias)', await ate(() => sql(`select ("expiraEm"::date - '${expAntes}'::date)::text from "Empresa" where id='${EMP}'`) === '93'));
  await falso.avisar('PAYMENT_RECEIVED', { id: evento(4), payment: { id: pay2, subscription: sub1, value: 29.9, netValue: 28.91, externalReference: cod1, billingType: 'CREDIT_CARD' } });
  await ate(() => sql(`select count(*) from "AvisoAsaas" where "eventoId"='${evento(4)}' and "processadoEm" is not null`) === '1');
  ok('Aviso seguinte da mesma cobrança não renova de novo', sql(`select count(*) from "Pedido" where "empresaId"='${EMP}' and renovacao`) === '1' && sql(`select ("expiraEm"::date - '${expAntes}'::date)::text from "Empresa" where id='${EMP}'`) === '93');
  ok('Receita da renovação no Financeiro', await ate(() => sql(`select count(*) from "Lancamento" l join "Pedido" p on p.id=l."pedidoId" where p."asaasId"='${pay2}' and l.origem='PEDIDO'`) === '1'));

  // ===== 4. Pedidos mostra "Cartão (automática)" =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.goto(BASE + '/pedidos', { waitUntil: 'networkidle' });
  await p.click('button:has-text("Todos (")'); await espera(300);
  ok('Pedidos: "Cartão (automática)"', (await p.locator(`tr:has-text("${cod1}") [data-testid=forma-pedido]`).innerText().catch(() => '')).trim() === 'Cartão (automática)');

  // ===== 5. Prorrogar move a próxima cobrança; plano sem período fixo desliga (item c) =====
  await p.goto(BASE + '/usuarios-individuais', { waitUntil: 'networkidle' });
  ok('Usuários Individuais: "Cobrança automática: ligada" (item i)', (await p.locator(`tr:has-text("${e1}") [data-testid=cobranca-automatica-ligada]`).count()) === 1);
  await p.locator(`tr:has-text("${e1}") >> button:has-text("Prorrogar")`).click();
  ok('Prorrogar: a próxima cobrança acompanha o novo vencimento', await ate(() => assinatura.nextDueDate === vencimentoBR(EMP)), `${assinatura.nextDueDate} x ${vencimentoBR(EMP)}`);
  sql(`update "Empresa" set "prazoDias"=45 where id='${EMP}'`);
  await p.locator(`tr:has-text("${e1}") >> button:has-text("Prorrogar")`).click();
  ok('Plano sem período fixo: cobrança automática desligada e cancelada no Asaas', await ate(() => sql(`select coalesce("asaasAssinaturaId",'nulo') from "Empresa" where id='${EMP}'`) === 'nulo') && assinatura.deleted === true);
  ok('Dono avisado por e-mail', fs.readFileSync('/var/tmp/web.log', 'utf8').includes('Cobrança automática do FilaPro Leads desligada'));

  // ===== 6. Super Admin desliga em Empresas (item e) =====
  sql(`update "Empresa" set "asaasAssinaturaId"='sub_19d_emp_${suf}' where id='${DEMO_EMP}'`);
  await p.goto(BASE + '/empresas', { waitUntil: 'networkidle' });
  const cartao = p.locator('[data-testid=cobranca-automatica-ligada]').first();
  ok('Empresas: "Cobrança automática: ligada"', (await cartao.count()) === 1);
  await p.locator('[data-testid=desligar-automatica]').first().click();
  ok('Super Admin desliga (assinatura que já não existe no Asaas também sai)', await ate(() => sql(`select coalesce("asaasAssinaturaId",'nulo') from "Empresa" where id='${DEMO_EMP}'`) === 'nulo'));
  await c.close();

  // ===== 7. Selo "Renova em" no topo: dono desliga; usuário comum só vê (item h) =====
  sql(`update "Empresa" set "asaasAssinaturaId"='sub_19d_ind_${suf}' where id='${DEMO_IND}'`);
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  ok('Dono: selo "Renova em"', (await p.locator('[data-testid=chip-renovacao]').innerText()).includes('Renova'));
  await p.click('[data-testid=chip-renovacao]');
  ok('Quadro com a data e o botão de desligar', (await p.locator('[data-testid=quadro-renovacao]').innerText()).includes('Renovação automática no cartão em') && (await p.locator('[data-testid=desligar-minha-automatica]').count()) === 1);
  await p.screenshot({ path: OUT + '/selo-renovacao.png' });
  await p.click('[data-testid=desligar-minha-automatica]');
  ok('Dono desliga a cobrança automática', await ate(() => sql(`select coalesce("asaasAssinaturaId",'nulo') from "Empresa" where id='${DEMO_IND}'`) === 'nulo'));
  ok('Selo volta a ser "Expira em"', await ate(async () => (await p.locator('[data-testid=chip-renovacao]').count()) === 0));
  await c.close();
  sql(`update "Empresa" set "asaasAssinaturaId"='sub_19d_emp2_${suf}' where id='${DEMO_EMP}'`);
  [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', true);
  await p.click('[data-testid=chip-renovacao]');
  ok('Usuário comum da empresa: vê a renovação, sem o botão de desligar', (await p.locator('[data-testid=quadro-renovacao]').count()) === 1 && (await p.locator('[data-testid=desligar-minha-automatica]').count()) === 0);
  await c.close();

  // ===== 8. Aviso de 3 dias, sem o link (item g) =====
  const expEmp = sql(`select "expiraEm"::text from "Empresa" where id='${DEMO_EMP}'`);
  sql(`update "Empresa" set "expiraEm"=now() + interval '2 days', "avisoRenovacao3Em"=null, "avisoRenovacao10Em"=null where id='${DEMO_EMP}'`);
  const tamLog = fs.readFileSync('/var/tmp/web.log', 'utf8').length;
  const cron = await fetch(BASE + '/api/cron/renovacao', { headers: { authorization: 'Bearer segredo-teste' } });
  const logNovo = fs.readFileSync('/var/tmp/web.log', 'utf8').slice(tamLog);
  ok('Aviso "será renovado automaticamente", sem o link de renovação', cron.status === 200 && logNovo.includes('será renovado automaticamente') && sql(`select ("avisoRenovacao3Em" is not null)::text from "Empresa" where id='${DEMO_EMP}'`) === 'true' && sql(`select coalesce("tokenRenovacao",'nulo') from "Empresa" where id='${DEMO_EMP}'`) === 'nulo');

  // ===== 9. Cartão sem a opção marcada: continua como antes (avulso) =====
  [c, p] = await novo();
  const e2 = `avulso${suf}@x.com`;
  await abrirCompra(p, e2);
  await p.click('[data-testid=forma-CARTAO]'); await p.uncheck('[data-testid=cobranca-automatica]');
  const antesAss = falso.assinaturas.length;
  await p.click('button:has-text("Pagar com cartão")');
  ok('Cartão avulso: sem assinatura, como antes', await ate(() => sql(`select automatica::text||'|'||coalesce("asaasAssinaturaId",'nulo') from "Pedido" where email='${e2}' and "asaasId" is not null`) === 'false|nulo') && falso.assinaturas.length === antesAss);
  await c.close();
  await b.close(); srv.close();

  // Limpeza
  const [prazo, periodo, preco] = antes;
  sql(`update "Plano" set "prazoDias"=${prazo}, periodo='${periodo}', "precoAtual"=${preco} where id='${PLANO}'`);
  sql(`update "ConfigVenda" set "asaasChave"=null, "asaasConta"=null, "jurosParcelaMes"=null where id='config'`);
  sql(`update "Empresa" set "asaasAssinaturaId"=null where id in ('${DEMO_IND}','${DEMO_EMP}')`);
  sql(`update "Empresa" set "expiraEm"='${expEmp}', "avisoRenovacao3Em"=null, "avisoRenovacao10Em"=null where id='${DEMO_EMP}'`);
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.filter((r) => r.startsWith('PASSOU')).length} passaram, ${res.filter((r) => r.startsWith('FALHOU')).length} falharam`);
})().catch((e) => {
  console.error(e);
  console.log(res.join('\n'));
  try { sql(`update "Plano" set "prazoDias"=31, periodo='mês' where nome='Individual' and modulo='INDIVIDUAL'`); sql(`update "ConfigVenda" set "asaasChave"=null, "jurosParcelaMes"=null where id='config'`); sql(`update "Empresa" set "asaasAssinaturaId"=null`); } catch {}
  process.exit(1);
});
