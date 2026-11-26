// Teste de ponta a ponta da decisão #158 (Módulo 1, S2a e S2b): conta inativa/vencida/bloqueada.
// Requer: site em http://localhost:3005 (CRON_SECRET=segredo-teste) e Postgres de teste (5433) com seed.
// Uso: node apps/web/tests/etapa28-conta-sem-acesso.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const EMAIL = 'ana@empresaexemplo.com.br', SENHA = 'User@12345678', EMP = 'teste-empresa-exemplo';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const sessoesDaAna = () => Number(sql(`select count(*) from "Sessao" s join "Usuario" u on u.id=s."usuarioId" where u.email='${EMAIL}'`));
const CODIGO = sql(`select codigo from "Empresa" where id='${EMP}'`);
const pushDaAna = () => Number(sql(`select count(*) from "PushInscricao" p join "Usuario" u on u.id=p."usuarioId" where u.email='${EMAIL}'`));

async function entrar() {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, senha: SENHA, modulo: 'empresarial' }) });
  const ck = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('filapro_sessao='));
  return ck;
}
const chamar = async (ck, metodo, rota, corpo) => (await fetch(BASE + rota, { method: metodo, headers: { cookie: ck, 'content-type': 'application/json' }, ...(metodo === 'GET' ? {} : { body: corpo ? JSON.stringify(corpo) : '{}' }) })).status;
const rotas = (ck) => Promise.all([chamar(ck, 'POST', '/api/presenca'), chamar(ck, 'GET', '/api/suporte'), chamar(ck, 'POST', '/api/push', { endpoint: 'https://exemplo.test/x', keys: { p256dh: 'a', auth: 'b' } })]);

(async () => {
  const OUT = process.argv[2] || '/tmp';
  sql(`update "Empresa" set ativa=true, "expiraEm"=now()+interval '26 day' where id='${EMP}'`);
  sql(`update "Usuario" set status='ATIVO' where email='${EMAIL}'`);
  sql(`delete from "PushInscricao" where endpoint like 'https://exemplo.test/%'`);
  try {
    // 1. Conta normal: as três rotas respondem
    let ck = await entrar();
    let [a, b, c] = await rotas(ck);
    ok('Conta normal: presença, suporte e notificações respondem 200', a === 200 && b === 200 && c === 200, `${a},${b},${c}`);
    sql(`delete from "PushInscricao" where endpoint='https://exemplo.test/x'`);

    // 2. Barrada sem apagar sessão (simula o estado antigo): as rotas dão 403
    for (const [nome, ligar, desligar] of [
      ['empresa inativa', `update "Empresa" set ativa=false where id='${EMP}'`, `update "Empresa" set ativa=true where id='${EMP}'`],
      ['plano vencido', `update "Empresa" set "expiraEm"=now()-interval '1 day' where id='${EMP}'`, `update "Empresa" set "expiraEm"=now()+interval '26 day' where id='${EMP}'`],
      ['usuário bloqueado', `update "Usuario" set status='BLOQUEADO' where email='${EMAIL}'`, `update "Usuario" set status='ATIVO' where email='${EMAIL}'`],
    ]) {
      sql(ligar);
      [a, b, c] = await rotas(ck);
      ok(`Conta barrada (${nome}): presença, suporte e notificações dão 403`, a === 403 && b === 403 && c === 403, `${a},${b},${c}`);
      ok(`Conta barrada (${nome}): nenhum aparelho foi cadastrado`, Number(sql(`select count(*) from "PushInscricao" where endpoint='https://exemplo.test/x'`)) === 0);
      sql(desligar);
    }

    // 3. Super Admin inativa a empresa pela tela: sessões e notificações da conta são apagadas
    ck = await entrar();
    sql(`insert into "PushInscricao" (id,"usuarioId",endpoint,p256dh,auth) select 'pushtest28', id, 'https://exemplo.test/ana', 'a', 'b' from "Usuario" where email='${EMAIL}' on conflict do nothing`);
    ok('Antes: a conta tem sessão e aparelho de notificação', sessoesDaAna() >= 1 && pushDaAna() >= 1);
    const b1 = await chromium.launch();
    const p = await (await b1.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    p.on('dialog', (d) => d.accept());
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Entrar como Super Admin'); await p.waitForURL('**/dashboard');
    await p.goto(BASE + '/empresas', { waitUntil: 'networkidle' });
    const cartaoCom = (botao) => p.locator(`b:has-text("${CODIGO} • Empresa Exemplo")`).locator(`xpath=ancestor::*[.//button[normalize-space()='${botao}']][1]`);
    await cartaoCom('Inativar empresa').locator("button:text-is('Inativar empresa')").click(); await p.waitForTimeout(1800);
    ok('Empresa ficou inativa', sql(`select ativa from "Empresa" where id='${EMP}'`) === 'f');
    ok('Inativar apagou as sessões da conta', sessoesDaAna() === 0, String(sessoesDaAna()));
    ok('Inativar apagou os aparelhos de notificação da conta', pushDaAna() === 0, String(pushDaAna()));
    await p.screenshot({ path: OUT + '/empresa-inativada.png' });
    // Reativa: a sessão antiga NÃO volta
    await cartaoCom('Ativar empresa').locator("button:text-is('Ativar empresa')").click(); await p.waitForTimeout(1800);
    ok('Empresa reativada', sql(`select ativa from "Empresa" where id='${EMP}'`) === 't');
    const antigo = await chamar(ck, 'POST', '/api/presenca');
    ok('Sessão antiga não ressuscita ao reativar', antigo === 401, String(antigo));
    await b1.close();

    // 4. Limpeza de sessões vencidas pela rotina de 5 minutos
    sql(`insert into "Sessao" (id,"tokenHash","usuarioId","expiraEm","precisaTrocar","pendente2fa","tentativas2fa","criadoEm") select 'sessvelha28','hashvelho28',id, now()-interval '3 day', false,false,0, now()-interval '4 day' from "Usuario" where email='${EMAIL}' on conflict do nothing`);
    sql(`insert into "Sessao" (id,"tokenHash","usuarioId","expiraEm","precisaTrocar","pendente2fa","tentativas2fa","criadoEm") select 'sessnova28','hashnovo28',id, now()+interval '5 hour', false,false,0, now() from "Usuario" where email='${EMAIL}' on conflict do nothing`);
    const semSegredo = (await fetch(BASE + '/api/cron/servico')).status;
    ok('Rotina sem segredo: 401', semSegredo === 401);
    const cr = await fetch(BASE + '/api/cron/servico', { headers: { authorization: 'Bearer segredo-teste' } });
    const corpo = await cr.json();
    ok('Rotina responde e informa as sessões limpas', cr.status === 200 && corpo.sessoesLimpas >= 1, JSON.stringify(corpo).slice(0, 120));
    ok('Sessão vencida há 3 dias foi apagada', Number(sql(`select count(*) from "Sessao" where id='sessvelha28'`)) === 0);
    ok('Sessão ainda válida foi mantida', Number(sql(`select count(*) from "Sessao" where id='sessnova28'`)) === 1);
  } finally {
    sql(`delete from "Sessao" where id in ('sessvelha28','sessnova28')`);
    sql(`delete from "PushInscricao" where endpoint like 'https://exemplo.test/%'`);
    sql(`update "Empresa" set ativa=true, "expiraEm"=now()+interval '26 day' where id='${EMP}'`);
    sql(`update "Usuario" set status='ATIVO' where email='${EMAIL}'`);
    console.log(res.join('\n'));
  }
})();
