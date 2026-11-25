// Teste de ponta a ponta da decisão #115, etapa B: o cliente escolhe PIX, cartão (à vista ou parcelado) ou boleto (+2%) pelo Asaas.
// Cobre a compra no popup Planos, CPF/CNPJ, juros do parcelamento, Pedidos (forma), cancelar (apaga no Asaas),
// CPF guardado na conta, renovação com a forma de pagamento e o PIX manual como reserva com o Asaas desligado.
// Requer: site em http://localhost:3005 iniciado com ASAAS_URL=http://127.0.0.1:4010 e Postgres com seed (PIX manual configurado pelo 4a).
// Uso: node apps/web/tests/etapa19b-asaas-pagamento.e2e.cjs <pasta-prints>
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
const ate = async (fn, vezes = 40) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };
const reais = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
// Mesma conta do sistema (tabela Price, arredondando a parcela para cima)
const parcelas = (v, n, j) => { const i = j / 100; const p = Math.ceil((v * i) / (1 - Math.pow(1 + i, -n))); return { parcela: p, total: p * n }; };

(async () => {
  const srv = await falso.iniciar();
  const PLANO = sql(`select id from "Plano" where nome='Individual' and modulo='INDIVIDUAL'`);
  const antes = sql(`select "prazoDias"||'|'||periodo||'|'||coalesce("precoAtual"::text,'null') from "Plano" where id='${PLANO}'`).split('|');
  // Individual vira trimestral (para testar o parcelamento)
  sql(`update "Plano" set "prazoDias"=93, periodo='trimestre', "precoAtual"=2990 where id='${PLANO}'`);
  sql(`update "ConfigVenda" set "asaasChave"=null, "jurosParcelaMes"=null where id='config'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrarSA = async (p) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', 'superadmin@disparopro.com.br'); await p.fill('#senha', 'Super@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const abrirPlano = async (p, nome) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.click('button:has-text("Planos")'); await espera(800);
    if (!(await p.locator(`[aria-label="Planos"] article:has-text("${nome}")`).count()) && (await p.locator('[data-testid=aba-modulo-EMPRESARIAL]').count())) { await p.click('[data-testid=aba-modulo-EMPRESARIAL]'); await espera(300); }
    await p.locator(`[aria-label="Planos"] article:has-text("${nome}")`).first().locator('[data-parte=botao]').click(); await espera(500);
  };
  const dados = async (p, email) => { await p.fill('#ck-nome', 'Paula Pagamento'); await p.fill('#ck-email', email); await p.fill('#ck-whats', '11987650000'); };

  // ===== 0. Super Admin liga o Asaas e define os juros =====
  let [c, p] = await novo();
  await entrarSA(p);
  await p.goto(BASE + '/pagamento'); await espera(800);
  await p.fill('#asaasChave', '$aact_hmlg_teste'); await p.click('[data-testid=salvar-asaas]');
  ok('Asaas conectado', await ate(async () => (await p.locator('[data-testid=estado-asaas]').innerText()).includes('Conectado')));
  await p.fill('#jurosParcelaMes', '2,99'); await p.click('[data-testid=salvar-juros]');
  ok('Juros de 2,99% ao mês salvos', await ate(() => sql(`select "jurosParcelaMes" from "ConfigVenda" where id='config'`) === '2.99'));
  await p.screenshot({ path: OUT + '/pagamento-juros.png', fullPage: true });
  await c.close();

  // ===== 1. PIX pelo Asaas =====
  [c, p] = await novo();
  const e1 = `pix${suf}@x.com`;
  await abrirPlano(p, 'Individual');
  ok('Pagamento mostra CPF/CNPJ e as 3 formas', (await p.locator('#ck-documento').count()) === 1 && (await p.locator('[data-testid^=forma-]').count()) === 3);
  await dados(p, e1);
  await p.fill('#ck-documento', '111.111.111-11'); await p.click('button:has-text("Gerar PIX")');
  ok('CPF inválido é recusado', await ate(async () => (await p.locator('text=Informe um CPF ou CNPJ válido').count()) === 1));
  await p.fill('#ck-documento', CPF);
  ok('CPF com máscara', (await p.inputValue('#ck-documento')) === CPF);
  await p.screenshot({ path: OUT + '/checkout-formas.png' });
  await p.click('button:has-text("Gerar PIX")');
  ok('PIX do Asaas na tela (QR Code e copia e cola)', await ate(async () => (await p.locator('[data-testid=pagar-pix]').count()) === 1) && (await p.inputValue('#pix-cc')).includes('PIXASAAS') && (await p.getAttribute('img[alt="QR Code do PIX"]', 'src')).startsWith('data:image/png;base64,'));
  ok('Pedido: forma PIX, código do Asaas, CPF e valor R$ 29,90', sql(`select forma||'|'||("asaasId" is not null)||'|'||"cpfCnpj"||'|'||valor from "Pedido" where email='${e1}'`) === 'PIX|true|52998224725|2990');
  const cob1 = falso.cobrancas[falso.cobrancas.length - 1] || {};
  ok('Cobrança no Asaas: PIX, R$ 29,90, referência = código do pedido', cob1.billingType === 'PIX' && cob1.value === 29.9 && cob1.externalReference === sql(`select codigo from "Pedido" where email='${e1}'`));
  ok('Cliente criado no Asaas com o CPF', falso.clientes.length === 1 && falso.clientes[0].cpfCnpj === '52998224725');
  await c.close();

  // ===== 2. Boleto (+2%) =====
  [c, p] = await novo();
  const e2 = `boleto${suf}@x.com`;
  await abrirPlano(p, 'Individual'); await dados(p, e2); await p.fill('#ck-documento', CPF);
  await p.click('[data-testid=forma-BOLETO]');
  ok('Boleto: total com 2% (R$ 30,50)', (await p.locator('[data-testid=total-forma]').innerText()).includes('30,50'));
  await p.click('button:has-text("Gerar boleto")');
  ok('Boleto na tela: link e linha digitável', await ate(async () => (await p.locator('[data-testid=pagar-boleto]').count()) === 1) && (await p.inputValue('#boleto-linha')).length > 40 && (await p.getAttribute('[data-testid=link-boleto]', 'href')).includes('/b/pdf/'));
  ok('Pedido de boleto com R$ 30,50 e cliente reaproveitado', sql(`select forma||'|'||valor from "Pedido" where email='${e2}'`) === 'BOLETO|3050' && falso.clientes.length === 1);
  await p.screenshot({ path: OUT + '/boleto.png' });
  await c.close();

  // ===== 3. Cartão parcelado (trimestral, até 6x com juros) =====
  [c, p] = await novo();
  const e3 = `cartao${suf}@x.com`;
  await abrirPlano(p, 'Individual'); await dados(p, e3); await p.fill('#ck-documento', CPF);
  await p.click('[data-testid=forma-CARTAO]');
  // Cartão avulso (parcelado): desmarca a cobrança automática, que vem marcada (decisão #124, item a)
  await p.uncheck('[data-testid=cobranca-automatica]');
  ok('Cartão em plano trimestral: parcelas de 1 a 6', (await p.locator('#ck-parcelas option').count()) === 6);
  await p.selectOption('#ck-parcelas', '3');
  const pp = parcelas(2990, 3, 2.99);
  ok(`3x com juros: ${reais(pp.parcela)} cada, total ${reais(pp.total)}`, (await p.locator('[data-testid=total-forma]').innerText()).includes(reais(pp.total).replace('R$ ', '')) && (await p.locator('[data-testid=total-forma]').innerText()).includes(reais(pp.parcela).replace('R$ ', '')), await p.locator('[data-testid=total-forma]').innerText());
  await p.screenshot({ path: OUT + '/cartao-parcelas.png' });
  await p.click('button:has-text("Pagar com cartão")');
  ok('Cartão: link para a página do Asaas', await ate(async () => (await p.locator('[data-testid=pagar-cartao]').count()) === 1) && (await p.getAttribute('[data-testid=link-cartao]', 'href')).startsWith('https://sandbox.asaas.com/i/'));
  const cob3 = falso.cobrancas[falso.cobrancas.length - 1] || {};
  ok('Cobrança parcelada no Asaas: cartão, 3 parcelas e o total com juros', cob3.billingType === 'CREDIT_CARD' && cob3.installmentCount === 3 && Math.round(cob3.totalValue * 100) === pp.total);
  ok('Pedido: CARTAO, 3 parcelas, valor com juros', sql(`select forma||'|'||parcelas||'|'||valor from "Pedido" where email='${e3}'`) === `CARTAO|3|${pp.total}`);
  await c.close();

  // ===== 4. Plano mensal: cartão só à vista =====
  [c, p] = await novo();
  await abrirPlano(p, 'Básico');
  await p.click('[data-testid=forma-CARTAO]');
  ok('Plano mensal: cartão sem parcelas', (await p.locator('#ck-parcelas').count()) === 0);
  await c.close();

  // ===== 5. Pedidos: forma de pagamento, cancelar apaga no Asaas, confirmar guarda o CPF na conta =====
  [c, p] = await novo();
  await entrarSA(p);
  await p.goto(BASE + '/pedidos'); await espera(800);
  const forma = async (email) => (await p.locator(`tr:has-text("${email}") [data-testid=forma-pedido]`).innerText().catch(() => '')).trim();
  ok('Pedidos mostra a forma (PIX Asaas, Boleto, Cartão 3x)', (await forma(e1)) === 'PIX (Asaas)' && (await forma(e2)) === 'Boleto' && (await forma(e3)) === 'Cartão 3x', `${await forma(e1)} / ${await forma(e2)} / ${await forma(e3)}`);
  await p.screenshot({ path: OUT + '/pedidos-formas.png' });
  const idBoleto = sql(`select "asaasId" from "Pedido" where email='${e2}'`);
  await p.click(`tr:has-text("${e2}") >> button:has-text("Cancelar")`);
  ok('Cancelar o pedido apaga a cobrança no Asaas', await ate(() => sql(`select status from "Pedido" where email='${e2}'`) === 'CANCELADO') && await ate(async () => !!falso.cobrancas.find((x) => x.id === idBoleto)?.deleted));
  await p.click(`tr:has-text("${e1}") >> text=Confirmar pagamento`);
  ok('Confirmar guarda o CPF na conta criada', await ate(() => sql(`select coalesce(e."cpfCnpj",'') from "Empresa" e join "Pedido" p on p."empresaId"=e.id where p.email='${e1}'`) === '52998224725'));
  await c.close();

  // ===== 6. Renovação: passo da forma de pagamento, CPF já guardado =====
  const EMP = sql(`select "empresaId" from "Pedido" where email='${e1}'`);
  sql(`update "Empresa" set "tokenRenovacao"='tok-19b-${suf}' where id='${EMP}'`);
  [c, p] = await novo();
  await p.goto(BASE + `/renovar/tok-19b-${suf}`, { waitUntil: 'networkidle' }); await espera(800);
  await p.locator('article:has-text("Individual")').first().locator('[data-parte=botao]').click(); await espera(400);
  ok('Renovação: passo da forma de pagamento com o CPF já cadastrado', (await p.locator('[data-testid=passo-forma]').count()) === 1 && (await p.getAttribute('#ck-documento', 'placeholder')).includes('final 25'));
  await p.click('[data-testid=forma-BOLETO]');
  await p.click('[data-testid=passo-forma] button:has-text("Gerar boleto")');
  ok('Renovação por boleto usa o CPF guardado', await ate(() => sql(`select forma||'|'||"cpfCnpj"||'|'||valor from "Pedido" where "empresaId"='${EMP}' and renovacao order by "criadoEm" desc limit 1`) === 'BOLETO|52998224725|3050'));
  await p.screenshot({ path: OUT + '/renovar-forma.png', fullPage: true });
  await c.close();

  // ===== 7. Asaas desligado: volta o PIX manual (reserva) =====
  sql(`update "ConfigVenda" set "asaasChave"=null where id='config'`);
  [c, p] = await novo();
  const e4 = `manual${suf}@x.com`;
  await abrirPlano(p, 'Individual'); await dados(p, e4);
  ok('Sem Asaas: sem CPF e sem formas, só "Gerar PIX"', (await p.locator('[data-testid=escolha-pagamento]').count()) === 0 && (await p.locator('button:has-text("Gerar PIX")').count()) === 1);
  await p.click('button:has-text("Gerar PIX")');
  ok('PIX manual gerado (forma PIX_MANUAL)', await ate(async () => (await p.locator('[data-testid=pagar-pix]').count()) === 1) && sql(`select forma from "Pedido" where email='${e4}'`) === 'PIX_MANUAL');
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
