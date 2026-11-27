// Teste de ponta a ponta da decisão #157 (Módulo 1, S1): trocar a senha só vale no primeiro acesso.
// Requer: site em http://localhost:3005 e Postgres de teste (5433) com seed. Log do site em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa27-primeiro-acesso.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const EMAIL = 'usuario@disparopro.com.br';
const P1 = 'PrimeiraSenha@2026a', P2 = 'SegundaSenha@2026b';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2] || '/tmp';
const log = () => fs.readFileSync('/var/tmp/web.log', 'utf8');
const ultimaTemp = () => (log().match(/senha temporária do FilaPro Leads é: (\S+)/g) || []).pop()?.split(': ')[1];
const avisos = () => (log().match(/Assunto: Sua senha foi alterada/g) || []).length;

(async () => {
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); return [c, await c.newPage()]; };
  const entrar = async (p, senha) => { await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.fill('#email', EMAIL); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForTimeout(1500); };
  const recuperar = async (p) => { sql(`delete from "TentativaLogin"`); await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Esqueci minha senha'); await p.fill('#rec-email', EMAIL); await p.click('text=Enviar senha temporária'); await p.waitForTimeout(1500); return ultimaTemp(); };
  const trocar = (p, senha) => p.evaluate(async (s) => { const r = await fetch('/api/auth/trocar-senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha: s }) }); return { status: r.status, corpo: await r.json().catch(() => ({})) }; }, senha);
  const cookie = async (c) => (await c.cookies()).find((x) => x.name === 'filapro_sessao')?.value;
  try {
    // 1. Primeiro acesso: troca a temporária por P1 (estado conhecido)
    const [cA, pA] = await novo();
    const temp1 = await recuperar(pA);
    await entrar(pA, temp1);
    ok('Senha temporária leva ao primeiro acesso', pA.url().endsWith('/primeiro-acesso'));
    const exp = Number(sql(`select extract(epoch from (s."expiraEm" - now())) from "Sessao" s join "Usuario" u on u.id=s."usuarioId" where u.email='${EMAIL}' order by s."criadoEm" desc limit 1`));
    ok('Sessão de primeiro acesso vale ~30 minutos (não 24 h)', exp > 25 * 60 && exp < 31 * 60, `${Math.round(exp / 60)} min`);
    let r = await trocar(pA, temp1);
    ok('Nova senha igual à temporária é recusada', r.status === 400 && /temporária/.test(r.corpo.erro || ''), JSON.stringify(r));
    const antes = avisos();
    r = await trocar(pA, P1);
    ok('Senha definida no primeiro acesso funciona', r.status === 200 && !!r.corpo.destino, JSON.stringify(r));
    await pA.goto(BASE + '/dashboard'); await pA.waitForTimeout(800);
    ok('Sessão nova (24 h) entra no dashboard', pA.url().endsWith('/dashboard'));
    const exp2 = Number(sql(`select extract(epoch from (s."expiraEm" - now())) from "Sessao" s join "Usuario" u on u.id=s."usuarioId" where u.email='${EMAIL}' order by s."criadoEm" desc limit 1`));
    ok('Sessão depois da troca vale 24 h', exp2 > 23 * 3600, `${Math.round(exp2 / 3600)} h`);
    await new Promise((r) => setTimeout(r, 1500));
    ok('E-mail de aviso "senha alterada" enviado, sem a senha', avisos() === antes + 1 && !log().includes(P1));
    ok('Logs registra a troca', Number(sql(`select count(*) from "Log" where texto like 'Senha definida no primeiro acesso%' and quem like '%${EMAIL}%'`)) >= 1);

    // 2. Quem já tem senha definitiva não troca por esta rota (sessão A aberta, precisaTrocar = false)
    r = await trocar(pA, 'Invasora@2026zzz');
    ok('Sessão normal NÃO troca a senha (403)', r.status === 403, JSON.stringify(r));

    // 3. Segundo aparelho em primeiro acesso: ao trocar, a sessão A e o token antigo caem
    const [cB, pB] = await novo();
    const temp2 = await recuperar(pB);
    await entrar(pB, temp2);
    ok('Segundo aparelho entra em primeiro acesso', pB.url().endsWith('/primeiro-acesso'));
    const tokenAntigoB = await cookie(cB);
    const tokenA = await cookie(cA);
    r = await trocar(pB, P2);
    ok('Segunda troca funciona', r.status === 200, JSON.stringify(r));
    await pA.goto(BASE + '/dashboard'); await pA.waitForTimeout(800);
    ok('Sessão antiga (aparelho A) foi derrubada', pA.url().includes('/login'), pA.url());
    ok('Token mudou na sessão do aparelho B', (await cookie(cB)) !== tokenAntigoB);
    const rAntigo = await fetch(BASE + '/api/presenca', { method: 'POST', headers: { cookie: `filapro_sessao=${tokenAntigoB}` } });
    ok('Token antigo não vale mais', rAntigo.status === 401, String(rAntigo.status));
    const rA = await fetch(BASE + '/api/presenca', { method: 'POST', headers: { cookie: `filapro_sessao=${tokenA}` } });
    ok('Token do aparelho A não vale mais', rA.status === 401, String(rA.status));
    await pB.goto(BASE + '/dashboard'); await pB.waitForTimeout(800);
    ok('Aparelho B segue logado', pB.url().endsWith('/dashboard'));

    // 4. Sem login não troca
    const semLogin = await fetch(BASE + '/api/auth/trocar-senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senha: 'Qualquer@2026abc' }) });
    ok('Sem sessão: 401', semLogin.status === 401);

    // 5. Senhas: P1 não vale mais, P2 vale
    const [cC, pC] = await novo();
    await entrar(pC, P1);
    ok('Senha anterior (P1) deixou de valer', pC.url().includes('/login'));
    await entrar(pC, P2);
    ok('Senha nova (P2) funciona', pC.url().endsWith('/dashboard'));

    // 6. Tela de primeiro acesso inalterada (print para conferência)
    const [cD, pD] = await novo();
    const temp3 = await recuperar(pD); await entrar(pD, temp3);
    await pD.screenshot({ path: OUT + '/primeiro-acesso.png' });
    const [cL, pL] = await novo();
    await pL.goto(BASE + '/login', { waitUntil: 'networkidle' }); await pL.waitForTimeout(1500);
    await pL.screenshot({ path: OUT + '/login-s1.png' });
  } finally {
    console.log(res.join('\n'));
    await b.close();
  }
})();
