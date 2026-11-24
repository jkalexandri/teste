// Teste de ponta a ponta da etapa 9a (IA trocável, despesas com IA e "Atualizar prévia" — decisões #72, #75, #77).
// Usa a IA "simulada" (sem custo). Requer: app em http://localhost:3005 (CHAVE_CRIPTO definida) e Postgres com seed.
// Uso: node apps/web/tests/etapa9a-ia.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo', IND = 'teste-conta-individual';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn) => { for (let i = 0; i < 30; i++) { if (fn()) return true; await espera(200); } return false; };

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  sql(`delete from "ConfigIA"`); sql(`delete from "UsoIA"`); sql(`update "ConfigVenda" set "cotacaoDolar"=null`);
  sql(`delete from "Campanha" where "usuarioId"='${ANA}'`);
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'], status='ATIVO' where id='${ANA}'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };

  // ===== 1. Super Admin configura a IA =====
  let [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Menu: Inteligência Artificial e Despesas com IA', (await p.locator('aside nav >> text=Inteligência Artificial').count()) === 1 && (await p.locator('aside nav >> text=Despesas com IA').count()) === 1);
  await p.click('aside nav >> text=Inteligência Artificial'); await p.waitForURL('**/inteligencia-artificial');
  ok('4 tarefas, padrão Claude Haiku 5.5 (#75)', (await p.locator('form[data-tarefa]').count()) === 4 && (await p.inputValue('#mod-gerar_mensagens')) === 'claude-haiku-5-5' && (await p.inputValue('#pe-gerar_mensagens')) === '0.1');
  // Trocar modelo atualiza os preços
  await p.selectOption('#mod-qualificar', 'claude-opus-5-5');
  ok('Trocar o modelo preenche os preços da tabela', (await p.inputValue('#pe-qualificar')) === '4' && (await p.inputValue('#ps-qualificar')) === '20');
  // Chave salva criptografada
  await p.fill('#key-qualificar', 'sk-ant-teste-123'); await p.click('form[data-tarefa=qualificar] >> button:has-text("Salvar")');
  ok('Chave guardada criptografada (nunca em texto puro)', await ate(() => /^v1:/.test(sql(`select coalesce(chave,'') from "ConfigIA" where tarefa='qualificar'`))) && !sql(`select chave from "ConfigIA" where tarefa='qualificar'`).includes('sk-ant'));
  await espera(800);
  ok('Tela mostra "chave salva" sem revelar a chave', (await p.locator('form[data-tarefa=qualificar] .chip:has-text("chave salva")').count()) === 1 && (await p.inputValue('#key-qualificar')) === '');
  // Simulado + Testar
  await p.selectOption('#prov-gerar_mensagens', 'simulado'); await p.fill('#mod-gerar_mensagens', 'simulado');
  await p.click('form[data-tarefa=gerar_mensagens] >> button:has-text("Testar")');
  await p.waitForSelector('form[data-tarefa=gerar_mensagens] [data-testid=resultado-teste-ia]');
  ok('Botão Testar responde antes de salvar (#72)', (await p.locator('form[data-tarefa=gerar_mensagens] [data-testid=resultado-teste-ia]').innerText()).includes('Funcionou'));
  ok('Testar não salva a configuração', sql(`select count(*) from "ConfigIA" where tarefa='gerar_mensagens'`) === '0');
  await p.click('form[data-tarefa=gerar_mensagens] >> button:has-text("Salvar")');
  ok('Salvar troca a IA sem mexer no código', await ate(() => sql(`select provedor||'|'||modelo from "ConfigIA" where tarefa='gerar_mensagens'`) === 'simulado|simulado'));
  await espera(1000);
  ok('Tela continua funcionando depois de salvar com o provedor simulado', (await p.locator('#prov-conversar').count()) === 1);
  // Padrão compatível exige endereço
  await p.selectOption('#prov-conversar', 'compativel'); await p.fill('#mod-conversar', 'gemini-teste');
  await p.click('form[data-tarefa=conversar] >> button:has-text("Testar")'); await p.waitForSelector('form[data-tarefa=conversar] [data-testid=resultado-teste-ia]');
  ok('Padrão compatível pede o endereço do provedor', (await p.locator('form[data-tarefa=conversar] [data-testid=resultado-teste-ia]').innerText()).includes('endereço do provedor'));
  await p.fill('#cotacao', '5,40'); await p.click('button:has-text("Salvar cotação")');
  ok('Cotação do dólar salva', await ate(() => sql(`select "cotacaoDolar" from "ConfigVenda" where id='config'`) === '5.4'));
  // Testar de uma tarefa sem chave própria usa a chave única da Anthropic (como o uso real)
  await p.fill('#chave-global', 'sk-ant-teste-global'); await p.click('button:has-text("Salvar chave")');
  await ate(() => /^v1:/.test(sql(`select coalesce(chave,'') from "ConfigIA" where tarefa='_anthropic'`)));
  await espera(800);
  await p.click('form[data-tarefa=aprender] >> button:has-text("Testar")'); await p.waitForSelector('form[data-tarefa=aprender] [data-testid=resultado-teste-ia]');
  const resAprender = await p.locator('form[data-tarefa=aprender] [data-testid=resultado-teste-ia]').innerText();
  ok('Testar sem chave própria usa a chave única (não diz "não configurada")', !resAprender.includes('não configurada'), resAprender.slice(0, 120));
  sql(`delete from "ConfigIA" where tarefa='_anthropic'`);
  await p.screenshot({ path: OUT + '/inteligencia-artificial.png', fullPage: true });
  await c.close();

  // ===== 2. Usuário gera a mensagem com a IA =====
  [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
  await p.goto(BASE + '/campanhas?aba=nova'); await espera(800);
  ok('"Atualizar prévia" bloqueado sem referência', await p.locator('button:has-text("Atualizar prévia")').isDisabled());
  await p.fill('#assunto', 'Campanha IA'); await p.fill('#referencia', 'Quero apresentar nosso serviço de limpeza para clínicas');
  await p.click('button:has-text("Atualizar prévia")');
  ok('IA escreve a mensagem principal no campo (editável)', await (async () => { for (let i = 0; i < 30; i++) { if ((await p.inputValue('#msg')).includes('{nome}')) return true; await espera(200); } return false; })());
  ok('3 variações prontas, sem mostrar o texto delas (#70, #77)', (await p.locator('[data-testid=variacoes-geradas]').innerText()).includes('3 variações') && (await p.locator('text=Variação 1').count()) === 0);
  await p.click('button:has-text("Salvar rascunho")');
  ok('Rascunho guarda a principal e as 3 variações', await ate(() => sql(`select array_length(variacoes,1) from "Campanha" where assunto='Campanha IA'`) === '3'));
  ok('Uso da IA registrado com a conta do usuário', sql(`select count(*) from "UsoIA" where tarefa='gerar_mensagens' and "empresaId"='${EMP}' and "usuarioId"='${ANA}' and ok`) === '1');
  await p.screenshot({ path: OUT + '/campanha-ia.png', fullPage: true });
  await c.close();

  // ===== 3. Despesas com IA =====
  // Gastos fictícios de hoje para o ranking (empresa e individual)
  sql(`insert into "UsoIA"(id,tarefa,provedor,modelo,"empresaId",entrada,saida,"custoUsd","criadoEm") values ('t9a-1','conversar','anthropic','claude-haiku-5-5','${EMP}',1000,100,0.5,now()),('t9a-2','conversar','anthropic','claude-haiku-5-5','${IND}',1000,100,1.25,now())`);
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.click('aside nav >> text=Despesas com IA'); await p.waitForURL('**/despesas-ia');
  const gasto = await p.locator('[data-kpi="Gasto no período"]').innerText();
  ok('Gasto do período em dólar e reais (#77)', gasto.includes('US$ 1,75') && gasto.includes('R$ 9,45'), gasto.replace(/\s+/g, ' '));
  ok('Ranking de empresas', (await p.locator('tr[data-conta="Empresa Exemplo"]').innerText()).includes('US$ 0,50'));
  ok('Ranking de individuais separado', (await p.locator('tr[data-conta="Conta Individual — Usuário Demo"]').innerText()).includes('US$ 1,25'));
  ok('Gráfico de hoje com 24 horas', (await p.locator('[data-barra]').count()) === 24);
  await p.screenshot({ path: OUT + '/despesas-ia.png', fullPage: true });
  await p.click('a:has-text("Últimos 7 dias")'); await p.waitForURL('**periodo=7d');
  ok('Período 7 dias (7 barras)', (await p.locator('[data-barra]').count()) === 7);
  await p.click('a:has-text("Mês atual")'); await p.waitForURL('**periodo=mes');
  ok('Mês atual', (await p.locator('[data-barra]').count()) >= 1);
  await p.click('a:has-text("Escolher período")'); await p.waitForURL('**periodo=periodo**');
  ok('Período escolhido com datas', (await p.locator('#de').count()) === 1 && (await p.locator('#ate').count()) === 1);
  // Atualiza sozinha: novo gasto aparece sem recarregar
  await p.click('a:has-text("Hoje")'); await p.waitForURL('**periodo=hoje');
  sql(`insert into "UsoIA"(id,tarefa,provedor,modelo,"empresaId","custoUsd","criadoEm") values ('t9a-3','conversar','anthropic','claude-haiku-5-5','${EMP}',1,now())`);
  await espera(16500);
  ok('Tela se atualiza sozinha a cada 15 s', (await p.locator('[data-kpi="Gasto no período"]').innerText()).includes('US$ 2,75'));
  await c.close();

  // ===== 4. Admin da Empresa não acessa =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  await p.goto(BASE + '/inteligencia-artificial'); await espera(600);
  ok('Admin da Empresa não abre o menu de IA', p.url().endsWith('/dashboard'));
  await c.close();

  sql(`delete from "ConfigIA"`); sql(`delete from "UsoIA"`); sql(`delete from "Campanha" where "usuarioId"='${ANA}'`);
  await b.close();
  console.log(res.join('\n'));
  console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
