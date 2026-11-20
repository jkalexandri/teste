// Teste de ponta a ponta da etapa 4b (compra por PIX, Pedidos, confirmação, plano Free).
// Requer: app em http://localhost:3005 (log em /var/tmp/web.log), Postgres local, planos visíveis com preço (rode antes o teste 4a).
// Uso: node apps/web/tests/etapa4b-compra.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const sufixo = Date.now().toString().slice(-6);
const ultimaSenha = (email) => {
  const log = fs.readFileSync('/var/tmp/web.log', 'utf8');
  const blocos = log.split('[email de desenvolvimento]').filter(b => b.includes('Para: ' + email));
  const m = (blocos.pop() || '').match(/Senha temporária: (\S+)/); return m && m[1];
};
(async () => {
  const b = await chromium.launch();
  const ctx = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', d => d.accept()); return [c, p]; };
  const abrirPlano = async (p, nome) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.click('button:has-text("Planos")'); await p.waitForTimeout(800);
    await p.click(`[aria-label="Planos"] article:has-text("${nome}") >> button`); await p.waitForTimeout(300);
  };

  // 1. Compra plano Padrão (empresarial)
  let [c, p] = await ctx();
  const emailEmp = `comprador${sufixo}@empresa.com`;
  await abrirPlano(p, 'Padrão');
  ok('Formulário pede nome da empresa no plano empresarial', await p.locator('#ck-empresa').count() === 1);
  await p.fill('#ck-nome', 'Carlos Comprador'); await p.fill('#ck-email', emailEmp); await p.fill('#ck-whats', '11987654321');
  await p.click('text=Gerar PIX'); await p.waitForTimeout(800);
  ok('Sem nome da empresa: erro', (await p.locator('text=Informe o nome da empresa').count()) === 1);
  await p.fill('#ck-empresa', 'Imobiliária Teste ' + sufixo);
  await p.click('text=Gerar PIX'); await p.waitForTimeout(1500);
  const cc = await p.inputValue('#pix-cc').catch(() => '');
  ok('PIX copia e cola gerado', cc.startsWith('000201') && cc.includes('br.gov.bcb.pix') && cc.includes('199.90'), cc.slice(0, 60));
  ok('QR Code exibido', await p.locator('img[alt="QR Code do PIX"]').count() === 1);
  ok('Texto pós-PIX (decisão #39)', (await p.locator('text=Assim que confirmarmos o pagamento').count()) === 1);
  await p.screenshot({ path: OUT + '/checkout-pix.png' });
  await c.close();

  // 2. E-mail que já tem acesso
  [c, p] = await ctx();
  await abrirPlano(p, 'Individual');
  await p.fill('#ck-nome', 'Ana Souza'); await p.fill('#ck-email', 'ana@empresaexemplo.com.br'); await p.fill('#ck-whats', '11987654321');
  await p.click('text=Gerar PIX'); await p.waitForTimeout(800);
  ok('E-mail já cadastrado é recusado', (await p.locator('text=já tem acesso').count()) === 1);
  // 3. Pedido Individual para cancelar
  await p.fill('#ck-email', `cancelar${sufixo}@x.com`); await p.click('text=Gerar PIX'); await p.waitForTimeout(1200);
  await c.close();

  // 4. Super Admin confirma
  [c, p] = await ctx();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Entrar como Super Admin'); await p.waitForURL('**/dashboard');
  const badge = await p.locator('aside nav a:has-text("Pedidos") span.rounded-full').innerText().catch(() => '0');
  ok('Contador de pedidos no menu', Number(badge) >= 2, badge);
  await p.click('aside nav >> text=Pedidos'); await p.waitForURL('**/pedidos');
  await p.screenshot({ path: OUT + '/pedidos.png' });
  await p.click(`tr:has-text("cancelar${sufixo}") >> button:has-text("Cancelar")`); await p.waitForTimeout(1200);
  ok('Pedido cancelado', sql(`select status from "Pedido" where email='cancelar${sufixo}@x.com'`) === 'CANCELADO');
  await p.click(`tr:has-text("${emailEmp}") >> text=Confirmar pagamento`); await p.waitForTimeout(2000);
  ok('Pedido confirmado vira PAGO', sql(`select status from "Pedido" where email='${emailEmp}'`) === 'PAGO');
  ok('Empresa criada com limite 10 e plano Padrão', sql(`select e."limiteUsuarios"||'|'||e.pacote||'|'||e.modulo from "Empresa" e join "Pedido" p on p."empresaId"=e.id where p.email='${emailEmp}'`) === '10|Padrão|EMPRESARIAL');
  ok('Comprador virou Admin da Empresa', sql(`select cargo from "Usuario" where email='${emailEmp}'`) === 'ADMIN_EMPRESA');
  await c.close();

  // 5. Comprador entra com a senha temporária do e-mail
  const temp = ultimaSenha(emailEmp);
  ok('E-mail de boas-vindas com senha temporária', !!temp);
  [c, p] = await ctx();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Módulo Empresarial');
  await p.fill('#email', emailEmp); await p.fill('#senha', temp); await p.click('button[type=submit]');
  await p.waitForURL('**/primeiro-acesso', { timeout: 6000 }).catch(() => {});
  ok('Novo Admin cai no primeiro acesso', p.url().endsWith('/primeiro-acesso'));
  await p.fill('#new-pw', 'MinhaSenha@2026'); await p.click('text=Salvar nova senha e entrar');
  await p.waitForURL('**/dashboard', { timeout: 6000 }).catch(() => {});
  ok('Novo Admin entra no dashboard da empresa', (await p.locator('main').innerText()).includes('Imobiliária Teste ' + sufixo));
  await c.close();

  // 6. Plano Free: conta na hora, 1 por e-mail
  [c, p] = await ctx();
  const emailFree = `free${sufixo}@x.com`;
  await abrirPlano(p, 'Free');
  await p.fill('#ck-nome', 'Fernanda Free'); await p.fill('#ck-email', emailFree); await p.fill('#ck-whats', '11912345678');
  await p.click('text=Criar minha conta de teste'); await p.waitForTimeout(1500);
  ok('Free: conta criada na hora', (await p.locator('text=Conta de teste criada').count()) === 1);
  ok('Free: limite de 20 disparos e prazo de 7 dias gravados', sql(`select e."limiteDisparos"||'|'||e."prazoDias" from "Empresa" e join "Usuario" u on u."empresaId"=e.id where u.email='${emailFree}'`) === '20|7');
  await abrirPlano(p, 'Free');
  await p.fill('#ck-nome', 'Fernanda Free'); await p.fill('#ck-email', emailFree); await p.fill('#ck-whats', '11912345678');
  await p.click('text=Criar minha conta de teste'); await p.waitForTimeout(1000);
  ok('Free: segundo teste com o mesmo e-mail é recusado', (await p.locator('text=já usou o teste grátis').count()) === 1);
  await c.close();

  console.log(res.join('\n')); await b.close();
})();
