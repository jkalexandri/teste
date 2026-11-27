// Teste de ponta a ponta da decisão #160 (Módulo 1, S5): ninguém tranca a conta de outra pessoa nem lota a caixa de e-mail dela.
// Requer: site em http://localhost:3005 (CRON_SECRET=segredo-teste) e Postgres de teste (5433) com seed. Log do site em /var/tmp/web.log.
// Uso: node apps/web/tests/etapa30-bloqueio-conta.e2e.cjs
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const VIT = 'usuario@disparopro.com.br', OK = 'User@12345678', ERR = 'Errada@1234567';
const SA = 'superadmin@disparopro.com.br', SA_OK = 'Super@12345678';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
let ipN = 0; const ip = () => `192.0.2.${(ipN++ % 230) + 10}`;
const post = async (rota, corpo, enderecoIp) => { const r = await fetch(BASE + rota, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': enderecoIp || ip() }, body: JSON.stringify(corpo) }); return { st: r.status, c: await r.json().catch(() => ({})) }; };
const entrar = (email, senha, enderecoIp, modulo = 'individual') => post('/api/auth/login', { email, senha, modulo }, enderecoIp);
const log = () => fs.readFileSync('/var/tmp/web.log', 'utf8');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const limpa = () => { sql(`delete from "TentativaLogin"`); sql(`update "Usuario" set "bloqueadoAte"=null,"tentativasFalhas"=0,"senhaTempHash"=null,"senhaTempExpiraEm"=null where email in ('${VIT}','${SA}')`); };
const emailsProtecao = () => (log().match(/Assunto: Muitas tentativas de entrar na sua conta/g) || []).length;

(async () => {
  limpa();
  try {
    // 1. Bloqueio por e-mail + endereço: o atacante não tranca a vítima
    const SORTE = 20 + Math.floor(Math.random() * 200); // endereços novos a cada rodada (o limite por endereço do site fica em memória)
    const A = `203.0.113.${SORTE}`, B = `203.0.114.${SORTE}`;
    const msgs = [];
    for (let i = 0; i < 6; i++) msgs.push((await entrar(VIT, ERR, A)).c.erro);
    ok('Atacante: a 5ª senha errada bloqueia o endereço dele (mensagem de sempre)', /bloqueado por 15 minutos/.test(msgs[4]) && /Tente novamente em 15 minutos/.test(msgs[5]), msgs[4]);
    const dele = await entrar(VIT, OK, A);
    ok('Atacante bloqueado: nem a senha certa entra a partir do endereço bloqueado', dele.st === 401 && /Tente novamente/.test(dele.c.erro || ''), JSON.stringify(dele.c));
    const vitima = await entrar(VIT, OK, B);
    ok('VÍTIMA entra normalmente de outro endereço, com a senha certa', vitima.st === 200 && !!vitima.c.destino, JSON.stringify(vitima.c));
    // Super Admin
    limpa();
    for (let i = 0; i < 5; i++) await entrar(SA, ERR, A);
    const sa = await entrar(SA, SA_OK, B, 'individual');
    ok('Super Admin: atacante bloqueado, Super Admin entra de outro endereço', sa.st === 200, JSON.stringify(sa.c));

    // 2. Limite geral da conta: 30 erros de endereços diferentes
    limpa();
    const antesEmail = emailsProtecao();
    let ultima;
    for (let i = 0; i < 30; i++) ultima = await entrar(VIT, ERR, `198.18.${Math.floor(i / 200)}.${(i % 200) + 1}`);
    ok('30 erros de endereços diferentes: a 30ª resposta diz que bloqueou por 15 minutos', /bloqueado por 15 minutos/.test(ultima.c.erro || ''), ultima.c.erro);
    const protegida = await entrar(VIT, OK, ip());
    ok('Conta em proteção: a senha definitiva não entra nem de um endereço novo', protegida.st === 401 && /Tente novamente em 15 minutos/.test(protegida.c.erro || ''), JSON.stringify(protegida.c));
    await esperar(2500);
    ok('O dono recebeu 1 e-mail avisando da proteção', emailsProtecao() === antesEmail + 1, `${emailsProtecao() - antesEmail} e-mail(s)`);

    // 3. Saída: a senha temporária enviada ao e-mail entra mesmo em proteção, e desfaz o bloqueio
    const rec = await post('/api/auth/recuperar', { email: VIT });
    await esperar(2500);
    const temp = (log().match(/senha temporária do FilaPro Leads é: (\S+)/g) || []).pop()?.split(': ')[1];
    ok('Recuperação funciona com a conta em proteção (e-mail com a senha temporária saiu)', rec.st === 200 && !!temp);
    const viaTemp = await entrar(VIT, temp, ip());
    ok('Senha temporária entra mesmo com a conta em proteção (vai ao primeiro acesso)', viaTemp.st === 200 && viaTemp.c.destino === '/primeiro-acesso', JSON.stringify(viaTemp.c));
    const depois = await entrar(VIT, OK, ip());
    ok('Depois de entrar pela senha temporária, a proteção foi desfeita (senha definitiva entra)', depois.st === 200, JSON.stringify(depois.c));
    sql(`update "Usuario" set "senhaTempHash"=null,"senhaTempExpiraEm"=null where email='${VIT}'`);

    // 4. Aviso ao dono: no máximo 1 por hora
    sql(`delete from "TentativaLogin" where chave not like 'aviso:%'`);
    for (let i = 0; i < 30; i++) await entrar(VIT, ERR, `198.19.${Math.floor(i / 200)}.${(i % 200) + 1}`);
    await esperar(2000);
    ok('Nova proteção em menos de 1 hora: o dono NÃO recebe outro e-mail', emailsProtecao() === antesEmail + 1, `${emailsProtecao() - antesEmail} e-mail(s)`);

    // 5. E-mail sem conta: mesmas regras e mesmas mensagens (S4), sem e-mail para ninguém
    limpa();
    const fantasma = `ninguem-${Date.now()}@teste-s5.com`;
    let u2; for (let i = 0; i < 30; i++) u2 = await entrar(fantasma, ERR, `198.20.${Math.floor(i / 200)}.${(i % 200) + 1}`);
    const u3 = await entrar(fantasma, ERR, ip());
    ok('E-mail sem conta: a 30ª resposta e o bloqueio seguinte são iguais aos de uma conta real', /bloqueado por 15 minutos/.test(u2.c.erro || '') && /Tente novamente em 15 minutos/.test(u3.c.erro || ''), `${u2.c.erro} | ${u3.c.erro}`);
    ok('E-mail sem conta não gera e-mail de aviso', emailsProtecao() === antesEmail + 1);

    // 6. Recuperação: intervalo de 10 minutos e 3 por hora por e-mail
    limpa();
    const emails0 = (log().match(/senha temporária do FilaPro Leads/g) || []).length;
    await post('/api/auth/recuperar', { email: VIT }); await esperar(1800);
    const h1 = sql(`select "senhaTempHash" from "Usuario" where email='${VIT}'`);
    await post('/api/auth/recuperar', { email: VIT }); await esperar(1800);
    const h2 = sql(`select "senhaTempHash" from "Usuario" where email='${VIT}'`);
    ok('Recuperação repetida em menos de 10 minutos NÃO gera outra senha (a primeira continua valendo)', !!h1 && h1 === h2);
    const mexe = () => sql(`delete from "TentativaLogin" where chave like 'recint:%'`); // faz de conta que passaram os 10 minutos
    mexe(); await post('/api/auth/recuperar', { email: VIT }); await esperar(1800);
    const h3 = sql(`select "senhaTempHash" from "Usuario" where email='${VIT}'`);
    mexe(); await post('/api/auth/recuperar', { email: VIT }); await esperar(1800);
    const h4 = sql(`select "senhaTempHash" from "Usuario" where email='${VIT}'`);
    mexe(); await post('/api/auth/recuperar', { email: VIT }); await esperar(1800);
    const h5 = sql(`select "senhaTempHash" from "Usuario" where email='${VIT}'`);
    ok('Depois dos 10 minutos gera nova senha, até 3 por hora por e-mail', h3 !== h2 && h4 !== h3 && h5 === h4, 'hash 3 e 4 novos; o 4º pedido da hora (5º no total) não troca');
    const emails1 = (log().match(/senha temporária do FilaPro Leads/g) || []).length;
    ok('Foram enviados só 3 e-mails para 5 pedidos', emails1 - emails0 === 3, `${emails1 - emails0} e-mails`);

    // 6b. Pedidos SIMULTÂNEOS não furam os limites (a contagem é atômica no banco)
    limpa();
    const e0 = (log().match(/senha temporária do FilaPro Leads/g) || []).length;
    await Promise.all(Array.from({ length: 8 }, () => post('/api/auth/recuperar', { email: VIT })));
    await esperar(3500);
    const e1 = (log().match(/senha temporária do FilaPro Leads/g) || []).length;
    ok('8 pedidos de recuperação ao mesmo tempo geram só 1 senha e 1 e-mail', e1 - e0 === 1, `${e1 - e0} e-mail(s)`);
    limpa();
    const C = `203.0.115.${SORTE}`;
    await Promise.all(Array.from({ length: 12 }, () => entrar(VIT, ERR, C)));
    const furou = await entrar(VIT, OK, C);
    ok('12 tentativas erradas ao mesmo tempo bloqueiam o endereço (não dá para furar o limite com tentativas simultâneas)', furou.st === 401 && /Tente novamente/.test(furou.c.erro || ''), JSON.stringify(furou.c));
    limpa();

    // 7. Rotina de 5 minutos limpa linhas velhas
    sql(`insert into "TentativaLogin" (chave,falhas,desde,"atualizadoEm") values ('par:velho@x.com|1.1.1.1',2, now()-interval '3 day', now()-interval '3 day')`);
    sql(`insert into "TentativaLogin" (chave,falhas,desde,"atualizadoEm") values ('par:novo@x.com|1.1.1.1',2, now(), now())`);
    const cr = await (await fetch(BASE + '/api/cron/servico', { headers: { authorization: 'Bearer segredo-teste' } })).json();
    ok('Rotina apaga as linhas de controle com mais de 1 dia e mantém as novas', cr.tentativasLimpas >= 1 && sql(`select count(*) from "TentativaLogin" where chave='par:velho@x.com|1.1.1.1'`) === '0' && sql(`select count(*) from "TentativaLogin" where chave='par:novo@x.com|1.1.1.1'`) === '1', JSON.stringify(cr).slice(0, 100));
  } finally {
    limpa();
    console.log(res.join('\n'));
  }
})();
