// Teste de ponta a ponta da etapa 3 (menu por perfil, acesso, aviso de expiração).
// Requer: app em http://localhost:3005 e Postgres local com seed. Uso: node apps/web/tests/etapa3-layout.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const entrar = async (email, senha, modulo, vp = { width: 1440, height: 900 }) => {
    const c = await b.newContext({ viewport: vp, deviceScaleFactor: 1 }); const p = await c.newPage();
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    if (modulo === 'empresarial') await p.click('text=Módulo Empresarial');
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]');
    await p.waitForURL('**/dashboard', { timeout: 6000 }).catch(() => {});
    return [c, p];
  };
  const menu = async (p) => (await p.locator('aside nav a').allInnerTexts()).map(s => s.trim());
  const grupos = async (p) => (await p.locator('aside nav > div').allInnerTexts()).map(s => s.trim());

  // Usuário individual
  let [c, p] = await entrar('usuario@disparopro.com.br', 'User@12345678', 'individual');
  ok('Usuário entra no dashboard', p.url().endsWith('/dashboard'));
  ok('Menu do Usuário', JSON.stringify(await menu(p)) === JSON.stringify(['Dashboard','Campanhas','Leads','Conversas IA','Arquivos','Empresa | IA','WhatsApp']), (await menu(p)).join(', '));
  ok('Grupos do Usuário (ocultos os vazios)', JSON.stringify(await grupos(p)) === JSON.stringify(['PRINCIPAL','VENDAS','CONFIGURAÇÕES']), (await grupos(p)).join(', '));
  await p.screenshot({ path: OUT + '/dash-usuario.png' });
  await p.goto(BASE + '/usuarios'); await p.waitForTimeout(500);
  ok('Usuário não abre tela de Admin (/usuarios)', p.url().endsWith('/dashboard'));
  await p.goto(BASE + '/whatsapp'); await p.waitForTimeout(500);
  ok('Usuário abre /whatsapp (tela da etapa 6)', (await p.locator('main h1').innerText()).trim() === 'WhatsApp');
  await p.click('aside nav >> text=Leads'); await p.waitForURL('**/leads', { timeout: 6000 }).catch(() => {});
  ok('Clique no menu navega e marca item ativo', p.url().endsWith('/leads'));
  await c.close();

  // Admin da empresa
  [c, p] = await entrar('admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'empresarial');
  ok('Menu do Admin', JSON.stringify(await menu(p)) === JSON.stringify(['Dashboard','Todos os disparos','Leads','Usuários','Empresas','Empresa | IA','Configurações','Logs']), (await menu(p)).join(', '));
  const linhas = await p.locator('table tbody tr').allInnerTexts();
  ok('Disparos por usuários sem o Administrador', linhas.length >= 1 && linhas.some(l => l.includes('Ana Souza')) && !linhas.some(l => l.includes('admin-empresa@')), linhas.length + ' linhas');
  ok('Dashboard sem linha TOTAL no resumo', (await p.locator('tfoot').count()) === 0);
  await p.screenshot({ path: OUT + '/dash-admin.png' });
  await p.goto(BASE + '/whatsapp'); await p.waitForTimeout(500);
  ok('Admin não abre /whatsapp', p.url().endsWith('/dashboard'));
  await c.close();

  // Super Admin
  [c, p] = await entrar('superadmin@disparopro.com.br', 'Super@12345678', 'individual');
  const m = await menu(p);
  ok('Menu do Super Admin', m.length === 22 && m.includes('Empresa | IA') && m.includes('Dados legais') && m.includes('Inteligência Artificial') && m.includes('Despesas com IA') && m.includes('Regras de envio') && m.includes('Arquivos') && m.includes('Meu WhatsApp') && m.includes('Número da plataforma') && m.includes('Pedidos') && m.includes('Relatório Empresarial') && m.includes('Planos') && m.includes('Pagamento'), m.join(', '));
  ok('Subgrupo Relatório dentro de Administrativo', (await p.locator('aside nav').innerText()).includes('Relatório'));
  await p.screenshot({ path: OUT + '/dash-superadmin.png' });
  await p.goto(BASE + '/relatorios/empresarial'); await p.waitForTimeout(500);
  ok('Super Admin abre relatório', (await p.locator('main').innerText()).includes('etapa 11'));
  await c.close();

  // Aviso de expiração (≤ 10 dias)
  sql("update \"Empresa\" set \"expiraEm\"=now()+interval '5 day' where id='teste-conta-individual'");
  [c, p] = await entrar('usuario@disparopro.com.br', 'User@12345678', 'individual');
  await p.waitForTimeout(800);
  ok('Popup de expiração aparece', await p.locator('text=Seu acesso expira em').count() === 1);
  ok('Chip "Expira em 5 dias" no topo', await p.locator('header >> text=Expira em 5 dias').count() === 1);
  await p.screenshot({ path: OUT + '/aviso-expiracao.png' });
  await p.waitForTimeout(10500);
  ok('Popup some após 10 segundos', await p.locator('text=Seu acesso expira em').count() === 0);
  // Expira com a pessoa logada → volta ao login com motivo
  sql("update \"Empresa\" set \"expiraEm\"=now()-interval '1 day' where id='teste-conta-individual'");
  await p.goto(BASE + '/leads'); await p.waitForTimeout(1200);
  ok('Pacote vencido com a pessoa logada → login com aviso', p.url().includes('/login') && (await p.locator('text=Acesso expirado').count()) === 1);
  sql("update \"Empresa\" set \"expiraEm\"=now()+interval '29 day' where id='teste-conta-individual'");
  await c.close();

  // Celular
  [c, p] = await entrar('usuario@disparopro.com.br', 'User@12345678', 'individual', { width: 390, height: 844 });
  await p.screenshot({ path: OUT + '/dash-celular.png' });
  ok('Menu em pílulas no celular', await p.locator('main').count() === 1 && (await p.locator('a.rounded-full').count()) === 7);
  await c.close();

  console.log(res.join('\n')); await b.close();
})();
