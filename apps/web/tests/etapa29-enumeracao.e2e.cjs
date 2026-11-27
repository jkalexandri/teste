// Teste de ponta a ponta da decisão #159 (Módulo 1, S4): não dá para descobrir quais e-mails têm conta.
// Requer: site em http://localhost:3005 e Postgres de teste (5433) com seed. Log do site em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa29-enumeracao.e2e.cjs
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

const EXISTE = 'usuario@disparopro.com.br', ADMIN_USER = 'ana@empresaexemplo.com.br';
const ERRADA = 'Errada@1234567';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const SORTE = 1 + Math.floor(Math.random() * 250); // endereços novos a cada rodada (o limite por endereço do site fica em memória)
let ipN = 0; const ip = () => `198.${SORTE}.${Math.floor(ipN / 200) % 250}.${(ipN++ % 200) + 20}`;
const post = async (rota, corpo, enderecoIp = ip()) => { const t = process.hrtime.bigint(); const r = await fetch(BASE + rota, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': enderecoIp }, body: JSON.stringify(corpo) }); const ms = Number(process.hrtime.bigint() - t) / 1e6; return { st: r.status, corpo: await r.json().catch(() => ({})), ms }; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const zera = () => { sql(`update "Usuario" set "tentativasFalhas"=0, "bloqueadoAte"=null where email='${EXISTE}'`); sql(`delete from "TentativaLogin"`); };
const unico = () => `ninguem-${Date.now()}-${ipN++}@teste-s4.com`;
const log = () => fs.readFileSync('/var/tmp/web.log', 'utf8');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const parecido = (a, b) => { const r = a / b; return r > 0.6 && r < 1.6; };

(async () => {
  zera(); sql(`update "Usuario" set "senhaTempHash"=null where email='${EXISTE}'`);
  try {
    // 1. Tempo do login com senha errada: existente x inexistente (rodadas alternadas)
    const tE = [], tN = [];
    for (let i = 0; i < 6; i++) {
      zera();
      tE.push((await post('/api/auth/login', { email: EXISTE, senha: ERRADA, modulo: 'individual' })).ms);
      tN.push((await post('/api/auth/login', { email: unico(), senha: ERRADA, modulo: 'individual' })).ms);
    }
    ok('Login: tempo igual para e-mail existente e inexistente', parecido(med(tE), med(tN)), `existente ${Math.round(med(tE))} ms, inexistente ${Math.round(med(tN))} ms`);

    // 1b. Conta com senha temporária pendente leva o mesmo tempo
    zera();
    const rec = await post('/api/auth/recuperar', { email: EXISTE });
    await esperar(2500);
    ok('Recuperar gerou o link de nova senha para a conta existente', sql(`select "linkSenhaHash" is not null from "Usuario" where email='${EXISTE}'`) === 't');
    darTemp(EXISTE); // conta com senha temporária pendente (conta nova): o tempo do login tem de ser o mesmo
    const tT = [];
    for (let i = 0; i < 6; i++) { zera(); tT.push((await post('/api/auth/login', { email: EXISTE, senha: ERRADA, modulo: 'individual' })).ms); }
    ok('Login: conta com senha temporária pendente leva o mesmo tempo', parecido(med(tT), med(tN)), `com temporária ${Math.round(med(tT))} ms, inexistente ${Math.round(med(tN))} ms`);
    sql(`update "Usuario" set "senhaTempHash"=null, "senhaTempExpiraEm"=null, "linkSenhaHash"=null, "linkSenhaExpiraEm"=null where email='${EXISTE}'`);

    // 2. Bloqueio por tentativas: mesmas mensagens para existente e inexistente
    zera();
    const fantasma = unico();
    const msgs = { e: [], n: [] };
    const ipBloqueio = ip(); // o bloqueio é por e-mail + endereço (decisão #160): as 7 tentativas saem do mesmo endereço
    for (let i = 0; i < 7; i++) {
      msgs.e.push((await post('/api/auth/login', { email: EXISTE, senha: ERRADA, modulo: 'individual' }, ipBloqueio)).corpo.erro);
      msgs.n.push((await post('/api/auth/login', { email: fantasma, senha: ERRADA, modulo: 'individual' }, ipBloqueio)).corpo.erro);
    }
    ok('Bloqueio: as 7 respostas são idênticas para e-mail existente e inexistente', JSON.stringify(msgs.e) === JSON.stringify(msgs.n), `5ª: "${msgs.e[4]}" | 6ª: "${msgs.e[5]}"`);
    ok('Bloqueio começa na 5ª tentativa (regra do dono: 5 erros, 15 minutos)', /bloqueado por 15 minutos/.test(msgs.n[4] || '') && /Tente novamente em 15 minutos/.test(msgs.n[5] || ''));
    ok('Antes da 5ª a resposta é a genérica', msgs.n.slice(0, 4).every((m) => m === 'E-mail ou senha incorretos.'));
    zera();

    // 3. Recuperar: resposta igual, tempo igual, e-mail só para quem existe
    const antes = (log().match(/definir-senha#t=/g) || []).length;
    const rE = [], rN = [];
    let corpoE, corpoN;
    for (let i = 0; i < 5; i++) {
      const a = await post('/api/auth/recuperar', { email: EXISTE }); rE.push(a.ms); corpoE = a;
      const b = await post('/api/auth/recuperar', { email: unico() }); rN.push(b.ms); corpoN = b;
    }
    ok('Recuperar: mesma resposta para e-mail existente e inexistente', corpoE.st === corpoN.st && JSON.stringify(corpoE.corpo) === JSON.stringify(corpoN.corpo), `${corpoE.st} ${JSON.stringify(corpoE.corpo)}`);
    ok('Recuperar: tempo igual (responde antes de trabalhar)', parecido(med(rE), med(rN)) || (med(rE) < 40 && med(rN) < 40), `existente ${Math.round(med(rE))} ms, inexistente ${Math.round(med(rN))} ms`);
    await esperar(3000);
    const depois = (log().match(/definir-senha#t=/g) || []).length;
    ok('Recuperar: e-mail com o link saiu só para a conta existente, e só 1 (intervalo de 10 minutos, decisão #160)', depois - antes === 1, `${depois - antes} e-mail para 10 pedidos (5 existentes)`);
    sql(`update "Usuario" set "senhaTempHash"=null, "senhaTempExpiraEm"=null, "linkSenhaHash"=null, "linkSenhaExpiraEm"=null where email='${EXISTE}'`);

    // 4. Login certo continua funcionando (senha definitiva) e com temporária
    const certo = await post('/api/auth/login', { email: EXISTE, senha: 'User@12345678', modulo: 'individual' });
    ok('Login com a senha certa continua entrando', certo.st === 200 && !!certo.corpo.destino, JSON.stringify(certo.corpo));

    // 5. Compra: respostas "e-mail já existe" têm limite próprio (5 por hora por endereço)
    const plano = sql(`select id from "Plano" where visivel and not gratis and not personalizado and "precoAtual">0 limit 1`);
    const meuIp = ip(); const sts = [];
    for (let i = 0; i < 7; i++) sts.push((await post('/api/pedidos', { planoId: plano, nome: 'Fulano de Tal', email: ADMIN_USER, whatsapp: '11999990000', empresaNome: 'Empresa Teste', quantidade: 1 }, meuIp)).st);
    ok('Pedidos: 5 respostas "já existe" e depois 429 no mesmo endereço', sts.slice(0, 5).every((s) => s === 409) && sts[5] === 429 && sts[6] === 429, sts.join(','));
    const outro = (await post('/api/pedidos', { planoId: plano, nome: 'Fulano de Tal', email: ADMIN_USER, whatsapp: '11999990000', empresaNome: 'Empresa Teste', quantidade: 1 }, ip())).st;
    ok('Pedidos: outro endereço não é afetado', outro === 409, String(outro));
    const novo = (await post('/api/pedidos', { planoId: plano, nome: 'Fulano de Tal', email: unico(), whatsapp: '11999990000', empresaNome: 'Empresa Teste', quantidade: 1 }, meuIp)).st;
    ok('Pedidos: e-mail novo no endereço limitado ainda compra (o limite só conta as respostas "já existe")', novo === 200, String(novo));

    // 6. Teste grátis
    const gratis = sql(`select id from "Plano" where gratis and visivel limit 1`);
    if (gratis) {
      const ip2 = ip(); const s2 = [];
      for (let i = 0; i < 7; i++) s2.push((await post('/api/teste-gratis', { planoId: gratis, nome: 'Fulano de Tal', email: ADMIN_USER, whatsapp: '11999990000' }, ip2)).st);
      ok('Teste grátis: já tinha limite de 3 por hora por endereço (mais apertado que o dos pedidos): 3 respostas "já existe" e depois 429', s2.slice(0, 3).every((s) => s === 409) && s2.slice(3).every((s) => s === 429), s2.join(','));
    } else ok('Teste grátis: não verificado (sem plano grátis no banco de teste)', true);
  } finally {
    zera();
    sql(`update "Usuario" set "senhaTempHash"=null, "senhaTempExpiraEm"=null, "linkSenhaHash"=null, "linkSenhaExpiraEm"=null where email='${EXISTE}'`);
    sql(`delete from "Pedido" where email like 'ninguem-%@teste-s4.com'`);
    console.log(res.join('\n'));
  }
})();
