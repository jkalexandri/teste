// Teste de ponta a ponta da decisão #165 (Módulo 1, S9 — Fase 2): contas novas e redefinição de acesso por link de uso único.
// Requer: site em http://localhost:3005 e Postgres de teste (5433) com seed. Log do site em /var/tmp/web.log.
// (A criação de conta por compra, teste grátis, Super Admin e Admin da Empresa é coberta pelas etapas 4b, 4c e 5.)
// Uso: node apps/web/tests/etapa35-acesso-novo-link.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const sqlIn = (q) => execSync('psql -h /var/tmp -p 5433 -U postgres -d filapro -tA', { input: q }).toString().trim();
const BASE = 'http://localhost:3005', EMP = 'teste-empresa-exemplo';
const suf = Date.now().toString().slice(-6);
const RESET = `reset${suf}@exemplo.com`, PEND = `pend${suf}@exemplo.com`;
const SENHA_ANA = 'User@12345678', NOVA = 'NovaSenhaLink@2026x', NOVA2 = 'OutraSenhaLink@2026y';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2] || '/tmp';
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const SORTE = 1 + Math.floor(Math.random() * 250); let n = 0;
const ip = () => `198.${SORTE}.${Math.floor(n / 200) % 250}.${(n++ % 200) + 20}`;
const post = async (rota, corpo, ck) => { const t = process.hrtime.bigint(); const r = await fetch(BASE + rota, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(), ...(ck ? { cookie: ck } : {}) }, body: JSON.stringify(corpo || {}) }); return { st: r.status, c: await r.json().catch(() => ({})), ms: Number(process.hrtime.bigint() - t) / 1e6, r }; };
const emailPara = (email) => { const blocos = fs.readFileSync('/var/tmp/web.log', 'utf8').split('[email de desenvolvimento]').filter((b) => b.includes('Para: ' + email)); return blocos.pop() || ''; };
const tokenDe = (email) => { const m = /definir-senha#t=([A-Za-z0-9_-]{43})/.exec(emailPara(email)); return m && m[1]; };
const entrar = (email, senha) => post('/api/auth/login', { email, senha, modulo: 'empresarial' });
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

(async () => {
  sql(`delete from "TentativaLogin"`);
  const hashAna = sql(`select "senhaHash" from "Usuario" where email='ana@empresaexemplo.com.br'`);
  sqlIn(`insert into "Usuario" (id,nome,email,cargo,"empresaId","senhaHash","atualizadoEm") values ('u-reset-${suf}','Teste Reset','${RESET}','USUARIO','${EMP}','${hashAna}',now());`);
  sqlIn(`insert into "Usuario" (id,nome,email,cargo,"empresaId","atualizadoEm") values ('u-pend-${suf}','Teste Pendente','${PEND}','USUARIO','${EMP}',now());`);
  sqlIn(`update "Usuario" set "linkSenhaHash"='teste-link-${suf}', "linkSenhaExpiraEm"=now()+interval '7 days' where id='u-pend-${suf}';`); // conta nova com link ainda não usado
  const b = await chromium.launch();
  try {
    // 1. Sessão e notificação do usuário que será redefinido
    const login1 = await entrar(RESET, SENHA_ANA);
    const ck = (login1.r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('filapro_sessao='));
    sqlIn(`insert into "PushInscricao" (id,"usuarioId",endpoint,p256dh,auth) values ('push-${suf}','u-reset-${suf}','https://exemplo.test/${suf}','a','b');`);
    ok('Usuário de teste entra e tem sessão e aparelho de notificação', login1.st === 200 && !!ck && sql(`select count(*) from "Sessao" where "usuarioId"='u-reset-${suf}'`) === '1');

    // 2. Admin da Empresa clica em "Resetar senha"
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); p.on('dialog', (d) => d.accept());
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Entrar como Admin da Empresa'); await p.waitForURL('**/dashboard');
    await p.goto(BASE + '/usuarios', { waitUntil: 'networkidle' }); await esp(600);
    ok('A lista mostra "Aguardando criar a senha" para a conta ainda sem senha', (await p.locator(`tr:has-text("Teste Pendente")`).innerText()).includes('Aguardando criar a senha'));
    await p.screenshot({ path: OUT + '/usuarios-pendente.png' });
    await p.click(`tr:has-text("Teste Reset") >> button:has-text("Resetar senha")`); await esp(2500);
    const linha = sql(`select "senhaHash" is null, "linkSenhaHash" is not null, extract(epoch from ("linkSenhaExpiraEm" - now()))/86400 from "Usuario" where id='u-reset-${suf}'`).split('|');
    ok('Resetar: a senha atual deixou de valer e há um link de ~7 dias', linha[0] === 't' && linha[1] === 't' && Number(linha[2]) > 6.9 && Number(linha[2]) <= 7.01, `${Number(linha[2]).toFixed(2)} dias`);
    ok('Resetar: as sessões e as notificações do celular foram encerradas', sql(`select count(*) from "Sessao" where "usuarioId"='u-reset-${suf}'`) === '0' && sql(`select count(*) from "PushInscricao" where "usuarioId"='u-reset-${suf}'`) === '0');
    const velha = await post('/api/presenca', {}, ck);
    ok('Resetar: a sessão antiga não vale mais', velha.st === 401, String(velha.st));
    const antiga = await entrar(RESET, SENHA_ANA);
    ok('Resetar: a senha anterior não entra mais', antiga.st === 401, String(antiga.st));
    const email = emailPara(RESET);
    ok('O e-mail traz o link e NÃO traz senha, e diz que o acesso foi redefinido', !!tokenDe(RESET) && !/Senha temporária/.test(email) && /redefinido/.test(email));

    // 3. O link cria a nova senha, uma vez só
    const tk = tokenDe(RESET);
    const def = await post('/api/auth/definir-senha', { token: tk, senha: NOVA });
    const de = await post('/api/auth/definir-senha', { token: tk, senha: NOVA2 });
    ok('O link cria a nova senha e não vale de novo', def.st === 200 && de.st === 400, `${def.st}/${de.st}`);
    const nova = await entrar(RESET, NOVA);
    ok('Entra com a nova senha direto no sistema (sem tela de primeiro acesso)', nova.st === 200 && nova.c.destino === '/dashboard', JSON.stringify(nova.c));

    // 4. Conta sem senha ainda: o tempo do login é igual ao de e-mail inexistente (sobra da S4)
    const tP = [], tN = [];
    for (let i = 0; i < 6; i++) {
      sql(`delete from "TentativaLogin"`);
      tP.push((await post('/api/auth/login', { email: PEND, senha: 'Errada@1234567', modulo: 'empresarial' })).ms);
      tN.push((await post('/api/auth/login', { email: `ninguem-${suf}-${i}@x.com`, senha: 'Errada@1234567', modulo: 'empresarial' })).ms);
    }
    const razao = med(tP) / med(tN);
    ok('Login de conta recém-criada (sem senha) leva o mesmo tempo que e-mail inexistente', razao > 0.6 && razao < 1.6, `sem senha ${Math.round(med(tP))} ms, inexistente ${Math.round(med(tN))} ms`);
    const igual = (await post('/api/auth/login', { email: PEND, senha: 'Errada@1234567', modulo: 'empresarial' })).c.erro === 'E-mail ou senha incorretos.';
    ok('Conta sem senha responde a mensagem genérica de sempre', igual);
  } finally {
    sql(`delete from "Sessao" where "usuarioId" in ('u-reset-${suf}','u-pend-${suf}')`);
    sql(`delete from "PushInscricao" where "usuarioId" in ('u-reset-${suf}','u-pend-${suf}')`);
    sql(`delete from "Usuario" where id in ('u-reset-${suf}','u-pend-${suf}')`);
    sql(`delete from "TentativaLogin"`);
    await b.close();
    console.log(res.join('\n'));
  }
})();
