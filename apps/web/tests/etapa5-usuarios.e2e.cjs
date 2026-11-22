// Teste de ponta a ponta da etapa 5 (Admin da Empresa: usuários, vagas, permissões, exclusão com transferência).
// Requer: app em http://localhost:3005 (log em /var/tmp/web.log) e Postgres local com seed.
// Uso: node apps/web/tests/etapa5-usuarios.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const suf = Date.now().toString().slice(-6);
const EMP = 'teste-empresa-exemplo';
const senhaDe = (email) => {
  const blocos = fs.readFileSync('/var/tmp/web.log', 'utf8').split('[email de desenvolvimento]').filter(b => b.includes('Para: ' + email));
  const m = (blocos.pop() || '').match(/Senha temporária: (\S+)/); return m && m[1];
};
(async () => {
  // Estado inicial: Empresa Exemplo com 2 vagas, só a Ana como usuária, vencendo em 5 dias.
  sql(`delete from "Sessao" where "usuarioId" in (select id from "Usuario" where "empresaId"='${EMP}' and cargo='USUARIO' and email<>'ana@empresaexemplo.com.br')`);
  sql(`delete from "Usuario" where "empresaId"='${EMP}' and cargo='USUARIO' and email<>'ana@empresaexemplo.com.br'`);
  sql(`update "Usuario" set status='ATIVO', permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'] where email='ana@empresaexemplo.com.br'`);
  sql(`update "Empresa" set "limiteUsuarios"=2, ativa=true, "expiraEm"=(current_date+5)::timestamp + interval '23 hour' where id='${EMP}'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', d => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Módulo Empresarial');
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForTimeout(1500);
  };
  const kpi = async (p) => (await p.locator('main .card .font-display').first().innerText()).trim();
  const criar = async (p, nome, email, perms) => {
    await p.click('button:has-text("Novo usuário")');
    await p.fill('#u-nome', nome); await p.fill('#u-email', email); await p.fill('#u-whats', '11988887777');
    for (const cb of await p.locator('input[name=permissoes]').all()) { const v = await cb.getAttribute('value'); if (perms.includes(v) !== await cb.isChecked()) await cb.click(); }
    await p.click('button:has-text("Criar usuário e enviar senha")'); await p.waitForTimeout(1500);
  };

  let [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678');
  ok('Admin vê o aviso de expiração (decisão #21)', (await p.locator('text=Seu acesso expira em 5 dias').count()) === 1);
  ok('Admin vê o chip "Expira em 5 dias"', (await p.locator('header >> text=Expira em 5 dias').count()) === 1);
  await p.click('aside nav >> text=Usuários'); await p.waitForURL('**/usuarios');
  ok('Vagas em uso 1 / 2 (Admin não conta)', (await kpi(p)) === '1 / 2', await kpi(p));
  await criar(p, 'Bruno Vendas', `bruno${suf}@ex.com`, ['leads', 'campanhas', 'conversas', 'arquivos', 'empresa-ia']);
  ok('Usuário criado', sql(`select cargo||'|'||"empresaId" from "Usuario" where email='bruno${suf}@ex.com'`) === `USUARIO|${EMP}`);
  ok('Senha temporária enviada por e-mail', !!senhaDe(`bruno${suf}@ex.com`));
  ok('Pacote cheio: botão "Novo usuário" bloqueado', await p.locator('button:has-text("Novo usuário")').isDisabled());
  await p.click(`tr:has-text("bruno${suf}") >> button:has-text("Desativar")`); await p.waitForTimeout(1500);
  ok('Desativado não ocupa vaga', (await kpi(p)) === '1 / 2', await kpi(p));
  await criar(p, 'Carla Leads', `carla${suf}@ex.com`, ['leads']);
  ok('Vaga liberada foi usada por outro usuário', (await kpi(p)) === '2 / 2', await kpi(p));
  await p.click(`tr:has-text("bruno${suf}") >> button:has-text("Reativar")`); await p.waitForTimeout(1500);
  ok('Desativado não reativa sem vaga (decisão #50)', sql(`select status from "Usuario" where email='bruno${suf}@ex.com'`) === 'BLOQUEADO' && (await p.locator('text=Sem vaga no pacote').count()) >= 1);
  await p.screenshot({ path: OUT + '/usuarios.png' });
  await c.close();

  // Permissões: Carla só tem Leads
  const [c2, p2] = await novo();
  await entrar(p2, `carla${suf}@ex.com`, senhaDe(`carla${suf}@ex.com`));
  await p2.fill('#new-pw', 'CarlaSenha@2026'); await p2.click('text=Salvar nova senha e entrar'); await p2.waitForURL('**/dashboard');
  const menu = (await p2.locator('aside nav a').allInnerTexts()).map(s => s.trim());
  ok('Menu respeita as permissões (só Leads + fixos)', JSON.stringify(menu) === JSON.stringify(['Dashboard', 'Leads', 'WhatsApp', 'Avisos', 'Leads de anúncios', 'Ajuda']), menu.join(', '));
  ok('Sem permissão de campanhas: sem botão "Criar campanha"', (await p2.locator('text=Criar campanha').count()) === 0);
  await p2.goto(BASE + '/campanhas'); await p2.waitForTimeout(600);
  ok('Tela sem permissão volta ao dashboard', p2.url().endsWith('/dashboard'));
  await p2.goto(BASE + '/usuarios'); await p2.waitForTimeout(600);
  ok('Usuário comum não abre a tela Usuários', p2.url().endsWith('/dashboard'));

  // Admin libera Campanhas para a Carla → vale na hora
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678');
  await p.goto(BASE + '/usuarios');
  await p.click(`tr:has-text("carla${suf}") >> button:has-text("Editar")`);
  await p.check('input[name=permissoes][value=campanhas]'); await p.click('button:has-text("Salvar alterações")'); await p.waitForTimeout(1500);
  await p2.goto(BASE + '/dashboard'); await p2.waitForTimeout(800);
  ok('Permissão nova vale sem precisar sair', (await p2.locator('aside nav').innerText()).includes('Campanhas'));
  await c2.close();

  // Excluir com transferência
  await p.click(`tr:has-text("bruno${suf}") >> button:has-text("Excluir")`);
  ok('Excluir exige escolher para quem transferir', await p.locator('button:has-text("Excluir definitivamente")').isDisabled());
  await p.selectOption('#destino', { label: 'Ana Souza — ana@empresaexemplo.com.br' });
  await p.click('button:has-text("Excluir definitivamente")'); await p.waitForTimeout(1500);
  ok('Usuário excluído após escolher o destino', sql(`select count(*) from "Usuario" where email='bruno${suf}@ex.com'`) === '0');
  ok('Mensagem confirma a transferência', (await p.locator('text=dados foram transferidos para Ana Souza').count()) >= 1);
  await c.close();

  sql(`update "Empresa" set "expiraEm"=now()+interval '26 day' where id='${EMP}'`);
  console.log(res.join('\n')); await b.close();
})();
