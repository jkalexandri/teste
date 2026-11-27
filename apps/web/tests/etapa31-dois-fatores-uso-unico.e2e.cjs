// Teste de ponta a ponta da decisão #161 (Módulo 1, S6): código do app autenticador de uso único e verificação sem furos.
// Requer: site em http://localhost:3005 e Postgres de teste (5433) com seed. Log do site em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa31-dois-fatores-uso-unico.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005', SA = 'superadmin@disparopro.com.br', SENHA = 'Super@12345678';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const log = () => fs.readFileSync('/var/tmp/web.log', 'utf8');
function totp(b32, quando = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = [];
  for (const c of b32.replace(/\s/g, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(quando / 30000)));
  const h = crypto.createHmac('sha1', Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
const SORTE = 1 + Math.floor(Math.random() * 250); let n = 0;
const ip = () => `198.${SORTE}.${Math.floor(n / 200) % 250}.${(n++ % 200) + 20}`;
async function loginSA() { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() }, body: JSON.stringify({ email: SA, senha: SENHA, modulo: 'individual' }) }); return (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('filapro_sessao=')); }
async function verificar(ck, codigo, recuperacao = false) { const r = await fetch(BASE + '/api/auth/verificar', { method: 'POST', headers: { 'content-type': 'application/json', cookie: ck, 'x-forwarded-for': ip() }, body: JSON.stringify({ codigo, recuperacao }) }); return { st: r.status, c: await r.json().catch(() => ({})) }; }
const passoAgora = () => Math.floor(Date.now() / 30000);
// Código de um passo ainda não usado; espera o próximo se precisar (janela aceita: passo atual ±1)
let ultimo = 0;
async function codigoNovo(seg) { for (;;) { const a = passoAgora(), alvo = Math.max(a, ultimo + 1); if (alvo <= a + 1) { ultimo = alvo; return { codigo: totp(seg, alvo * 30000 + 1000), passo: alvo }; } await esp(1000); } }

(async () => {
  const OUT = process.argv[2] || '/tmp';
  sql(`delete from "TentativaLogin"`);
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('dialog', (d) => d.accept());
  let segredo, codigos;
  try {
    // Ativação pela tela Segurança (o código de ativação também vale uma vez)
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Entrar como Super Admin'); await p.waitForURL('**/dashboard');
    await p.goto(BASE + '/seguranca'); await esp(600); await p.click('button:has-text("Ativar")'); await esp(1200);
    segredo = (await p.locator('[data-testid=segredo-2fa]').innerText()).replace(/\s/g, '');
    const a = await codigoNovo(segredo);
    await p.fill('[aria-label="Código de 6 dígitos"]', a.codigo); await p.click('button:has-text("Confirmar e ativar")'); await esp(1500);
    codigos = await p.locator('[data-testid=codigos-recuperacao] span').allInnerTexts();
    ok('Ativação pela tela Segurança continua funcionando', sql(`select "doisFatoresAtivo" from "Usuario" where email='${SA}'`) === 't' && codigos.length === 10);
    ok('A ativação já gravou o intervalo usado', Number(sql(`select "doisFatoresUltimoPasso" from "Usuario" where email='${SA}'`)) === a.passo);
    await p.screenshot({ path: OUT + '/seguranca-ativada.png' });

    // 1. Mesmo código na entrada logo depois da ativação: recusado
    let ck = await loginSA(); let r = await verificar(ck, a.codigo);
    ok('O código usado na ativação NÃO entra de novo', r.st === 401, JSON.stringify(r.c));

    // 2. Cada código vale uma vez
    const c1 = await codigoNovo(segredo);
    ck = await loginSA(); r = await verificar(ck, c1.codigo);
    ok('Código novo entra', r.st === 200 && r.c.destino === '/dashboard', JSON.stringify(r.c));
    ck = await loginSA(); r = await verificar(ck, c1.codigo);
    ok('O MESMO código não entra de novo (outra entrada)', r.st === 401, JSON.stringify(r.c));
    ok('Reuso recusado fica nos Logs', Number(sql(`select count(*) from "Log" where texto='Código de verificação reutilizado recusado'`)) >= 1);
    // Código de um intervalo mais antigo que o último aceito também é recusado
    ck = await loginSA(); r = await verificar(ck, totp(segredo, (c1.passo - 1) * 30000 + 1000));
    ok('Código de um intervalo anterior ao último aceito é recusado', r.st === 401);
    // O próximo código entra
    const c2 = await codigoNovo(segredo);
    ck = await loginSA(); r = await verificar(ck, c2.codigo);
    ok('O código do intervalo seguinte entra', r.st === 200, JSON.stringify(r.c));

    // 3. Pedidos simultâneos com o mesmo código aceitam só 1
    const c3 = await codigoNovo(segredo);
    const sess = await Promise.all(Array.from({ length: 6 }, () => loginSA()));
    const rs = await Promise.all(sess.map((s) => verificar(s, c3.codigo)));
    ok('6 entradas simultâneas com o mesmo código: só 1 é aceita', rs.filter((x) => x.st === 200).length === 1, `${rs.filter((x) => x.st === 200).length} aceitas`);

    // 4. Código de recuperação: uso único mesmo simultâneo
    const antes = Number(sql(`select cardinality("doisFatoresCodigos") from "Usuario" where email='${SA}'`));
    const sess2 = await Promise.all(Array.from({ length: 6 }, () => loginSA()));
    const rr = await Promise.all(sess2.map((s) => verificar(s, codigos[3], true)));
    const depois = Number(sql(`select cardinality("doisFatoresCodigos") from "Usuario" where email='${SA}'`));
    ok('6 usos simultâneos do mesmo código de recuperação: só 1 é aceito', rr.filter((x) => x.st === 200).length === 1 && depois === antes - 1, `${rr.filter((x) => x.st === 200).length} aceitos; lista ${antes} -> ${depois}`);
    ck = await loginSA(); r = await verificar(ck, codigos[3], true);
    ok('O código de recuperação gasto não entra depois', r.st === 401);

    // 5. 10 códigos errados (somando entradas) congelam o código de 6 dígitos; a recuperação continua valendo; alerta ao Super Admin
    sql(`delete from "TentativaLogin"`);
    const logAntes = log().length;
    for (let i = 0; i < 2; i++) { const l = await loginSA(); for (let k = 0; k < 5; k++) await verificar(l, '000000'); }
    const bom = await codigoNovo(segredo);
    ck = await loginSA(); r = await verificar(ck, bom.codigo);
    ok('Depois de 10 códigos errados, nem o código certo de 6 dígitos entra (congelado 15 minutos)', r.st === 401 && /bloqueada por 15 minutos/.test(r.c.erro || ''), r.c.erro);
    ck = await loginSA(); r = await verificar(ck, codigos[5], true);
    ok('Mas o código de recuperação entra (o Super Admin nunca fica sem saída)', r.st === 200, JSON.stringify(r.c));
    await esp(1500);
    ok('O Super Admin foi alertado (WhatsApp/celular)', /Alerta de segurança: 10 códigos errados da verificação em duas etapas/.test(log().slice(logAntes)));
    ok('Bloqueio aparece nos Logs', Number(sql(`select count(*) from "Log" where texto like 'Verificação por código bloqueada%'`)) >= 1);

    // 6. Passou o congelamento: o código volta a valer e os erros zeram quando acerta
    sql(`delete from "TentativaLogin"`);
    const c4 = await codigoNovo(segredo);
    ck = await loginSA(); r = await verificar(ck, c4.codigo);
    ok('Sem o congelamento, o código novo volta a entrar', r.st === 200, JSON.stringify(r.c));
    ok('Acertar zera a contagem de erros', Number(sql(`select count(*) from "TentativaLogin" where chave like 'dois:%'`)) === 0);

    // 7. Desativar pede um código novo (e também não aceita reuso)
    await p.goto(BASE + '/seguranca'); await esp(800);
    // (o Super Admin da tela já está logado: usa um código novo)
    const c5 = await codigoNovo(segredo);
    await p.fill('[aria-label="Código de 6 dígitos"]', c5.codigo); await p.click('button:has-text("Desativar")'); await esp(1500);
    ok('Desativar com código novo funciona e zera o controle de intervalo', sql(`select "doisFatoresAtivo" from "Usuario" where email='${SA}'`) === 'f' && sql(`select "doisFatoresUltimoPasso" is null from "Usuario" where email='${SA}'`) === 't');
  } finally {
    sql(`update "Usuario" set "doisFatoresAtivo"=false, "doisFatoresSegredo"=null, "doisFatoresCodigos"='{}', "doisFatoresUltimoPasso"=null where email='${SA}'`);
    sql(`delete from "TentativaLogin"`);
    await b.close();
    console.log(res.join('\n'));
  }
})();
