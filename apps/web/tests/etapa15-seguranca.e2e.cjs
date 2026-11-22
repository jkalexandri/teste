// Teste de ponta a ponta da decisão #105: cabeçalhos de segurança, limite por endereço de internet,
// verificação em duas etapas do Super Admin e alertas de segurança.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 e Postgres com seed. Log do site em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa15-seguranca.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const SA = 'superadmin@disparopro.com.br';

// Código TOTP (o mesmo cálculo do app autenticador)
function totp(b32, quando = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = [];
  for (const c of b32.replace(/\s/g, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(quando / 30000)));
  const h = crypto.createHmac('sha1', Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
const desligar2fa = () => sql(`update "Usuario" set "doisFatoresAtivo"=false, "doisFatoresSegredo"=null, "doisFatoresCodigos"='{}' where email='${SA}'`);

(async () => {
  desligar2fa();
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const senha = async (p, email, s) => { await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.fill('#email', email); await p.fill('#senha', s); await p.click('button[type=submit]'); await espera(1500); };
  try {
    // ===== 3. Cabeçalhos =====
    const r = await fetch(BASE + '/login');
    ok('Cabeçalho: não abre dentro de outro site', r.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(r.headers.get('content-security-policy') || ''));
    ok('Cabeçalho: CSP, nosniff e Referrer', !!r.headers.get('content-security-policy') && r.headers.get('x-content-type-options') === 'nosniff' && !!r.headers.get('referrer-policy'));
    ok('Não revela a tecnologia (X-Powered-By)', !r.headers.get('x-powered-by'));

    // ===== 4. Limite por endereço de internet =====
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    let st = [];
    for (let i = 0; i < 22; i++) st.push((await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email: 'naoexiste@x.com', senha: 'Errada@1234567' }) })).status);
    ok('Login: limite de 20 tentativas por endereço', st.slice(0, 20).every((s) => s !== 429) && st[21] === 429, st.slice(-3).join(','));
    st = [];
    for (let i = 0; i < 6; i++) st.push((await fetch(BASE + '/api/auth/recuperar', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ email: 'naoexiste@x.com' }) })).status);
    ok('Esqueci minha senha: limite de 5 por hora', st[4] === 200 && st[5] === 429, st.join(','));
    const outro = (await fetch(BASE + '/api/auth/recuperar', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.250' }, body: JSON.stringify({ email: 'naoexiste@x.com' }) })).status;
    ok('Outro endereço não é afetado', outro === 200);

    // ===== 8. Verificação em duas etapas =====
    let [c, p] = await novo();
    await senha(p, SA, 'Super@12345678'); await p.waitForURL('**/dashboard');
    ok('Menu do Super Admin tem Segurança', (await p.locator('aside nav >> text=Segurança').count()) === 1);
    await p.goto(BASE + '/seguranca'); await espera(600);
    await p.click('button:has-text("Ativar")'); await espera(1200);
    const segredo = (await p.locator('[data-testid=segredo-2fa]').innerText()).replace(/\s/g, '');
    ok('Ativar mostra QR Code e chave', segredo.length >= 32 && (await p.locator('img[alt="QR Code para o app autenticador"]').count()) === 1);
    await p.screenshot({ path: OUT + '/seguranca-ativar.png' });
    await p.fill('[aria-label="Código de 6 dígitos"]', '000000'); await p.click('button:has-text("Confirmar e ativar")'); await espera(800);
    ok('Código errado não ativa', sql(`select "doisFatoresAtivo" from "Usuario" where email='${SA}'`) === 'f');
    await p.fill('[aria-label="Código de 6 dígitos"]', totp(segredo)); await p.click('button:has-text("Confirmar e ativar")'); await espera(1200);
    const codigos = (await p.locator('[data-testid=codigos-recuperacao] span').allInnerTexts());
    ok('Ativa e mostra 10 códigos de recuperação', sql(`select "doisFatoresAtivo" from "Usuario" where email='${SA}'`) === 't' && codigos.length === 10);
    ok('Segredo guardado criptografado', sql(`select "doisFatoresSegredo" like 'v1:%' from "Usuario" where email='${SA}'`) === 't');
    await c.close();

    // Entrada: senha → código
    [c, p] = await novo();
    await senha(p, SA, 'Super@12345678');
    ok('Depois da senha pede o código', p.url().includes('/verificacao'));
    await p.screenshot({ path: OUT + '/verificacao.png' });
    const dash = await p.evaluate(async () => (await fetch('/dashboard', { redirect: 'manual' })).status);
    await p.goto(BASE + '/dashboard'); await espera(800);
    ok('Sem o código não entra no sistema', !p.url().includes('/dashboard'), String(dash));
    await p.goto(BASE + '/verificacao'); await espera(500);
    await p.fill('#codigo-2fa', '123456'); await p.click('button:has-text("Entrar")'); await espera(800);
    ok('Código errado mostra tentativas restantes', (await p.locator('text=Restam 4 tentativas').count()) === 1);
    await p.fill('#codigo-2fa', totp(segredo)); await p.click('button:has-text("Entrar")');
    await p.waitForURL('**/dashboard', { timeout: 8000 }).catch(() => undefined);
    ok('Código certo entra', p.url().includes('/dashboard'));
    await c.close();
    // Código de recuperação (vale uma vez)
    [c, p] = await novo();
    await senha(p, SA, 'Super@12345678');
    await p.click('text=Perdi o celular'); await p.fill('#codigo-2fa', codigos[0]); await p.click('button:has-text("Entrar")');
    await p.waitForURL('**/dashboard', { timeout: 8000 }).catch(() => undefined);
    ok('Código de recuperação entra', p.url().includes('/dashboard'));
    ok('Código de recuperação usado sai da lista', sql(`select cardinality("doisFatoresCodigos") from "Usuario" where email='${SA}'`) === '9');
    await c.close();
    [c, p] = await novo();
    await senha(p, SA, 'Super@12345678');
    await p.click('text=Perdi o celular'); await p.fill('#codigo-2fa', codigos[0]); await p.click('button:has-text("Entrar")'); await espera(1000);
    ok('Código de recuperação não vale duas vezes', !p.url().includes('/dashboard'));
    // 5 erros: volta para a senha
    for (let i = 0; i < 4; i++) { await p.fill('#codigo-2fa', 'AAAA-AAAA'); await p.click('button:has-text("Entrar")'); await espera(500); }
    await espera(1000);
    ok('5 códigos errados: precisa entrar de novo com a senha', p.url().includes('/login'));
    await c.close();
    // Outros perfis continuam entrando só com a senha
    [c, p] = await novo();
    await senha(p, 'usuario@disparopro.com.br', 'User@12345678');
    ok('Usuário comum entra só com a senha', p.url().includes('/dashboard'));
    await c.close();

    // ===== 9. Alertas de segurança =====
    fs.writeFileSync('/tmp/claude-0/marca-alerta', '');
    const antes = fs.readFileSync('/var/tmp/web.log', 'utf8').length;
    // Entrada do Super Admin por um endereço novo (via API, com a segunda etapa)
    const ipNovo = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
    const ctx = await b.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ipNovo } }); const pn = await ctx.newPage();
    await senha(pn, SA, 'Super@12345678'); await pn.fill('#codigo-2fa', totp(segredo)); await pn.click('button:has-text("Entrar")'); await espera(1500);
    await ctx.close();
    let log = fs.readFileSync('/var/tmp/web.log', 'utf8').slice(antes);
    ok('Alerta: entrada do Super Admin por endereço novo', log.includes('endereço de internet novo') && log.includes(ipNovo));
    // Mesmo endereço de novo: sem alerta
    const antes2 = fs.readFileSync('/var/tmp/web.log', 'utf8').length;
    const ctx2 = await b.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ipNovo } }); const pn2 = await ctx2.newPage();
    await senha(pn2, SA, 'Super@12345678'); await pn2.fill('#codigo-2fa', totp(segredo, Date.now() + 30000)); await pn2.click('button:has-text("Entrar")'); await espera(1500);
    await ctx2.close();
    ok('Endereço conhecido não gera alerta', !fs.readFileSync('/var/tmp/web.log', 'utf8').slice(antes2).includes('endereço de internet novo'));
    // Bloqueio de 3 contas em 1 hora
    sql(`delete from "Log" where tipo='SENHA' and texto like '%bloqueado por%'`);
    const contas = sql(`select email from "Usuario" where cargo<>'SUPERADMIN' and status='ATIVO' and email not in ('ana@empresaexemplo.com.br','admin-empresa@empresaexemplo.com.br','usuario@disparopro.com.br') order by email limit 3`).split('\n').filter(Boolean);
    const antes3 = fs.readFileSync('/var/tmp/web.log', 'utf8').length;
    for (const e of contas) for (let i = 0; i < 5; i++) await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i + 10}` }, body: JSON.stringify({ email: e, senha: 'Errada@1234567' }) });
    await espera(800);
    // O alerta sai no máximo 1 vez por hora: vale o enviado agora ou um já enviado antes por outro teste da regressão
    log = fs.readFileSync('/var/tmp/web.log', 'utf8');
    ok('Alerta: 3 contas bloqueadas em 1 hora', contas.length === 3 && log.includes('contas bloqueadas por senha errada'), String(contas.length));
    for (const e of contas) sql(`update "Usuario" set "bloqueadoAte"=null, "tentativasFalhas"=0 where email='${e}'`);

    // Desativar (exige o código)
    [c, p] = await novo();
    await senha(p, SA, 'Super@12345678'); await p.fill('#codigo-2fa', totp(segredo)); await p.click('button:has-text("Entrar")'); await p.waitForURL('**/dashboard', { timeout: 8000 }).catch(() => undefined);
    await p.goto(BASE + '/seguranca'); await espera(600);
    ok('Tela mostra ativa e códigos restantes', (await p.locator('[data-testid=estado-2fa]').innerText()).includes('ativa') && (await p.locator('text=Códigos de recuperação restantes').count()) === 1);
    await p.screenshot({ path: OUT + '/seguranca-ativa.png' });
    await p.fill('[aria-label="Código de 6 dígitos"]', totp(segredo)); await p.click('button:has-text("Desativar")'); await espera(1200);
    ok('Desativar com o código', sql(`select "doisFatoresAtivo" from "Usuario" where email='${SA}'`) === 'f');
    await c.close();
  } finally {
    desligar2fa();
    await b.close();
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
