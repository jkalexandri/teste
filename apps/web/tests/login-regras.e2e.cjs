// Teste de ponta a ponta das regras de login (etapa 2).
// Requer: app rodando em http://localhost:3005, Postgres local (porta 5433) com seed aplicado.
// Uso: node apps/web/tests/login-regras.e2e.cjs
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
// Senha temporária criada direto no banco (decisão #164: a recuperação passou a usar link; a senha temporária continua nos acessos novos)
const _cr = require('crypto');
function darTemp(email, pw = 'TempTeste@2026xyz') {
  const sal = _cr.randomBytes(16); const h = _cr.scryptSync(pw, sal, 64);
  const guardado = `scrypt$${sal.toString('base64')}$${h.toString('base64')}`;
  require('child_process').execSync('psql -h /var/tmp -p 5433 -U postgres -d filapro -tA', { input: `update "Usuario" set "senhaTempHash"='${guardado}', "senhaTempExpiraEm"=now()+interval '24 hours' where email='${email}';` });
  return pw;
}

const res = [];
const ok = (nome, cond, extra = '') => res.push(`${cond ? 'PASSOU' : 'FALHOU'} — ${nome}${extra ? ' (' + extra + ')' : ''}`);

(async () => {
  sql('delete from "TentativaLogin"');
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); return [c, await c.newPage()]; };
  const login = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    if (modulo === 'empresarial') await p.click('text=Módulo Business');
    await p.fill('#email', email); await p.fill('#senha', senha);
    await p.click('button[type=submit]');
    await p.waitForTimeout(1200);
  };
  const erroTxt = async (p) => (await p.locator('.text-rose-200').allInnerTexts()).join(' ');

  // 1. Botão demo Usuário (Individual) entra direto
  let [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.click('text=Entrar como Usuário (Individual)');
  await p.waitForURL('**/dashboard', { timeout: 5000 }).catch(() => {});
  ok('Botão demo entra direto no dashboard', p.url().endsWith('/dashboard'));
  ok('Dashboard mostra o usuário certo', (await p.content()).includes('Usuário Demo'));
  const ck = (await c.cookies()).find(x => x.name === 'filapro_sessao');
  ok('Cookie de sessão some ao fechar o navegador (sem validade)', ck && ck.expires === -1);
  ok('Cookie protegido (httpOnly)', ck && ck.httpOnly);
  // 2. Sair
  await p.click('text=Sair'); await p.waitForURL('**/login');
  await p.goto(BASE + '/dashboard'); await p.waitForTimeout(500);
  ok('Depois de sair, /dashboard volta para o login', p.url().endsWith('/login'));
  // 9. Lembrar de mim guardou o e-mail
  ok('Lembrar de mim preenche o e-mail', (await p.inputValue('#email')) === 'usuario@disparopro.com.br');
  await c.close();

  // 3. Aba errada
  [c, p] = await novo();
  await login(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'individual');
  ok('Aba errada é bloqueada', (await erroTxt(p)).includes('pertence ao módulo Empresarial'), await erroTxt(p));
  await login(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'empresarial');
  ok('Aba certa entra', p.url().endsWith('/dashboard'));
  await c.close();

  // 4. Super Admin entra por qualquer aba
  for (const m of ['individual', 'empresarial']) {
    [c, p] = await novo();
    await login(p, 'superadmin@disparopro.com.br', 'Super@12345678', m);
    ok(`Super Admin entra pela aba ${m}`, p.url().endsWith('/dashboard'));
    await c.close();
  }

  // 5. 5 senhas erradas → bloqueio 15 min
  [c, p] = await novo();
  for (let i = 0; i < 5; i++) await login(p, 'ana@empresaexemplo.com.br', 'Errada@1234567', 'empresarial');
  ok('5ª senha errada bloqueia', (await erroTxt(p)).includes('bloqueado por 15 minutos'), await erroTxt(p));
  await login(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'empresarial');
  ok('Bloqueado mesmo com a senha certa', (await erroTxt(p)).includes('Tente novamente em'), await erroTxt(p));
  sql("update \"Usuario\" set \"bloqueadoAte\"=null, \"tentativasFalhas\"=0 where email='ana@empresaexemplo.com.br'");
  sql('delete from "TentativaLogin"'); // decisão #160: o controle de tentativas fica no banco
  await c.close();

  // 6. Pacote expirado: todos da empresa
  sql("update \"Empresa\" set \"expiraEm\"=now()-interval '1 day' where id='teste-empresa-exemplo'");
  for (const e of [['admin-empresa@empresaexemplo.com.br', 'Admin@12345678'], ['ana@empresaexemplo.com.br', 'User@12345678']]) {
    [c, p] = await novo();
    await login(p, e[0], e[1], 'empresarial');
    ok(`Pacote expirado bloqueia ${e[0]}`, (await erroTxt(p)).includes('Acesso expirado'), await erroTxt(p));
    await c.close();
  }
  sql("update \"Empresa\" set \"expiraEm\"=now()+interval '26 day' where id='teste-empresa-exemplo'");

  // 7. Recuperação de senha + primeiro acesso
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.click('text=Esqueci minha senha');
  await p.fill('#rec-email', 'usuario@disparopro.com.br');
  await p.click('text=Enviar link para nova senha'); await p.waitForTimeout(1500);
  ok('Recuperação mostra "Solicitação registrada"', await p.locator('text=Solicitação registrada').count() === 1);
  const log = fs.readFileSync('/var/tmp/web.log', 'utf8');
  ok('E-mail com o link para criar a nova senha gerado (sem senha no e-mail)', /definir-senha#t=[A-Za-z0-9_-]{43}/.test(log) && !/senha temporária do FilaPro Leads é/.test(log.slice(-4000)));
  const temp = darTemp('usuario@disparopro.com.br'); // estado "primeiro acesso" (conta nova com senha temporária)
  await login(p, 'usuario@disparopro.com.br', temp, 'individual');
  ok('Senha temporária leva ao primeiro acesso', p.url().endsWith('/primeiro-acesso'));
  await p.goto(BASE + '/dashboard'); await p.waitForTimeout(500);
  ok('Sem trocar a senha não acessa o dashboard', p.url().endsWith('/primeiro-acesso'));
  await p.fill('#new-pw', 'fraca'); await p.click('text=Salvar nova senha e entrar'); await p.waitForTimeout(500);
  ok('Senha nova fraca é recusada', await p.locator('text=precisa cumprir todos os requisitos').count() === 1);
  // Decisão #98: "Gerar senha forte"
  await p.click('[data-testid=gerar-senha]'); await p.waitForTimeout(300);
  const gerada1 = await p.inputValue('#new-pw');
  ok('"Gerar senha forte" cria senha de 16 caracteres que cumpre as regras', gerada1.length === 16 && /[A-Z]/.test(gerada1) && /[a-z]/.test(gerada1) && /[0-9]/.test(gerada1) && /[^A-Za-z0-9]/.test(gerada1) && (await p.getAttribute('#new-pw', 'type')) === 'text');
  ok('Mostra "Copiar senha" e o aviso para guardar', (await p.locator('[data-testid=copiar-senha]').count()) === 1 && (await p.locator('[data-testid=aviso-senha-gerada]').count()) === 1);
  await p.click('[data-testid=gerar-senha]'); await p.waitForTimeout(200);
  ok('Cada clique gera uma senha diferente', (await p.inputValue('#new-pw')) !== gerada1);
  await p.screenshot({ path: (process.argv[2] || '/tmp/claude-0') + '/senha-forte.png' });
  await p.fill('#new-pw', 'NovaSenha@2026x'); await p.click('text=Salvar nova senha e entrar');
  await p.waitForURL('**/dashboard', { timeout: 5000 }).catch(() => {});
  ok('Senha nova forte entra no dashboard', p.url().endsWith('/dashboard'));
  await c.close();
  [c, p] = await novo();
  await login(p, 'usuario@disparopro.com.br', 'User@12345678', 'individual');
  ok('Senha antiga deixa de valer após a troca', (await erroTxt(p)).includes('incorretos'));
  await login(p, 'usuario@disparopro.com.br', temp, 'individual');
  ok('Senha temporária deixa de valer após a troca', (await erroTxt(p)).includes('incorretos'));
  await login(p, 'usuario@disparopro.com.br', 'NovaSenha@2026x', 'individual');
  ok('Senha nova funciona', p.url().endsWith('/dashboard'));
  await c.close();

  // 8. E-mail inexistente na recuperação: mesma resposta
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.click('text=Esqueci minha senha'); await p.fill('#rec-email', 'naoexiste@x.com');
  await p.click('text=Enviar link para nova senha'); await p.waitForTimeout(1000);
  ok('E-mail inexistente: mesma resposta (não revela cadastro)', await p.locator('text=Solicitação registrada').count() === 1);
  await c.close();

  console.log(res.join('\n'));
  await b.close();
})();
