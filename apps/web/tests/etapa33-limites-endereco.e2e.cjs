// Teste de ponta a ponta da decisão #163 (Módulo 1, S8): limites por endereço sem contornos (cabeçalho forjado, IPv6 /64).
// Requer: site em http://localhost:3005 e Postgres de teste (5433) com seed.
// Uso: node apps/web/tests/etapa33-limites-endereco.e2e.cjs
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005', EXISTE = 'usuario@disparopro.com.br';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const S = 1 + Math.floor(Math.random() * 250), H = S.toString(16);
const post = async (xff, email = `ninguem-${Math.random()}@x.com`) => (await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': xff }, body: JSON.stringify({ email, senha: 'Errada@1234567', modulo: 'individual' }) })).status;
const bloqueados = (r) => r.filter((x) => x === 429).length;

(async () => {
  sql(`delete from "TentativaLogin"`);
  try {
    let r = []; for (let i = 0; i < 25; i++) r.push(await post(`203.0.${S}.9`));
    ok('Controle: o mesmo endereço, 25 pedidos: 5 bloqueados (limite de 20 por 10 minutos)', bloqueados(r) === 5, String(bloqueados(r)));

    r = []; for (let i = 0; i < 25; i++) r.push(await post(`10.9.${S}.${i + 1}, 203.1.${S}.9`));
    ok('Cabeçalho com várias entradas: vale a ÚLTIMA (a do proxy); a 1ª inventada não foge do limite (5 bloqueados)', bloqueados(r) === 5, String(bloqueados(r)));

    r = []; for (let i = 0; i < 25; i++) r.push(await post(`2001:db8:${H}:1::${(i + 1).toString(16)}`));
    ok('IPv6: 25 endereços diferentes do mesmo bloco /64 contam juntos (5 bloqueados)', bloqueados(r) === 5, String(bloqueados(r)));
    const outroBloco = await post(`2001:db8:${H}:2::1`);
    ok('IPv6: outro bloco /64 não é afetado', outroBloco !== 429, String(outroBloco));

    r = []; for (let i = 0; i < 12; i++) r.push(await post(`203.2.${S}.50`)); for (let i = 0; i < 13; i++) r.push(await post(`::ffff:203.2.${S}.50`));
    ok('IPv4 escrito em formato IPv6 (::ffff:a.b.c.d) conta junto com o IPv4 (5 bloqueados)', bloqueados(r) === 5, String(bloqueados(r)));

    // Logs: guardam o endereço real (última entrada), não o inventado
    sql(`update "Usuario" set "tentativasFalhas"=0,"bloqueadoAte"=null where email='${EXISTE}'`);
    sql(`delete from "Log" where quem like '%${EXISTE}%'`);
    await post(`9.9.9.9, 203.3.${S}.77`, EXISTE);
    await new Promise((x) => setTimeout(x, 800));
    const ipLog = sql(`select ip from "Log" where quem like '%${EXISTE}%' order by "criadoEm" desc limit 1`);
    ok('Logs guardam o endereço real (última entrada do cabeçalho), não o inventado', ipLog === `203.3.${S}.77`, ipLog);
  } finally {
    sql(`delete from "TentativaLogin"`);
    sql(`update "Usuario" set "tentativasFalhas"=0,"bloqueadoAte"=null where email='${EXISTE}'`);
    console.log(res.join('\n'));
  }
})();
