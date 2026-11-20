// Teste de ponta a ponta da etapa 4c (Super Admin: empresas e usuários individuais).
// Requer: app em http://localhost:3005 (log em /var/tmp/web.log) e Postgres local com seed.
// Uso: node apps/web/tests/etapa4c-empresas.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const suf = Date.now().toString().slice(-6);
const ultimaSenha = (email) => {
  const blocos = fs.readFileSync('/var/tmp/web.log', 'utf8').split('[email de desenvolvimento]').filter(b => b.includes('Para: ' + email));
  const m = (blocos.pop() || '').match(/Senha temporária: (\S+)/); return m && m[1];
};
const diaISO = (q) => sql(q).slice(0, 10);
(async () => {
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', d => d.accept()); return [c, p]; };
  const loginComo = async (p, email, senha, mod) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (mod === 'empresarial') await p.click('text=Módulo Empresarial');
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForTimeout(1500);
  };
  const toast = async (p, txt) => (await p.locator(`text=${txt}`).count()) > 0;

  let [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Entrar como Super Admin'); await p.waitForURL('**/dashboard');
  await p.click('aside nav >> text=Empresas'); await p.waitForURL('**/empresas');
  // criar empresa: Personalizado sem limite
  await p.click('text=Criar empresa');
  await p.fill('#nomeEmpresa', 'Construtora ' + suf);
  await p.selectOption('#planoId', { label: 'Personalizado — quantidade definida por você' });
  await p.fill('#adminNome', 'Paula Admin'); await p.fill('#adminEmail', `paula${suf}@construtora.com`);
  await p.click('text=Criar empresa e enviar acesso'); await p.waitForTimeout(1000);
  ok('Personalizado exige quantidade de usuários', await p.locator('text=Informe a quantidade de usuários do pacote Personalizado').count() === 1);
  await p.selectOption('#planoId', { label: 'Básico — 3 usuários' });
  await p.click('text=Criar empresa e enviar acesso'); await p.waitForTimeout(1500);
  ok('Empresa criada com pacote Básico', sql(`select pacote||'|'||"limiteUsuarios" from "Empresa" where nome='Construtora ${suf}'`) === 'Básico|3');
  ok('Admin criado como ADMIN_EMPRESA', sql(`select cargo from "Usuario" where email='paula${suf}@construtora.com'`) === 'ADMIN_EMPRESA');
  ok('Card mostra 0 / 3 (Admin não conta)', (await p.locator(`article:has-text("Construtora ${suf}")`).innerText()).includes('Usuários: 0 / 3'));
  // e-mail duplicado
  await p.click('text=Criar empresa');
  await p.fill('#nomeEmpresa', 'Outra ' + suf); await p.fill('#adminNome', 'Ana'); await p.fill('#adminEmail', 'ana@empresaexemplo.com.br');
  await p.click('text=Criar empresa e enviar acesso'); await p.waitForTimeout(1000);
  ok('E-mail já cadastrado é recusado', await p.locator('text=já tem acesso ao FilaPro').count() === 1);
  await p.click('form >> text=Cancelar');
  // alterar pacote para Personalizado 2
  const art = `article:has-text("Construtora ${suf}")`;
  await p.click(`${art} >> text=Alterar pacote`);
  await p.selectOption(`${art} select`, { label: 'Personalizado' });
  await p.fill(`${art} input[name=limite]`, '2'); await p.click(`${art} >> text=Salvar pacote`); await p.waitForTimeout(1500);
  ok('Pacote alterado para Personalizado com 2 usuários', sql(`select pacote||'|'||"limiteUsuarios" from "Empresa" where nome='Construtora ${suf}'`) === 'Personalizado|2');
  // prorrogar (a partir do vencimento)
  const antes = diaISO(`select "expiraEm"::date from "Empresa" where nome='Construtora ${suf}'`);
  await p.click(`${art} >> text=Prorrogar`); await p.waitForTimeout(1500);
  const depois = diaISO(`select "expiraEm"::date from "Empresa" where nome='Construtora ${suf}'`);
  const difDias = (new Date(depois) - new Date(antes)) / 86400000;
  ok('Prorrogar soma 31 dias ao vencimento atual', difDias === 31, `${antes} → ${depois}`);
  // prorrogar vencida (a partir de hoje)
  sql(`update "Empresa" set "expiraEm"=now()-interval '10 day' where nome='Construtora ${suf}'`);
  await p.reload(); await p.click(`${art} >> text=Prorrogar`); await p.waitForTimeout(1500);
  const dVenc = sql(`select ("expiraEm"::date - current_date) from "Empresa" where nome='Construtora ${suf}'`);
  ok('Prorrogar pacote vencido conta a partir de hoje', dVenc === '31', dVenc + ' dias');
  // inativar
  await p.click(`${art} >> text=Inativar empresa`); await p.waitForTimeout(1500);
  ok('Empresa inativada', sql(`select ativa from "Empresa" where nome='Construtora ${suf}'`) === 'f');
  await p.screenshot({ path: OUT + '/empresas.png', fullPage: true });
  await c.close();

  // Admin da empresa inativa não entra
  const temp = ultimaSenha(`paula${suf}@construtora.com`);
  [c, p] = await novo(); await loginComo(p, `paula${suf}@construtora.com`, temp, 'empresarial');
  ok('Admin de empresa inativa não entra', (await p.locator('text=Empresa inativa').count()) === 1);
  await c.close();

  // Admin da Empresa Exemplo vê só a própria empresa, sem editar
  [c, p] = await novo(); await loginComo(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'empresarial');
  await p.click('aside nav >> text=Empresas'); await p.waitForURL('**/empresas');
  ok('Admin vê só a própria empresa', (await p.locator('main article').count()) === 1 && (await p.locator('main').innerText()).includes('Empresa Exemplo'));
  ok('Admin não tem botões de edição', (await p.locator('text=Alterar pacote').count()) === 0 && (await p.locator('text=Criar empresa').count()) === 0);
  await c.close();

  // Usuários individuais
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Entrar como Super Admin'); await p.waitForURL('**/dashboard');
  await p.click('aside nav >> text=Usuários Individuais'); await p.waitForURL('**/usuarios-individuais');
  await p.click('text=Novo usuário individual');
  await p.fill('#ind-nome', 'Igor Individual'); await p.fill('#ind-email', `igor${suf}@x.com`); await p.fill('#ind-whats', '11955554444');
  await p.click('text=Criar e enviar acesso'); await p.waitForTimeout(1500);
  ok('Usuário individual criado', sql(`select e.modulo||'|'||e."limiteUsuarios"||'|'||u.cargo from "Usuario" u join "Empresa" e on e.id=u."empresaId" where u.email='igor${suf}@x.com'`) === 'INDIVIDUAL|1|USUARIO');
  ok('Aparece na lista aguardando 1º acesso', (await p.locator(`tr:has-text("igor${suf}@x.com")`).innerText()).includes('aguardando 1º acesso'));
  await p.click(`tr:has-text("igor${suf}@x.com") >> text=Bloquear`); await p.waitForTimeout(1500);
  ok('Bloquear', sql(`select status from "Usuario" where email='igor${suf}@x.com'`) === 'BLOQUEADO');
  const tempIgor = ultimaSenha(`igor${suf}@x.com`);
  const [c2, p2] = await novo(); await loginComo(p2, `igor${suf}@x.com`, tempIgor, 'individual');
  ok('Usuário bloqueado não entra', (await p2.locator('text=Acesso bloqueado').count()) === 1); await c2.close();
  await p.click(`tr:has-text("igor${suf}@x.com") >> text=Desbloquear`); await p.waitForTimeout(1500);
  await p.click(`tr:has-text("igor${suf}@x.com") >> text=Reenviar acesso`); await p.waitForTimeout(1500);
  const tempNova = ultimaSenha(`igor${suf}@x.com`);
  ok('Reenviar acesso gera nova senha temporária', tempNova && tempNova !== tempIgor);
  await p.screenshot({ path: OUT + '/individuais.png', fullPage: true });
  await c.close();
  const [c3, p3] = await novo(); await loginComo(p3, `igor${suf}@x.com`, tempNova, 'individual');
  ok('Desbloqueado entra com a nova senha (primeiro acesso)', p3.url().endsWith('/primeiro-acesso')); await c3.close();

  console.log(res.join('\n')); await b.close();
})();
