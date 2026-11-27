// Teste de ponta a ponta da decisão #164 (Módulo 1, S9 — Fase 1): recuperação de senha por link de uso único.
// Requer: site em http://localhost:3005 e Postgres de teste (5433) com seed. Log do site em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa34-link-senha.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005', U = 'usuario@disparopro.com.br', SA = 'superadmin@disparopro.com.br';
const SENHA_U = 'User@12345678', SENHA_SA = 'Super@12345678', NOVA = 'NovaSenhaLink@2026x';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2] || '/tmp';
const esp = (ms) => new Promise((r) => setTimeout(r, ms));
const log = () => fs.readFileSync('/var/tmp/web.log', 'utf8');
const SORTE = 1 + Math.floor(Math.random() * 250); let n = 0;
const ip = () => `198.${SORTE}.9.${(n++ % 200) + 20}`;
const post = async (rota, corpo) => { const r = await fetch(BASE + rota, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() }, body: JSON.stringify(corpo) }); return { st: r.status, c: await r.json().catch(() => ({})), r }; };
const limpaCooldown = () => sql(`delete from "TentativaLogin" where chave like 'recint:%' or chave like 'rec:%'`);
/** Pede a recuperação e devolve o código do link que saiu no e-mail (lido do log de desenvolvimento). */
async function pedirLink(email) {
  limpaCooldown(); const antes = log().length;
  await post('/api/auth/recuperar', { email }); await esp(2500);
  const novo = log().slice(antes);
  const m = /definir-senha#t=([A-Za-z0-9_-]{43})/.exec(novo);
  return { token: m && m[1], email: novo };
}
function totp(b32, quando = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = 0, v = 0; const out = [];
  for (const c of b32.replace(/\s/g, '')) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(quando / 30000)));
  const h = crypto.createHmac('sha1', Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
const entrar = (email, senha) => post('/api/auth/login', { email, senha, modulo: 'individual' });
const restaurar = () => { sql(`update "Usuario" u set "senhaHash"=a."senhaHash" from "Usuario" a where a.email='ana@empresaexemplo.com.br' and u.email='${U}'`); sql(`update "Usuario" set "linkSenhaHash"=null,"linkSenhaExpiraEm"=null,"senhaTempHash"=null,"senhaTempExpiraEm"=null,"bloqueadoAte"=null,"tentativasFalhas"=0,"doisFatoresAtivo"=false,"doisFatoresSegredo"=null,"doisFatoresCodigos"='{}',"doisFatoresUltimoPasso"=null where email in ('${U}','${SA}')`); sql(`delete from "TentativaLogin"`); };

(async () => {
  restaurar();
  const b = await chromium.launch();
  try {
    // 1. E-mail com link, sem senha; só o hash fica no banco
    const A = await pedirLink(U);
    ok('O e-mail traz o link de uso único', !!A.token);
    ok('O e-mail NÃO traz senha temporária', !/Senha temporária|senha temporária do FilaPro Leads é/.test(A.email));
    const linha = sql(`select "linkSenhaHash" is not null, "linkSenhaHash" <> '${A.token}', extract(epoch from ("linkSenhaExpiraEm" - now()))/60 from "Usuario" where email='${U}'`).split('|');
    ok('No banco fica só o hash do código, com validade de ~30 minutos', linha[0] === 't' && linha[1] === 't' && Number(linha[2]) > 28 && Number(linha[2]) <= 30.5, `${Math.round(Number(linha[2]))} min`);

    // 2. Um link novo anula o anterior
    const B = await pedirLink(U);
    const velho = await post('/api/auth/definir-senha', { token: A.token, senha: NOVA });
    ok('Um link novo anula o anterior', B.token && B.token !== A.token && velho.st === 400, JSON.stringify(velho.c));
    const tk = B.token;

    // 3. Tela pública: abre sem login, tira o código da barra de endereços e NÃO gasta o link
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage();
    await p.goto(`${BASE}/definir-senha#t=${tk}`, { waitUntil: 'networkidle' }); await esp(600);
    ok('A tela abre sem login e mostra o formulário', (await p.locator('#nova-senha').count()) === 1 && !p.url().includes('/login'));
    ok('O código sai da barra de endereços', !p.url().includes(tk) && !p.url().includes('#t='), p.url());
    ok('Abrir a página não gasta o link', sql(`select "linkSenhaHash" is not null from "Usuario" where email='${U}'`) === 't');
    await p.screenshot({ path: OUT + '/definir-senha.png' });
    const p2 = await ctx.newPage(); await p2.goto(`${BASE}/definir-senha`, { waitUntil: 'networkidle' }); await esp(400);
    ok('Sem o código no endereço mostra "Link inválido"', (await p2.locator('[data-testid=sem-link]').count()) === 1);

    // 4. Link inválido/expirado: mesma mensagem; senha fraca não gasta o link
    const mal = await post('/api/auth/definir-senha', { token: 'x'.repeat(43), senha: NOVA });
    const curto = await post('/api/auth/definir-senha', { token: 'abc', senha: NOVA });
    ok('Link inventado e link malformado dão a mesma mensagem', mal.st === 400 && curto.st === 400 && mal.c.erro === curto.c.erro, mal.c.erro);
    const fraca = await post('/api/auth/definir-senha', { token: tk, senha: 'fraca' });
    ok('Senha fraca é recusada SEM gastar o link', fraca.st === 400 && /requisitos/.test(fraca.c.erro) && sql(`select "linkSenhaHash" is not null from "Usuario" where email='${U}'`) === 't');
    sql(`update "Usuario" set "linkSenhaExpiraEm"=now()-interval '1 minute' where email='${U}'`);
    const exp = await post('/api/auth/definir-senha', { token: tk, senha: NOVA });
    ok('Link expirado: mesma mensagem do link inventado', exp.st === 400 && exp.c.erro === mal.c.erro);
    sql(`update "Usuario" set "linkSenhaExpiraEm"=now()+interval '20 minutes' where email='${U}'`);

    // 5. Prepara sessões e bloqueios que o link precisa desfazer
    const s1 = await entrar(U, SENHA_U); const s2 = await entrar(U, SENHA_U);
    sql(`insert into "TentativaLogin" (chave,falhas,desde,"bloqueadoAte","atualizadoEm") values ('par:${U}|1.2.3.4',0,now(),now()+interval '10 minutes',now()),('conta:${U}',0,now(),now()+interval '10 minutes',now()) on conflict do nothing`);
    const sessoesAntes = Number(sql(`select count(*) from "Sessao" s join "Usuario" u on u.id=s."usuarioId" where u.email='${U}'`));
    const emailsAntes = (log().match(/Assunto: Sua senha foi alterada/g) || []).length;

    // 6. Uso simultâneo do mesmo link: só 1 passa
    const rs = await Promise.all(Array.from({ length: 6 }, () => post('/api/auth/definir-senha', { token: tk, senha: NOVA })));
    ok('6 usos simultâneos do mesmo link: só 1 é aceito', rs.filter((x) => x.st === 200).length === 1, `${rs.filter((x) => x.st === 200).length} aceitos`);
    const de = await post('/api/auth/definir-senha', { token: tk, senha: NOVA });
    ok('O link gasto não vale de novo', de.st === 400);
    await esp(1500);

    // 7. Efeitos: sessões, bloqueios, senha, e-mail de aviso, Logs
    ok('As sessões antigas foram encerradas', sessoesAntes >= 2 && Number(sql(`select count(*) from "Sessao" s join "Usuario" u on u.id=s."usuarioId" where u.email='${U}'`)) === 0, `${sessoesAntes} -> 0`);
    ok('Os bloqueios por tentativas da conta foram desfeitos', Number(sql(`select count(*) from "TentativaLogin" where chave like 'par:${U}|%' or chave='conta:${U}'`)) === 0);
    const velhaSenha = await entrar(U, SENHA_U); const novaSenha = await entrar(U, NOVA);
    ok('A senha antiga deixou de valer e a nova entra no sistema', velhaSenha.st === 401 && novaSenha.st === 200 && novaSenha.c.destino === '/dashboard', `${velhaSenha.st}/${novaSenha.st}`);
    ok('Saiu o e-mail "Sua senha foi alterada"', (log().match(/Assunto: Sua senha foi alterada/g) || []).length === emailsAntes + 1);
    ok('A troca ficou nos Logs', Number(sql(`select count(*) from "Log" where texto like 'Senha definida pelo link de recuperação%' and quem like '%${U}%'`)) >= 1);
    ok('O link não entra sozinho no sistema (não cria sessão ao definir a senha)', Number(sql(`select count(*) from "Sessao" s join "Usuario" u on u.id=s."usuarioId" where u.email='${U}' and s."criadoEm" < now() - interval '1 second'`)) === 0);

    // 8. Pedido de e-mail inexistente: mesma resposta e nenhum e-mail com link (S4)
    limpaCooldown(); const antesLog = log().length;
    const inex = await post('/api/auth/recuperar', { email: `ninguem-${Date.now()}@teste-s9.com` }); await esp(1500);
    ok('E-mail sem conta: mesma resposta e nenhum link enviado', inex.st === 200 && JSON.stringify(inex.c) === '{"ok":true}' && !/definir-senha#t=/.test(log().slice(antesLog)));

    // 9. Super Admin com 2FA: o link não contorna o código da verificação
    const pa = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await pa.goto(BASE + '/login', { waitUntil: 'networkidle' }); await pa.click('text=Entrar como Super Admin'); await pa.waitForURL('**/dashboard');
    await pa.goto(BASE + '/seguranca'); await esp(600); await pa.click('button:has-text("Ativar")'); await esp(1200);
    const seg = (await pa.locator('[data-testid=segredo-2fa]').innerText()).replace(/\s/g, '');
    await pa.fill('[aria-label="Código de 6 dígitos"]', totp(seg)); await pa.click('button:has-text("Confirmar e ativar")'); await esp(1500);
    ok('2FA do Super Admin ativado para o teste', sql(`select "doisFatoresAtivo" from "Usuario" where email='${SA}'`) === 't');
    const L = await pedirLink(SA);
    const def = await post('/api/auth/definir-senha', { token: L.token, senha: NOVA });
    const ent = await entrar(SA, NOVA);
    ok('Super Admin: redefinir a senha pelo link NÃO dispensa a verificação em duas etapas', def.st === 200 && ent.st === 200 && ent.c.destino === '/verificacao', JSON.stringify(ent.c));
    // volta a senha original do Super Admin pelo mesmo caminho
    const L2 = await pedirLink(SA); await post('/api/auth/definir-senha', { token: L2.token, senha: SENHA_SA });
  } finally {
    restaurar();
    await b.close();
    console.log(res.join('\n'));
  }
})();
