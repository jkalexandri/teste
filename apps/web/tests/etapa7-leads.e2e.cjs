// Teste de ponta a ponta da etapa 7 (Leads — decisões #53 a #63).
// Requer: app em http://localhost:3005 e Postgres local com seed.
// Uso: node apps/web/tests/etapa7-leads.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const ARQ = (n) => path.join(__dirname, 'arquivos', n);
const EMP = 'teste-empresa-exemplo', IND = 'teste-conta-individual';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Espera até a condição no banco ficar verdadeira (máx. 6 s)
const ate = async (fn) => { for (let i = 0; i < 30; i++) { if (fn()) return true; await espera(200); } return false; };

(async () => {
  // ---- Estado inicial ----
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const ANA_COD = sql(`select codigo from "Usuario" where id='${ANA}'`);
  const IND_USER = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  sql(`delete from "Lead" where "empresaId" in ('${EMP}','${IND}') or "usuarioId" in (select id from "Usuario" where cargo='SUPERADMIN')`);
  sql(`delete from "Sessao" where "usuarioId"='teste-beto'`); sql(`delete from "Usuario" where id='teste-beto'`);
  sql(`insert into "Usuario"(id,codigo,nome,email,whatsapp,cargo,"empresaId","senhaHash","atualizadoEm") values ('teste-beto','EUT0001','Beto Vendas','beto-leads@empresaexemplo.com.br','11977776666','USUARIO','${EMP}',(select "senhaHash" from "Usuario" where id='${ANA}'),now())`);
  sql(`update "Empresa" set "limiteLeads"=null, ativa=true, "expiraEm"=(current_date+40)::timestamp, "limiteUsuarios"=10 where id in ('${EMP}','${IND}')`);
  sql(`update "Usuario" set "limiteLeads"=null, status='ATIVO', permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'] where id='${ANA}'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const resultado = async (p) => (await p.locator('[data-testid=resultado-leads]').innerText().catch(() => '')).trim();
  const lead = (tel) => sql(`select codigo||'|'||nome||'|'||"codigoUsuario"||'|'||coalesce("codigoEmpresa",'-')||'|'||ativo||'|'||status from "Lead" where telefone='${tel}' and ("empresaId" is distinct from '${IND}')`);

  // ===== 1. Usuário de empresa (Ana) =====
  let [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
  await p.click('aside nav >> text=Leads'); await p.waitForURL('**/leads');
  ok('Usuário: tela "Seus leads"', (await p.locator('h1:has-text("Seus leads")').count()) === 1);
  ok('Usuário: sem escolha de dono', (await p.locator('#dono').count()) === 0);
  await p.fill('#ln', 'Maria Teste'); await p.fill('#lf', '(11) 98765-4321'); await p.click('button:has-text("Adicionar lead")'); await espera(1200);
  const l1 = lead('5511987654321').split('|');
  ok('Adicionar um: código EL + 5 dígitos (#63)', /^EL\d{5,}$/.test(l1[0]), l1[0]);
  ok('Lead guarda código do usuário e da empresa (#63)', l1[2] === ANA_COD && /^E\d{5,}$/.test(l1[3]), l1.join('|'));
  await p.fill('#lf', 'abc'); await p.click('button:has-text("Adicionar lead")'); await espera(800);
  ok('Telefone inválido é recusado', (await resultado(p)).includes('Telefone inválido'));

  await p.fill('#bulk', 'João Colado; 21 99876-5432\nMaria repetida; 11987654321\nNúmero ruim; 12\n+1 305 555 0199\nJoão de novo; (21) 99876-5432');
  await p.click('button:has-text("Salvar leads colados")'); await espera(1500);
  const rc = await resultado(p);
  ok('Colar vários: salva e resume repetidos/inválidos (#54)', rc.includes('2 leads salvos') && rc.includes('1 já estavam') && rc.includes('1 repetidos') && rc.includes('1 com número inválido'), rc);
  ok('Número estrangeiro aceito (#55)', sql(`select count(*) from "Lead" where telefone='13055550199'`) === '1');
  ok('Só o telefone: nome em branco', sql(`select nome from "Lead" where telefone='13055550199'`) === '');

  // Arquivo com cabeçalho (colunas fora de ordem)
  await p.setInputFiles('#arquivo', ARQ('leads-com-cabecalho.xlsx')); await espera(1500);
  const resumo = (await p.locator('[data-testid=resumo-arquivo]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok('Planilha com cabeçalho: detecta colunas em qualquer posição (#53)', resumo.includes('Cabeçalho encontrado') && resumo.includes('Telefone na coluna C') && resumo.includes('Nome na coluna D'), resumo);
  ok('Resumo antes de salvar: 3 válidos, 1 inválido', resumo.includes('3 com telefone válido') && resumo.includes('1 com telefone inválido'), resumo);
  await p.screenshot({ path: OUT + '/leads-resumo-arquivo.png' });
  await p.click('button:has-text("Salvar 3 leads")');
  ok('Planilha salva (inclusive número estrangeiro)', await ate(() => sql(`select string_agg(nome, ',' order by nome) from "Lead" where telefone in ('5511991110001','5521991110002','13055550104')`) === 'Planilha Dois,Planilha Quatro,Planilha Um'));

  // Arquivo sem cabeçalho e sem nomes
  await p.setInputFiles('#arquivo', ARQ('leads-sem-cabecalho.xlsx')); await espera(1500);
  const r2 = (await p.locator('[data-testid=resumo-arquivo]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  ok('Planilha sem cabeçalho: identifica sozinho, nome em branco (#61)', r2.includes('Sem cabeçalho') && r2.includes('sem coluna de nome'), r2);
  await p.click('button:has-text("Salvar 3 leads")'); await espera(1500);
  ok('Sem cabeçalho: repetido no arquivo ignorado', (await resultado(p)).includes('2 leads salvos') && (await resultado(p)).includes('1 repetidos'), await resultado(p));

  // CSV
  await p.setInputFiles('#arquivo', ARQ('leads.csv')); await espera(1500);
  await p.click('button:has-text("Salvar 2 leads")'); await espera(1500);
  ok('CSV com ; e aspas', sql(`select nome from "Lead" where telefone='5511991110007'`) === 'Silva; Csv');

  // Editar, inativar, status
  await p.goto(BASE + '/leads?q=Maria'); await espera(800);
  await p.click('tr:has-text("Maria Teste") >> button:has-text("Editar")');
  ok('Usuário de empresa não edita telefone (#56)', await p.locator('#ed-tel').isDisabled());
  await p.fill('#ed-nome', 'Maria Editada'); await p.click('form >> button:has-text("Salvar")'); await espera(1000);
  ok('Usuário edita o nome', lead('5511987654321').split('|')[1] === 'Maria Editada');
  await p.click('tr:has-text("Maria Editada") >> button:has-text("Inativar")');
  ok('Inativa o lead', await ate(() => lead('5511987654321').split('|')[4] === 'false'));
  await p.goto(BASE + '/leads?situacao=inativos'); await espera(800);
  await p.click('tr:has-text("Maria Editada") >> button:has-text("Reativar")');
  ok('Reativa o lead', await ate(() => lead('5511987654321').split('|')[4] === 'true'));
  await p.goto(BASE + '/leads?q=Maria'); await espera(800);
  await p.selectOption('tr:has-text("Maria Editada") >> select', 'PEDIU_SAIR'); await espera(1200);
  ok('Status manual "Pediu para sair" com data (#57, #59)', sql(`select status||'|'||("pediuSairEm" is not null) from "Lead" where telefone='5511987654321'`) === 'PEDIU_SAIR|true');
  ok('Mostra "bloqueado até" (45 dias)', (await p.locator('text=bloqueado até').count()) >= 1);
  ok('Usuário não tem botão Excluir (#56)', (await p.locator('button:has-text("Excluir")').count()) === 0);
  await p.goto(BASE + '/leads'); await espera(800);
  await p.screenshot({ path: OUT + '/leads-usuario.png' });
  await c.close();

  // ===== 2. Admin da Empresa =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Business');
  ok('Admin tem "Leads" no menu', (await p.locator('aside nav >> text=Leads').count()) === 1);
  await p.click('aside nav >> text=Leads'); await p.waitForURL('**/leads');
  ok('Admin vê os leads dos usuários com a coluna Usuário', (await p.locator('th:has-text("Usuário")').count()) === 1 && (await p.locator(`td:has-text("${ANA_COD} • Ana")`).count()) >= 1);
  ok('Admin não tem Excluir (#56)', (await p.locator('button:has-text("Excluir")').count()) === 0);
  await p.selectOption('#dono', 'teste-beto');
  await p.fill('#bulk', 'Do Beto; 11 97777-0001\nNúmero da Ana; 11987654321');
  await p.click('button:has-text("Salvar leads colados")'); await espera(1500);
  const ra = await resultado(p);
  ok('Número de outro usuário da empresa: fica com quem cadastrou primeiro, sem dizer quem (#54)', ra.includes('1 lead salvo') && ra.includes('1 já cadastrados por outro usuário da empresa') && !ra.includes('Ana'), ra);
  ok('Lead do Beto com o código dele', lead('5511977770001').split('|')[2] === 'EUT0001');
  await p.click('tr:has-text("Do Beto") >> button:has-text("Editar")');
  ok('Admin edita o telefone', !(await p.locator('#ed-tel').isDisabled()));
  await p.fill('#ed-tel', '11 97777-0002'); await p.click('form >> button:has-text("Salvar")'); await espera(1000);
  ok('Telefone alterado pelo Admin', sql(`select count(*) from "Lead" where telefone='5511977770002' and "usuarioId"='teste-beto'`) === '1');

  // Limite por usuário (Admin) e da empresa (Super Admin) — decisão #58
  sql(`update "Usuario" set "limiteLeads"=2 where id='teste-beto'`);
  await p.fill('#bulk', '11 97777-0003\n11 97777-0004'); await p.click('button:has-text("Salvar leads colados")'); await espera(1500);
  ok('Limite do usuário: só o que cabe é salvo', (await resultado(p)).includes('1 lead salvo') && (await resultado(p)).includes('limite do usuário'), await resultado(p));
  sql(`update "Usuario" set "limiteLeads"=null where id='teste-beto'`);
  const totalEmp = sql(`select count(*) from "Lead" where "empresaId"='${EMP}'`);
  sql(`update "Empresa" set "limiteLeads"=${totalEmp} where id='${EMP}'`);
  await p.fill('#bulk', '11 97777-0005'); await p.click('button:has-text("Salvar leads colados")'); await espera(1500);
  ok('Limite da empresa barra novos leads', (await resultado(p)).includes('limite da empresa'), await resultado(p));
  sql(`update "Empresa" set "limiteLeads"=null where id='${EMP}'`);
  await p.click('aside nav >> text=Usuários'); await p.waitForURL('**/usuarios');
  ok('Lista de usuários mostra código e leads / limite', (await p.locator('td:has-text("EUT0001")').count()) === 1 && (await p.locator('tr:has-text("Beto") >> text=/ ilimitado').count()) === 1);
  await p.click('tr:has-text("Beto Vendas") >> button:has-text("Editar")');
  await p.uncheck('form >> input[name=ilimitado]'); await p.fill('#u-limite', '500'); await p.click('button:has-text("Salvar alterações")'); await espera(1200);
  ok('Admin define o limite do usuário no cadastro', sql(`select "limiteLeads" from "Usuario" where id='teste-beto'`) === '500');
  // Excluir o Beto transferindo para a Ana (#49)
  const doBeto = sql(`select count(*) from "Lead" where "usuarioId"='teste-beto'`);
  await p.click('tr:has-text("Beto Vendas") >> button:has-text("Excluir")');
  await p.selectOption('#destino', ANA); await p.click('button:has-text("Excluir definitivamente")'); await espera(1500);
  ok('Excluir usuário transfere os leads com o código do novo dono (#49)', Number(doBeto) > 0 && sql(`select count(*) from "Lead" where telefone in ('5511977770002','5511977770003') and "usuarioId"='${ANA}' and "codigoUsuario"='${ANA_COD}'`) === '2', doBeto);
  await c.close();

  // ===== 3. Usuário Individual =====
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await p.goto(BASE + '/leads');
  await p.fill('#ln', 'Mesmo número da Ana'); await p.fill('#lf', '11 98765-4321'); await p.click('button:has-text("Adicionar lead")'); await espera(1200);
  const li = sql(`select codigo||'|'||"codigoEmpresa" from "Lead" where "empresaId"='${IND}' and telefone='5511987654321'`).split('|');
  ok('Conta individual é separada: pode ter o mesmo número (#54)', /^L\d{5,}$/.test(li[0] || ''), li.join('|'));
  await p.click('tr:has-text("Mesmo número") >> button:has-text("Editar")');
  ok('Individual edita o telefone (#56)', !(await p.locator('#ed-tel').isDisabled()));
  await p.click('button[aria-label=Fechar]');
  ok('Individual não exclui (#56)', (await p.locator('button:has-text("Excluir")').count()) === 0);
  await c.close();

  // ===== 4. Super Admin =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Super Admin tem "Meu WhatsApp" (#62)', (await p.locator('aside nav >> text=Meu WhatsApp').count()) === 1);
  ok('Texto "sem enviar mensagem" removido do painel', (await p.locator('text=sem enviar mensagem').count()) === 0);
  await p.click('aside nav >> text=Leads'); await p.waitForURL('**/leads');
  ok('Super Admin vê leads de empresa e individual com a coluna Conta', (await p.locator('th:has-text("Conta")').count()) === 1 && (await p.locator('td:has-text("Empresa Exemplo")').count()) >= 1 && (await p.locator('td:has-text("Conta Individual")').count()) >= 1);
  await p.fill('#ln', 'Lead do Super'); await p.fill('#lf', '11 96666-0001'); await p.click('button:has-text("Adicionar lead")'); await espera(1200);
  ok('Super Admin cadastra lead para si (código L, sem empresa)', /^L\d{5,}\|-$/.test(sql(`select codigo||'|'||coalesce("codigoEmpresa",'-') from "Lead" where telefone='5511966660001'`)));
  await p.goto(BASE + '/leads?conta=meus'); await espera(800);
  ok('Filtro "Meus leads"', (await p.locator('tbody tr').count()) === 1);
  await p.click('tr:has-text("Lead do Super") >> button:has-text("Excluir")'); await espera(1200);
  ok('Super Admin exclui lead', sql(`select count(*) from "Lead" where telefone='5511966660001'`) === '0');
  await p.click('aside nav >> text=Empresas'); await p.waitForURL('**/empresas');
  ok('Empresas mostram código e leads', (await p.locator('text=/E\\d{5} • Empresa Exemplo/').count()) === 1 && (await p.locator('text=/Leads: \\d+ \\/ ilimitado/').count()) >= 1);
  await p.click('article:has-text("Empresa Exemplo") >> button:has-text("Limite de leads")');
  await p.uncheck('article:has-text("Empresa Exemplo") >> input[name=ilimitado]'); await p.fill('article:has-text("Empresa Exemplo") >> input[name=limiteLeads]', '5000');
  await p.click('button:has-text("Salvar limite")'); await espera(1200);
  ok('Super Admin define o limite da empresa', sql(`select "limiteLeads" from "Empresa" where id='${EMP}'`) === '5000');
  sql(`update "Empresa" set "limiteLeads"=null where id='${EMP}'`);
  await p.goto(BASE + '/leads'); await espera(800);
  await p.screenshot({ path: OUT + '/leads-superadmin.png' });
  await p.click('aside nav >> text=Dashboard'); await p.waitForURL('**/dashboard');
  const totalLeads = sql(`select count(*) from "Lead"`);
  ok('Dashboard do Super Admin com total real de leads', (await p.locator(`.card:has-text("Leads (total)") >> text="${Number(totalLeads).toLocaleString('pt-BR')}"`).count()) === 1, totalLeads);
  await c.close();

  // Limpeza
  sql(`update "Usuario" set "limiteLeads"=null where id='${ANA}'`);
  await b.close();
  console.log(res.join('\n'));
  console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
