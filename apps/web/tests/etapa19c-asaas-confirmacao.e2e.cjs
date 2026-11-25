// Teste de ponta a ponta da decisão #117 (etapa C do Asaas): confirmação automática pelo aviso (webhook).
// Cobre: PIX recebido confirma o pedido e lança a taxa; aviso repetido não repete nada; cartão em 3 parcelas confirma uma vez
// e lança 3 taxas; pedido cancelado pago depois só avisa; estorno lança no Financeiro e inativa a empresa; contestação só avisa;
// código desconhecido é ignorado; token errado é recusado; a rotina diária reprocessa aviso que ficou pela metade.
// Requer: site em http://localhost:3005 iniciado com ASAAS_URL=http://127.0.0.1:4010 e CRON_SECRET=segredo-teste; Postgres com seed.
// Uso: node apps/web/tests/etapa19c-asaas-confirmacao.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const falso = require('./asaas-falso.cjs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const suf = Date.now().toString().slice(-6);
const CPF = '529.982.247-25';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 60) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };
const evento = (n) => `evt_19c_${suf}_${n}`;

(async () => {
  const srv = await falso.iniciar();
  const PLANO = sql(`select id from "Plano" where nome='Individual' and modulo='INDIVIDUAL'`);
  const antes = sql(`select "prazoDias"||'|'||periodo||'|'||coalesce("precoAtual"::text,'null') from "Plano" where id='${PLANO}'`).split('|');
  // Individual trimestral a R$ 29,90 (permite o cartão parcelado), sem juros
  sql(`update "Plano" set "prazoDias"=93, periodo='trimestre', "precoAtual"=2990 where id='${PLANO}'`);
  sql(`update "ConfigVenda" set "asaasChave"=null, "jurosParcelaMes"=0 where id='config'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrarSA = async (p) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  /** Compra o plano Individual pela tela (como o cliente faz) com a forma escolhida. */
  const comprar = async (email, forma, nParcelas) => {
    const [c, p] = await novo();
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.click('button:has-text("Planos")'); await espera(800);
    await p.locator('[aria-label="Planos"] article:has-text("Individual")').first().locator('[data-parte=botao]').click(); await espera(500);
    await p.fill('#ck-nome', 'Carlos Confirmação'); await p.fill('#ck-email', email); await p.fill('#ck-whats', '11987650001'); await p.fill('#ck-documento', CPF);
    await p.click(`[data-testid=forma-${forma}]`);
    // Cartão avulso: desmarca a cobrança automática, que vem marcada (decisão #124, item a)
    if (forma === 'CARTAO') await p.uncheck('[data-testid=cobranca-automatica]');
    if (nParcelas) await p.selectOption('#ck-parcelas', String(nParcelas));
    await p.click({ PIX: 'button:has-text("Gerar PIX")', BOLETO: 'button:has-text("Gerar boleto")', CARTAO: 'button:has-text("Pagar com cartão")' }[forma]);
    if (!(await ate(() => sql(`select count(*) from "Pedido" where email='${email}' and "asaasId" is not null`) === '1'))) await p.screenshot({ path: `${OUT}/19c-compra-falhou-${forma}.png` });
    await c.close();
    return sql(`select codigo||'|'||"asaasId"||'|'||valor||'|'||id from "Pedido" where email='${email}'`).split('|');
  };
  const aviso = (eventoId) => sql(`select coalesce(resultado,'')||'|'||coalesce(erro,'') from "AvisoAsaas" where "eventoId"='${eventoId}'`);
  const processado = (eventoId) => ate(() => sql(`select count(*) from "AvisoAsaas" where "eventoId"='${eventoId}' and "processadoEm" is not null`) === '1');

  // ===== 0. Super Admin liga o Asaas e cadastra o aviso (webhook) =====
  let [c, p] = await novo();
  await entrarSA(p);
  await p.goto(BASE + '/pagamento'); await espera(800);
  await p.fill('#asaasChave', '$aact_hmlg_teste'); await p.click('[data-testid=salvar-asaas]');
  ok('Asaas conectado', await ate(async () => (await p.locator('[data-testid=estado-asaas]').innerText()).includes('Conectado')));
  await p.click('[data-testid=configurar-aviso]');
  ok('Aviso (webhook) cadastrado no Asaas de mentira', await ate(() => falso.webhooks.length >= 1));
  await c.close();

  // ===== 1. PIX recebido: confirma sozinho, cria a conta, receita e taxa no Financeiro =====
  const e1 = `c19pix${suf}@x.com`;
  const [cod1, pay1, valor1, id1] = await comprar(e1, 'PIX');
  ok('Pedido PIX criado aguardando', sql(`select status from "Pedido" where id='${id1}'`) === 'AGUARDANDO');
  const st1 = await falso.avisar('PAYMENT_RECEIVED', { id: evento(1), payment: { id: pay1, value: 29.9, netValue: 28.91, externalReference: cod1, billingType: 'PIX' } });
  ok('Aviso respondido com 200', st1.length >= 1 && st1.every((s) => s === 200), st1.join(','));
  await processado(evento(1));
  ok('Pedido confirmado pelo "Asaas"', sql(`select status||'|'||"confirmadoPor" from "Pedido" where id='${id1}'`) === 'PAGO|Asaas');
  ok('Conta criada para o cliente', sql(`select count(*) from "Usuario" where email='${e1}'`) === '1' && sql(`select ("empresaId" is not null)::text from "Pedido" where id='${id1}'`) === 'true');
  ok('Receita do pedido no Financeiro', sql(`select valor from "Lancamento" where "pedidoId"='${id1}' and origem='PEDIDO'`) === valor1);
  ok('Taxa do Asaas (R$ 0,99) como despesa paga em "Taxas do Asaas"', sql(`select l.valor||'|'||l.situacao||'|'||c.nome from "Lancamento" l join "CategoriaFinanceira" c on c.id=l."categoriaId" where l."chaveAuto"='asaas-taxa:${pay1}'`) === '99|PAGO|Taxas do Asaas');
  ok('Aviso guardado com o resultado', aviso(evento(1)).startsWith('Pedido confirmado'), aviso(evento(1)));
  ok('Registro em Logs (Pagamentos)', sql(`select count(*) from "Log" where tipo='PAGAMENTOS' and texto like '%${cod1}%confirmado pelo Asaas%'`) === '1');

  // ===== 2. O mesmo aviso de novo e o "confirmado" depois do "recebido": nada se repete =====
  const st2 = await falso.avisar('PAYMENT_RECEIVED', { id: evento(1), payment: { id: pay1, value: 29.9, netValue: 28.91, externalReference: cod1, billingType: 'PIX' } });
  await falso.avisar('PAYMENT_CONFIRMED', { id: evento(2), payment: { id: pay1, value: 29.9, netValue: 28.91, externalReference: cod1, billingType: 'PIX' } });
  await processado(evento(2));
  ok('Aviso repetido: 200 e guardado uma vez só', st2.every((s) => s === 200) && sql(`select count(*) from "AvisoAsaas" where "eventoId"='${evento(1)}'`) === '1');
  ok('Outro evento da mesma cobrança: "já confirmado"', aviso(evento(2)).startsWith('Pedido já confirmado'), aviso(evento(2)));
  ok('Sem conta, receita ou taxa duplicada', sql(`select count(*) from "Usuario" where email='${e1}'`) === '1' && sql(`select count(*) from "Lancamento" where "pedidoId"='${id1}'`) === '2');

  // ===== 3. Cartão em 3 parcelas: confirma uma vez, uma taxa por parcela =====
  const e3 = `c19cartao${suf}@x.com`;
  const [cod3, pay3, valor3, id3] = await comprar(e3, 'CARTAO', 3);
  const parcela = Number(valor3) / 300;
  for (let i = 1; i <= 3; i++) {
    await falso.avisar('PAYMENT_CONFIRMED', { id: evento(30 + i), payment: { id: i === 1 ? pay3 : `${pay3}_p${i}`, value: parcela, netValue: parcela - 0.5, externalReference: cod3, billingType: 'CREDIT_CARD', installment: 'ins_19c' } });
  }
  await processado(evento(33));
  ok('Cartão confirmado na aprovação (PAYMENT_CONFIRMED)', sql(`select status from "Pedido" where id='${id3}'`) === 'PAGO');
  ok('Uma conta só para as 3 parcelas', sql(`select count(*) from "Usuario" where email='${e3}'`) === '1');
  ok('3 taxas de R$ 0,50 (uma por parcela)', sql(`select count(*)||'|'||sum(valor) from "Lancamento" where "pedidoId"='${id3}' and origem='ASAAS'`) === '3|150');

  // ===== 4. Pedido cancelado e pago depois: não confirma, só avisa =====
  const e4 = `c19cancel${suf}@x.com`;
  const [cod4, pay4, , id4] = await comprar(e4, 'BOLETO');
  sql(`update "Pedido" set status='CANCELADO', "canceladoEm"=now() where id='${id4}'`);
  await falso.avisar('PAYMENT_RECEIVED', { id: evento(4), payment: { id: pay4, value: 30.5, netValue: 29.51, externalReference: cod4, billingType: 'BOLETO' } });
  await processado(evento(4));
  ok('Pedido cancelado continua cancelado, sem conta', sql(`select status from "Pedido" where id='${id4}'`) === 'CANCELADO' && sql(`select count(*) from "Usuario" where email='${e4}'`) === '0');
  ok('Resultado: Super Admin avisado', aviso(evento(4)).includes('Super Admin avisado'), aviso(evento(4)));
  ok('Registro em Logs do pagamento do pedido cancelado', sql(`select count(*) from "Log" where tipo='PAGAMENTOS' and texto like '%cancelado ${cod4}%'`) === '1');

  // ===== 5. Contestação no cartão: só avisa, a conta continua ativa =====
  await falso.avisar('PAYMENT_CHARGEBACK_REQUESTED', { id: evento(5), payment: { id: pay3, value: parcela, externalReference: cod3, billingType: 'CREDIT_CARD' } });
  await processado(evento(5));
  ok('Contestação: conta continua ativa', sql(`select e.ativa::text from "Empresa" e join "Pedido" p on p."empresaId"=e.id where p.id='${id3}'`) === 'true' && aviso(evento(5)).startsWith('Contestação'));

  // ===== 6. Estorno: receita negativa no Financeiro e empresa inativada =====
  await falso.avisar('PAYMENT_REFUNDED', { id: evento(6), payment: { id: pay1, value: 29.9, externalReference: cod1, billingType: 'PIX' } });
  await processado(evento(6));
  ok('Estorno de R$ 29,90 ligado à receita do pedido', sql(`select l.valor||'|'||(l."estornoDeId"=r.id)::text from "Lancamento" l join "Lancamento" r on r."pedidoId"=l."pedidoId" and r.origem='PEDIDO' where l."chaveAuto"='asaas-estorno:${pay1}'`) === '-2990|true');
  ok('Empresa inativada', sql(`select e.ativa::text from "Empresa" e join "Pedido" p on p."empresaId"=e.id where p.id='${id1}'`) === 'false');
  await falso.avisar('PAYMENT_REFUNDED', { id: evento(61), payment: { id: pay1, value: 29.9, externalReference: cod1, billingType: 'PIX' } });
  await processado(evento(61));
  ok('Estorno repetido não lança de novo', sql(`select count(*) from "Lancamento" where "pedidoId"='${id1}' and origem='ESTORNO'`) === '1' && aviso(evento(61)).includes('já estava inativa'), aviso(evento(61)));

  // ===== 7. Código desconhecido e token errado =====
  await falso.avisar('PAYMENT_RECEIVED', { id: evento(7), payment: { id: 'pay_x', value: 10, netValue: 9, externalReference: 'NAOEXISTE', billingType: 'PIX' } });
  await processado(evento(7));
  ok('Código desconhecido: ignorado', aviso(evento(7)).startsWith('Ignorado'));
  const r401 = await fetch(BASE + '/api/asaas/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': 'errado' }, body: JSON.stringify({ id: evento(8), event: 'PAYMENT_RECEIVED', payment: { externalReference: cod4 } }) });
  ok('Token errado: 401 e nada guardado', r401.status === 401 && sql(`select count(*) from "AvisoAsaas" where "eventoId"='${evento(8)}'`) === '0');

  // ===== 8. Rotina diária reprocessa aviso que ficou pela metade =====
  const e9 = `c19rotina${suf}@x.com`;
  const [cod9, pay9, , id9] = await comprar(e9, 'PIX');
  const dados9 = JSON.stringify({ id: evento(9), event: 'PAYMENT_RECEIVED', payment: { id: pay9, value: 29.9, netValue: 28.91, externalReference: cod9, billingType: 'PIX' } });
  sql(`insert into "AvisoAsaas" (id,"eventoId",evento,"cobrancaId",referencia,dados,"recebidoEm",erro,tentativas) values ('av19c${suf}','${evento(9)}','PAYMENT_RECEIVED','${pay9}','${cod9}','${dados9}'::jsonb, now() - interval '10 minutes','Site reiniciado',1)`);
  const cron = await fetch(BASE + '/api/cron/renovacao', { headers: { authorization: 'Bearer segredo-teste' } });
  const jc = await cron.json().catch(() => ({}));
  ok('Rotina diária reprocessou o aviso pendente', cron.status === 200 && jc.avisosAsaas >= 1 && sql(`select status from "Pedido" where id='${id9}'`) === 'PAGO', JSON.stringify(jc.avisosAsaas));

  // ===== 9. Telas: Financeiro (taxas) e Logs (Pagamentos) =====
  [c, p] = await novo();
  await entrarSA(p);
  await p.goto(BASE + '/financeiro/lancamentos', { waitUntil: 'networkidle' });
  ok('Financeiro mostra a taxa do Asaas', (await p.locator(`text=Taxa do Asaas — pedido ${cod1}`).count()) >= 1);
  await p.screenshot({ path: OUT + '/financeiro-taxas-asaas.png', fullPage: true });
  await p.goto(BASE + '/logs?tipo=PAGAMENTOS', { waitUntil: 'networkidle' });
  ok('Logs: filtro "Pagamentos (Asaas)" com o estorno', (await p.locator(`td:has-text("Estorno no Asaas do pedido ${cod1}"):has-text("empresa inativada")`).count()) === 1);
  await p.screenshot({ path: OUT + '/logs-pagamentos.png', fullPage: true });
  await c.close();
  await b.close(); srv.close();

  // Limpeza
  const [prazo, periodo, preco] = antes;
  sql(`update "Plano" set "prazoDias"=${prazo}, periodo='${periodo}', "precoAtual"=${preco} where id='${PLANO}'`);
  sql(`update "ConfigVenda" set "asaasChave"=null, "asaasConta"=null, "jurosParcelaMes"=null where id='config'`);
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.filter((r) => r.startsWith('PASSOU')).length} passaram, ${res.filter((r) => r.startsWith('FALHOU')).length} falharam`);
})().catch((e) => {
  console.error(e);
  try { sql(`update "Plano" set "prazoDias"=31, periodo='mês' where nome='Individual' and modulo='INDIVIDUAL'`); sql(`update "ConfigVenda" set "asaasChave"=null, "jurosParcelaMes"=null where id='config'`); } catch {}
  process.exit(1);
});
