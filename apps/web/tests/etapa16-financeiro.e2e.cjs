// Teste de ponta a ponta da decisão #106: gestão financeira do Super Admin.
// Requer: app em http://localhost:3005 (CRON_SECRET=segredo-teste), serviço 24/7 em :4000 e Postgres com seed.
// Uso: node apps/web/tests/etapa16-financeiro.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
const txt = (s) => s.replace(/ /g, ' ');
const limpar = () => { sql(`delete from "Lancamento"`); sql(`delete from "DespesaFixa"`); sql(`delete from "ContaBancaria"`); sql(`delete from "CategoriaFinanceira" where not padrao`); };
// Mês anterior (para a despesa com IA)
const agoraSP = new Date(Date.now() - 3 * 3600_000);
const mesAnt = new Date(Date.UTC(agoraSP.getUTCFullYear(), agoraSP.getUTCMonth() - 1, 15, 15));
const hoje = agoraSP.toISOString().slice(0, 10);
const ontem = new Date(Date.now() - 3 * 3600_000 - 86400_000).toISOString().slice(0, 10);
const amanha = new Date(Date.now() - 3 * 3600_000 + 86400_000).toISOString().slice(0, 10);

(async () => {
  const cot = sql(`select coalesce("cotacaoDolar"::text,'null')||'|'||coalesce("aliquotaImposto"::text,'null') from "ConfigVenda" where id='config'`);
  limpar();
  sql(`update "ConfigVenda" set "aliquotaImposto"=null, "avisoFinanceiroEm"=null, "cotacaoDolar"=5 where id='config'`);
  sql(`delete from "UsoIA" where modelo='teste-fin'`);
  sql(`insert into "UsoIA"(id,tarefa,provedor,modelo,"custoUsd","criadoEm") values ('uso-fin','conversar','simulado','teste-fin',10,'${mesAnt.toISOString()}')`);
  const PLANO = sql(`select id from "Plano" where modulo='INDIVIDUAL' and not personalizado order by ordem limit 1`);
  sql(`delete from "Pedido" where codigo='FINTEST1'`);
  sql(`insert into "Pedido"(id,codigo,status,"planoId","planoNome",modulo,"prazoDias",valor,nome,email,whatsapp,"pixCopiaECola","expiraEm","confirmadoEm","somenteExtras","pacotesDisparos") values ('ped-fin','FINTEST1','PAGO','${PLANO}','Individual','INDIVIDUAL',31,4990,'Cliente Financeiro','fin@exemplo.com','11999990000','x',now(),now(),true,500)`);
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => { await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`); await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard'); };
  try {
    let [c, p] = await novo();
    await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
    ok('Menu tem o grupo Financeiro', (await p.locator('aside nav >> text=Painel financeiro').count()) === 1 && (await p.locator('aside nav >> text=Contas a pagar e receber').count()) === 1);
    await p.goto(BASE + '/financeiro'); await espera(1000);
    const pagos = Number(sql(`select count(*) from "Pedido" where status='PAGO'`));
    ok('Pedidos pagos (inclusive antigos) viram receitas', Number(sql(`select count(*) from "Lancamento" where origem='PEDIDO'`)) === pagos, String(pagos));
    ok('Categorias prontas criadas', Number(sql(`select count(*) from "CategoriaFinanceira" where padrao`)) === 17);
    ok('Pacote de disparos na categoria certa', sql(`select c.nome from "Lancamento" l join "CategoriaFinanceira" c on c.id=l."categoriaId" where l."pedidoId"='ped-fin'`) === 'Pacotes de disparos');
    ok('Despesa com IA do mês anterior lançada sozinha (US$ 10 × R$ 5)', sql(`select valor||'|'||situacao from "Lancamento" where origem='IA'`) === '5000|PAGO');
    const recMes = Number(sql(`select coalesce(sum(valor),0) from "Lancamento" where tipo='RECEITA' and situacao='PAGO' and "pagoEm" >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`));
    ok('Painel: receitas do mês', txt(await p.locator('[data-testid=fin-receitas]').innerText()) === brl(recMes), `${txt(await p.locator('[data-testid=fin-receitas]').innerText())} x ${brl(recMes)}`);
    // Sincronizar de novo não duplica
    await p.reload(); await espera(800);
    ok('Abrir de novo não duplica lançamentos', Number(sql(`select count(*) from "Lancamento" where origem in ('PEDIDO','IA')`)) === pagos + 1);

    // Configurações: alíquota, conta, categoria
    await p.goto(BASE + '/financeiro/configuracoes'); await espera(700);
    await p.fill('[aria-label="Alíquota (%)"]', '6'); await p.click('button:has-text("Salvar")'); await espera(800);
    await p.fill('[aria-label="Nome da conta"]', 'Banco Teste'); await p.click('button:has-text("Adicionar conta")'); await espera(800);
    await p.selectOption('[aria-label="Tipo da categoria"]', 'DESPESA'); await p.fill('[aria-label="Nome da categoria"]', 'Contabilidade'); await p.click('button:has-text("Criar categoria")'); await espera(800);
    ok('Configurações salvas', sql(`select "aliquotaImposto" from "ConfigVenda" where id='config'`) === '6' && sql(`select count(*) from "ContaBancaria" where nome='Banco Teste'`) === '1' && sql(`select count(*) from "CategoriaFinanceira" where nome='Contabilidade'`) === '1');
    await p.goto(BASE + '/financeiro'); await espera(800);
    ok('Imposto previsto = 6% do recebido', txt(await p.locator('[data-testid=fin-imposto]').innerText()) === brl(Math.round(recMes * 0.06)));

    // Lançamentos
    await p.goto(BASE + '/financeiro/lancamentos'); await espera(700);
    await p.click('[data-testid=novo-lancamento] summary');
    await p.fill('[aria-label="Descrição"]', 'Hospedagem teste'); await p.fill('[aria-label="Valor"]', '100,00');
    await p.selectOption('[aria-label="Conta"]', { label: 'Banco Teste' });
    await p.setInputFiles('[aria-label="Comprovante"]', { name: 'nota.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await p.click('button:has-text("Salvar lançamento")'); await espera(1500);
    const hosp = sql(`select id||'|'||valor||'|'||situacao||'|'||("comprovanteTipo" is not null) from "Lancamento" where descricao='Hospedagem teste'`);
    ok('Despesa manual paga com comprovante', /\|10000\|PAGO\|true$/.test(hosp), hosp);
    const st = await p.evaluate(async (id) => (await fetch('/api/financeiro/comprovante/' + id)).status, hosp.split('|')[0]);
    ok('Comprovante abre', st === 200, String(st));
    // Pendente vencida
    await p.click('[data-testid=novo-lancamento] summary').catch(() => undefined);
    if (!(await p.locator('[aria-label="Descrição"]').isVisible())) await p.click('[data-testid=novo-lancamento] summary');
    await p.fill('[aria-label="Descrição"]', 'Conta vencida teste'); await p.fill('[aria-label="Valor"]', '50'); await p.fill('[aria-label="Vencimento"]', ontem);
    await p.uncheck('[aria-label="Já foi pago"]'); await p.click('button:has-text("Salvar lançamento")'); await espera(1200);
    ok('Despesa pendente criada', sql(`select situacao from "Lancamento" where descricao='Conta vencida teste'`) === 'PENDENTE');
    await p.screenshot({ path: OUT + '/fin-lancamentos.png', fullPage: true });

    // Contas a pagar e receber
    await p.goto(BASE + '/financeiro/contas'); await espera(800);
    ok('Vencida aparece em Vencidas', (await p.locator('[data-testid="grupo-Vencidas"] >> text=Conta vencida teste').count()) === 1);
    await p.screenshot({ path: OUT + '/fin-contas.png', fullPage: true });
    // Aviso de contas vencendo (rotina diária) — 1 vez por dia
    sql(`insert into "Lancamento"(id,tipo,descricao,valor,vencimento,situacao,"atualizadoEm") values ('lan-amanha','RECEITA','Receber amanhã teste',20000,'${amanha}T15:00:00Z','PENDENTE',now())`);
    const cron = async () => (await fetch(BASE + '/api/cron/renovacao', { headers: { authorization: 'Bearer segredo-teste' } })).json();
    const c1 = await cron(); const c2 = await cron();
    ok('Rotina diária avisa as contas vencendo', c1.financeiro?.contasAvisadas >= 2, JSON.stringify(c1.financeiro));
    ok('Aviso só 1 vez por dia', c2.financeiro?.contasAvisadas === 0);
    // Pagar a vencida
    await p.locator('[data-testid="grupo-Vencidas"] tr', { hasText: 'Conta vencida teste' }).locator('button:has-text("Pagar")').click();
    await p.locator('[data-testid="grupo-Vencidas"] button:has-text("Confirmar")').click(); await espera(1500);
    ok('Pagar a conta', sql(`select situacao||'|'||("pagoEm" is not null) from "Lancamento" where descricao='Conta vencida teste'`) === 'PAGO|true');

    // Despesas fixas
    await p.goto(BASE + '/financeiro/fixas'); await espera(700);
    await p.fill('[aria-label="Descrição da despesa fixa"]', 'VPS teste'); await p.fill('[aria-label="Valor mensal"]', '80,00'); await p.fill('[aria-label="Dia do vencimento"]', '5');
    await p.click('button:has-text("Adicionar")'); await espera(1500);
    await p.reload(); await espera(800);
    ok('Despesa fixa lança a do mês (sem repetir)', sql(`select count(*)||'|'||min(valor)||'|'||min(situacao::text) from "Lancamento" where origem='FIXA'`) === '1|8000|PENDENTE');
    await p.screenshot({ path: OUT + '/fin-fixas.png', fullPage: true });

    // Estorno parcial de uma receita de pedido
    const antesRec = Number(sql(`select coalesce(sum(valor),0) from "Lancamento" where tipo='RECEITA' and situacao='PAGO'`));
    await p.goto(BASE + '/financeiro/lancamentos?busca=FINTEST1'); await espera(800);
    await p.click('button:has-text("Estornar")'); await p.fill('form:has(input[name=motivo]) input[name=valor]', '10,00'); await p.fill('input[name=motivo]', 'Desconto combinado');
    await p.locator('form:has(input[name=motivo]) button:has-text("Estornar")').click(); await espera(1500);
    ok('Estorno abate do faturamento', Number(sql(`select coalesce(sum(valor),0) from "Lancamento" where tipo='RECEITA' and situacao='PAGO'`)) === antesRec - 1000);
    ok('Estorno ligado ao pedido', sql(`select count(*) from "Lancamento" where origem='ESTORNO' and "pedidoId"='ped-fin' and valor=-1000`) === '1');
    await p.click('button:has-text("Estornar")').catch(() => undefined);
    await p.fill('form:has(input[name=motivo]) input[name=valor]', '100,00').catch(() => undefined);
    await p.locator('form:has(input[name=motivo]) button:has-text("Estornar")').click().catch(() => undefined); await espera(1000);
    ok('Não estorna mais do que recebeu', sql(`select count(*) from "Lancamento" where origem='ESTORNO'`) === '1');
    ok('Receita de pedido não pode ser cancelada', (await p.locator('tr:has-text("FINTEST1") >> button:has-text("Cancelar")').count()) === 0);

    // Relatórios
    let todos = true;
    for (const t of ['resultado', 'fluxo', 'por-plano', 'por-tipo', 'recorrente', 'cancelamentos', 'renovacoes']) {
      await p.goto(BASE + `/financeiro/relatorios?tipo=${t}`); await espera(600);
      const okT = (await p.locator('[data-testid=resumo]').count()) === 1;
      const x = await p.evaluate(async (u) => { const r = await fetch(u); return [r.status, r.headers.get('content-type')]; }, `/api/financeiro/relatorios/${t}`);
      if (!okT || x[0] !== 200 || !String(x[1]).includes('spreadsheet')) { todos = false; ok(`Relatório ${t}`, false, JSON.stringify(x)); }
    }
    ok('Os 7 relatórios abrem e baixam em Excel', todos);
    await p.goto(BASE + '/financeiro/relatorios?tipo=resultado'); await espera(600);
    await p.screenshot({ path: OUT + '/fin-relatorio.png', fullPage: true });
    const linhaTotal = await p.locator('[data-testid=tabela-relatorio] tr:has-text("Total")').innerText();
    ok('Resultado tem a linha de total', linhaTotal.includes('R$'));
    await p.goto(BASE + '/financeiro/relatorios?tipo=por-tipo&imprimir=1'); await espera(800);
    ok('Impressão no padrão (cabeçalho com quem emitiu)', (await p.locator('[data-testid=cabecalho-impressao] >> text=Emitido por').count()) === 1);
    await p.goto(BASE + '/financeiro'); await espera(800);
    await p.screenshot({ path: OUT + '/fin-painel.png', fullPage: true });
    ok('Painel mostra contas vencendo e receita recorrente', (await p.locator('[data-testid=fin-mrr]').count()) === 1 && (await p.locator('[data-testid=grafico-12-meses]').count()) === 1);
    await c.close();

    // Só o Super Admin
    [c, p] = await novo();
    await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
    await p.goto(BASE + '/financeiro'); await espera(600);
    ok('Admin da Empresa não abre o Financeiro', !p.url().includes('/financeiro'));
    const x = await p.evaluate(async () => (await fetch('/api/financeiro/relatorios/resultado')).status);
    ok('Admin não baixa relatório financeiro', x === 403, String(x));
    await c.close();
  } catch (e) {
    ok('Erro inesperado no teste', false, String(e.message).split('\n')[0].slice(0, 160));
  } finally {
    await b.close();
    limpar();
    const [cd, al] = cot.split('|');
    sql(`update "ConfigVenda" set "cotacaoDolar"=${cd || 'null'}, "aliquotaImposto"=${al || 'null'}, "avisoFinanceiroEm"=null where id='config'`);
    sql(`delete from "UsoIA" where modelo='teste-fin'`);
    sql(`delete from "Pedido" where codigo='FINTEST1'`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
