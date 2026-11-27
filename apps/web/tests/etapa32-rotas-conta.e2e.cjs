// Teste de ponta a ponta da decisão #162 (Módulo 1, S3): as rotas da API seguem a mesma regra das telas
// (sessão válida, sem primeiro acesso pendente, conta com acesso). Requer: site em http://localhost:3005 e Postgres de teste com seed.
// Uso: node apps/web/tests/etapa32-rotas-conta.e2e.cjs
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005', EMP = 'teste-empresa-exemplo';
const USER = 'ana@empresaexemplo.com.br', SA = 'superadmin@disparopro.com.br';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const SORTE = 1 + Math.floor(Math.random() * 250); let n = 0; const ip = () => `198.${SORTE}.7.${(n++ % 200) + 20}`;
async function entrar(email, senha, modulo) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() }, body: JSON.stringify({ email, senha, modulo }) });
  return (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('filapro_sessao='));
}
const chamar = async (ck, metodo, rota) => (await fetch(BASE + rota, { method: metodo, headers: { cookie: ck, 'content-type': 'application/json' }, ...(metodo === 'GET' ? {} : { body: '{}' }) })).status;
const ROTAS_USUARIO = [['GET', '/api/arquivos/x'], ['GET', '/api/suporte/arquivo/x'], ['POST', '/api/comunicados/x'], ['GET', '/api/ajuda/prints/a.png']];
const ROTAS_SA = [['GET', '/api/relatorios/x'], ['GET', '/api/financeiro/relatorios/x'], ['GET', '/api/financeiro/comprovante/x'], ['GET', '/api/logos/x.png']];
const todas = async (ck, rotas) => Promise.all(rotas.map(([m, r]) => chamar(ck, m, r)));
const ESPERADO_NORMAL = [404, 404, 200, 404];

(async () => {
  sql(`delete from "TentativaLogin"`);
  const restaurar = () => { sql(`update "Empresa" set ativa=true, "expiraEm"=now()+interval '26 day' where id='${EMP}'`); sql(`update "Usuario" set status='ATIVO' where email in ('${USER}','${SA}')`); sql(`update "Sessao" set "precisaTrocar"=false`); };
  restaurar();
  try {
    // 1. Usuário: conta normal passa pela sessão (cada rota responde o que respondia: não encontrado / ok)
    const ck = await entrar(USER, 'User@12345678', 'empresarial');
    let s = await todas(ck, ROTAS_USUARIO);
    ok('Conta normal: as 4 rotas passam da sessão (404, 404, 200, 404)', JSON.stringify(s) === JSON.stringify(ESPERADO_NORMAL), s.join(','));
    const semLogin = await Promise.all(ROTAS_USUARIO.map(([m, r]) => fetch(BASE + r, { method: m, headers: { 'content-type': 'application/json' }, ...(m === 'GET' ? {} : { body: '{}' }) }).then((x) => x.status)));
    ok('Sem sessão: as 4 rotas recusam (401/403)', semLogin.every((c) => c === 401 || c === 403), semLogin.join(','));

    // 2. Conta barrada: as 4 rotas recusam (403; comunicados responde 401)
    const casos = [
      ['empresa inativa', `update "Empresa" set ativa=false where id='${EMP}'`],
      ['plano vencido', `update "Empresa" set "expiraEm"=now()-interval '1 day' where id='${EMP}'`],
      ['usuário bloqueado', `update "Usuario" set status='BLOQUEADO' where email='${USER}'`],
      ['sessão em primeiro acesso', `update "Sessao" set "precisaTrocar"=true where "usuarioId" in (select id from "Usuario" where email='${USER}')`],
    ];
    for (const [nome, cmd] of casos) {
      sql(cmd);
      s = await todas(ck, ROTAS_USUARIO);
      ok(`${nome}: as 4 rotas recusam`, s.every((c) => c === 401 || c === 403), s.join(','));
      restaurar();
    }

    // 3. Super Admin: normal passa; bloqueado recusa (defesa em profundidade)
    const cs = await entrar(SA, 'Super@12345678', 'individual');
    s = await todas(cs, ROTAS_SA);
    ok('Super Admin normal: as 4 rotas dele passam da sessão (não dão 403)', s.every((c) => c !== 401 && c !== 403), s.join(','));
    sql(`update "Usuario" set status='BLOQUEADO' where email='${SA}'`);
    s = await todas(cs, ROTAS_SA);
    ok('Super Admin bloqueado: as 4 rotas dele recusam (403)', s.every((c) => c === 403), s.join(','));
    restaurar();
    sql(`update "Sessao" set "precisaTrocar"=true where "usuarioId" in (select id from "Usuario" where email='${SA}')`);
    s = await todas(cs, ROTAS_SA);
    ok('Super Admin em primeiro acesso: as 4 rotas dele recusam (403)', s.every((c) => c === 403), s.join(','));
    restaurar();

    // 4. Usuário comum não entra nas rotas do Super Admin (continua igual)
    s = await todas(ck, ROTAS_SA);
    ok('Usuário comum continua sem acesso às rotas do Super Admin (403)', s.every((c) => c === 403), s.join(','));
  } finally {
    restaurar();
    sql(`delete from "Sessao" where "usuarioId" in (select id from "Usuario" where email in ('${USER}','${SA}'))`);
    sql(`delete from "TentativaLogin"`);
    console.log(res.join('\n'));
  }
})();
