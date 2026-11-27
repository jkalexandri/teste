// Teste de ponta a ponta da decisão #166 (Módulo 1, S7): verificação em duas etapas para todos os perfis (opcional).
// Requer: site em http://localhost:3005 e Postgres de teste (5433) com seed. Log do site em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa36-dois-fatores-perfis.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sqlIn = (q) => execSync('psql -h /var/tmp -p 5433 -U postgres -d filapro -tA', { input: q }).toString().trim();
const BASE = 'http://localhost:3005';
const ADM = 'admin-empresa@empresaexemplo.com.br', IND = 'usuario@disparopro.com.br', ANA = 'ana@empresaexemplo.com.br';
const SENHA = { [ADM]: 'Admin@12345678', [IND]: 'User@12345678', [ANA]: 'User@12345678' };
const MOD = { [ADM]: 'empresarial', [IND]: 'individual', [ANA]: 'empresarial' };
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2] || '/tmp';
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const log = () => fs.readFileSync('/var/tmp/web.log', 'utf8');
const SORTE = 1 + Math.floor(Math.random() * 250); let n = 0;
const ip = () => `198.${SORTE}.${Math.floor(n / 200) % 250}.${(n++ % 200) + 20}`;
function totp(b32, quando = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = [];
  for (const c of b32.replace(/\s/g, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(quando / 30000)));
  const h = crypto.createHmac('sha1', Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
// Código do intervalo atual (+1 = o seguinte, aceito pela janela do site)
const codigo = (seg, mais = 0) => totp(seg, Date.now() + mais * 30000);
const post = async (rota, corpo, ck) => { const r = await fetch(BASE + rota, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(), ...(ck ? { cookie: ck } : {}) }, body: JSON.stringify(corpo || {}) }); return { st: r.status, c: await r.json().catch(() => ({})), r }; };
const entrar = async (email) => { const r = await post('/api/auth/login', { email, senha: SENHA[email], modulo: MOD[email] }); const ck = (r.r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('filapro_sessao=')); return { ...r, ck }; };
const verificar = (ck, cod, recuperacao = false) => post('/api/auth/verificar', { codigo: cod, recuperacao }, ck);
const estado = (email) => sql(`select "doisFatoresAtivo", "doisFatoresSegredo" is null, cardinality("doisFatoresCodigos") from "Usuario" where email='${email}'`);
const limpa = () => { for (const e of [ADM, IND, ANA]) sql(`update "Usuario" set "doisFatoresAtivo"=false, "doisFatoresSegredo"=null, "doisFatoresCodigos"='{}', "doisFatoresUltimoPasso"=null, "linkSenhaHash"=null, "linkSenhaExpiraEm"=null where email='${e}'`); sql(`delete from "TentativaLogin"`); };

const ORIGINAL = {};
const restauraSenhas = () => { for (const e of [ADM, IND, ANA]) sqlIn(`update "Usuario" set "senhaHash"='${ORIGINAL[e]}' where email='${e}';`); SENHA[ADM] = 'Admin@12345678'; };

(async () => {
  for (const e of [ADM, IND, ANA]) ORIGINAL[e] = sql(`select "senhaHash" from "Usuario" where email='${e}'`);
  SENHA[ADM] = 'Admin@12345678';
  limpa();
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return p; };
  const entrarUI = async (p, email) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    if (MOD[email] === 'empresarial') await p.click('text=Módulo Empresarial');
    await p.fill('#email', email); await p.fill('#senha', SENHA[email]); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard', { timeout: 8000 });
  };
  const ativar = async (p) => {
    await p.goto(BASE + '/seguranca'); await esp(700); await p.click('button:has-text("Ativar")'); await esp(1300);
    const seg = (await p.locator('[data-testid=segredo-2fa]').innerText()).replace(/\s/g, '');
    await p.fill('[aria-label="Código de 6 dígitos"]', codigo(seg)); await p.click('button:has-text("Confirmar e ativar")'); await esp(1500);
    const cods = await p.locator('[data-testid=codigos-recuperacao] span').allInnerTexts();
    return { seg, cods };
  };
  const dados = {};
  try {
    // 1. Cada perfil vê o menu Segurança, o convite (dono da conta) e ativa a verificação
    for (const email of [ADM, IND, ANA]) {
      const p = await novo(); await entrarUI(p, email);
      const menu = (await p.locator('aside nav a').allInnerTexts()).map((s) => s.trim());
      const dono = email !== ANA;
      ok(`${email}: o menu tem "Segurança"`, menu.includes('Segurança'), menu.join(', '));
      ok(`${email}: ${dono ? 'o dono da conta vê o convite discreto para ativar' : 'quem não é dono da conta não vê o convite'}`, (await p.locator('[data-testid=convite-2fa]').count()) === (dono ? 1 : 0));
      if (email === ADM) {
        await p.screenshot({ path: OUT + '/convite-2fa.png' });
        await p.click('[data-testid=convite-2fa] >> text=Agora não'); await esp(300);
        ok('"Agora não" esconde o convite', (await p.locator('[data-testid=convite-2fa]').count()) === 0);
      }
      dados[email] = await ativar(p);
      ok(`${email}: ativou a verificação e recebeu 10 códigos de recuperação`, estado(email) === 't|f|10' && dados[email].cods.length === 10, estado(email));
      if (email === ADM) await p.screenshot({ path: OUT + '/seguranca-admin.png' });
      await p.goto(BASE + '/dashboard'); await esp(500);
      ok(`${email}: depois de ativar, o convite some`, (await p.locator('[data-testid=convite-2fa]').count()) === 0);
      await p.context().close();
    }

    // 2. No login: senha -> tela do código, código de uso único, nada de contornar
    for (const email of [ADM, IND, ANA]) {
      const l = await entrar(email);
      ok(`${email}: depois da senha vai para a tela do código`, l.st === 200 && l.c.destino === '/verificacao', JSON.stringify(l.c));
      const sem = await post('/api/presenca', {}, l.ck);
      ok(`${email}: sem o código não entra no sistema`, sem.st === 401, String(sem.st));
      const v = await verificar(l.ck, codigo(dados[email].seg, 1));
      ok(`${email}: com o código entra`, v.st === 200 && v.c.destino === '/dashboard', JSON.stringify(v.c));
      const l2 = await entrar(email); const v2 = await verificar(l2.ck, codigo(dados[email].seg, 1));
      ok(`${email}: o mesmo código não entra de novo (uso único)`, v2.st === 401);
    }

    // 3. Admin: "Esqueci minha senha" não dispensa o código; 10 erros congelam e o aviso sai por e-mail para a própria pessoa
    const rec = await post('/api/auth/recuperar', { email: ADM }); await esp(2500);
    const link = /definir-senha#t=([A-Za-z0-9_-]{43})/.exec(log().split('[email de desenvolvimento]').filter((x) => x.includes('Para: ' + ADM)).pop() || '');
    const def = link && (await post('/api/auth/definir-senha', { token: link[1], senha: 'NovaSenhaAdmin@2026x' }));
    SENHA[ADM] = 'NovaSenhaAdmin@2026x';
    const apos = await entrar(ADM);
    ok('Admin: redefinir a senha pelo link NÃO dispensa a verificação em duas etapas', rec.st === 200 && def && def.st === 200 && apos.c.destino === '/verificacao', JSON.stringify(apos.c));
    restauraSenhas(); // volta a senha de demonstração do Admin
    const antesEmail = (log().match(/Assunto: Verificação em duas etapas bloqueada/g) || []).length;
    const bloq = [];
    for (let i = 0; i < 2; i++) { const l = await entrar(ADM); for (let k = 0; k < 5; k++) await verificar(l.ck, '000000'); bloq.push(l); }
    const lb = await entrar(ADM); const certo = await verificar(lb.ck, codigo(dados[ADM].seg, 1));
    ok('Admin: 10 códigos errados congelam o código de 6 dígitos (nem o certo entra)', certo.st === 401 && /bloqueada por 15 minutos/.test(certo.c.erro || ''), certo.c.erro);
    await esp(1500);
    ok('Admin: o aviso do congelamento saiu por e-mail para ele mesmo', (log().match(/Assunto: Verificação em duas etapas bloqueada/g) || []).length === antesEmail + 1);
    const lr = await entrar(ADM); const rr = await verificar(lr.ck, dados[ADM].cods[0], true);
    ok('Admin: o código de recuperação continua entrando', rr.st === 200, JSON.stringify(rr.c));
    sql(`delete from "TentativaLogin"`);

    // 4. Admin da Empresa redefine a verificação de um usuário dele (Ana)
    // (o botão de demonstração do Admin não passa pelo código: desliga a verificação dele só para esta parte do roteiro)
    sql(`update "Usuario" set "doisFatoresAtivo"=false, "doisFatoresSegredo"=null, "doisFatoresCodigos"='{}' where email='${ADM}'`);
    const pa = await novo(); await pa.goto(BASE + '/login', { waitUntil: 'networkidle' }); await pa.click('text=Entrar como Admin da Empresa'); await pa.waitForURL('**/dashboard');
    await pa.goto(BASE + '/usuarios', { waitUntil: 'networkidle' }); await esp(700);
    const linhaAna = pa.locator('tr:has-text("Ana Souza")');
    ok('Admin vê "2 etapas" na linha de quem usa a verificação', (await linhaAna.innerText()).includes('2 etapas'));
    await pa.screenshot({ path: OUT + '/usuarios-2fa.png' });
    const lAna = await entrar(ANA); // sessão pendente de Ana: deve cair com a redefinição
    const emailsAntes = (log().match(/Assunto: Sua verificação em duas etapas foi redefinida/g) || []).length;
    await linhaAna.locator('[data-testid=redefinir-verificacao]').click(); await esp(2500);
    ok('Redefinir (Admin): a verificação de Ana foi desativada e os códigos apagados', estado(ANA) === 'f|t|0', estado(ANA));
    ok('Redefinir (Admin): saiu e-mail para a Ana dizendo quem redefiniu', (log().match(/Assunto: Sua verificação em duas etapas foi redefinida/g) || []).length === emailsAntes + 1 && /Admin da Empresa/.test(log().split('[email de desenvolvimento]').filter((x) => x.includes('Para: ' + ANA)).pop() || ''));
    ok('Redefinir (Admin): ficou nos Logs', Number(sql(`select count(*) from "Log" where texto like 'Verificação em duas etapas redefinida para Ana%'`)) >= 1);
    const sobra = await post('/api/presenca', {}, lAna.ck);
    ok('Redefinir (Admin): a sessão de Ana foi encerrada', sobra.st === 401, String(sobra.st));
    const aSemCodigo = await entrar(ANA);
    ok('Ana volta a entrar só com a senha', aSemCodigo.st === 200 && aSemCodigo.c.destino === '/dashboard', JSON.stringify(aSemCodigo.c));
    await pa.context().close();

    // 5. Super Admin redefine a do Admin da Empresa e a do Usuário Individual
    sql(`update "Usuario" set "doisFatoresAtivo"=true, "doisFatoresSegredo"='v1:teste', "doisFatoresCodigos"='{a,b,c}' where email='${ADM}'`); // Admin com verificação ativa (para o botão aparecer)
    sql(`update "Usuario" set "doisFatoresAtivo"=true, "doisFatoresSegredo"='v1:teste', "doisFatoresCodigos"='{a,b,c}' where email='${IND}'`);
    const ps = await novo(); await ps.goto(BASE + '/login', { waitUntil: 'networkidle' }); await ps.click('text=Entrar como Super Admin'); await ps.waitForURL('**/dashboard');
    await ps.goto(BASE + '/usuarios-individuais', { waitUntil: 'networkidle' }); await esp(700);
    await ps.locator(`tr:has-text("${IND}")`).locator('[data-testid=redefinir-verificacao]').click(); await esp(2500);
    ok('Redefinir (Super Admin): a verificação do Usuário Individual foi desativada', estado(IND) === 'f|t|0', estado(IND));
    await ps.goto(BASE + '/empresas', { waitUntil: 'networkidle' }); await esp(700);
    const cartao = ps.locator('b:has-text("Empresa Exemplo")').locator('xpath=ancestor::article[1]');
    await cartao.locator('button:has-text("Ver usuários")').click(); await esp(500);
    await ps.screenshot({ path: OUT + '/empresas-2fa.png' });
    await cartao.locator('[data-testid=redefinir-verificacao]').first().click(); await esp(2500);
    ok('Redefinir (Super Admin): a verificação do Admin da Empresa foi desativada', estado(ADM) === 'f|t|0', estado(ADM));
    await ps.context().close();
  } finally {
    limpa();
    restauraSenhas();
    await b.close();
    console.log(res.join('\n'));
  }
})();
