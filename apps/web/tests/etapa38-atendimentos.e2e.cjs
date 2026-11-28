// Teste de ponta a ponta da decisão #177: depois de encerrar o atendimento do suporte a tela limpa; a próxima mensagem abre um atendimento NOVO;
// o histórico continua guardado (só escondido) e o Super Admin o vê em "Atendimentos anteriores" (só leitura).
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (código novo) e Postgres com seed.
// Uso: node apps/web/tests/etapa38-atendimentos.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => { const l = `${c ? 'PASSOU' : 'FALHOU'} — ${n}${!c && x ? ' (' + x + ')' : ''}`; res.push(l); console.error(l); };
const OUT = process.argv[2] || '/tmp';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (f, ms = 15000) => { for (let i = 0; i < ms / 300; i++) { if (await f()) return true; await espera(300); } return false; };
const TOKEN = (fs.readFileSync(path.resolve(__dirname, '../../worker/.env'), 'utf8').match(/^WORKER_TOKEN="?([^"\n]+)"?/m) || [])[1];
const encerrar = async () => (await (await fetch('http://127.0.0.1:4000/suporte/encerrar-inativos', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: '{}' })).json()).encerrados;

// O serviço 24/7 também confere sozinho a cada 60 s: o que importa é a conversa ficar encerrada (por nós ou por ele)
const fechar = async () => { const n = await encerrar(); const feito = sql(`select "encerradaEm" is not null from "SuporteConversa" where id='tse38'`) === 't'; if (!feito) console.error('DEBUG encerrar()=' + n + ' | ' + sql(`select "atendimentoAtual"||' ult='||to_char("ultimaMensagemEm",'HH24:MI:SS')||' agora='||to_char(now(),'HH24:MI:SS')||' iaPausada='||"iaPausada"||' motivo='||coalesce("iaPausaMotivo",'-') from "SuporteConversa" where id='tse38'`) + ' | ' + sql(`select string_agg(autor||':'||atendimento||':'||to_char("criadoEm",'HH24:MI:SS'), ' ; ' order by "criadoEm") from "SuporteMensagem" where "conversaId"='tse38'`)); return feito; };

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const USU = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  const ligadaAntes = sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`);
  sql(`update "ConfigVenda" set "iaSuporteLigada"=false where id='config'`); // sem IA: só o fluxo dos atendimentos
  sql(`delete from "SuporteConversa"`);
  const msg = (id, conv, autor, min, texto, at = 1) => sql(`insert into "SuporteMensagem"(id,"conversaId",autor,"autorId",texto,atendimento,"criadoEm") values ('${id}','${conv}','${autor}','${autor === 'CLIENTE' ? ANA : 'sa'}','${texto}',${at}, now() - interval '${min} minutes')`);
  const total = () => Number(sql(`select count(*) from "SuporteMensagem"`));
  const at = () => sql(`select "atendimentoAtual" from "SuporteConversa" where id='tse38'`);

  // Conversa da Ana com um atendimento inteiro (cliente e suporte), parado há 11 min; a do usuário individual é antiga e NUNCA foi encerrada
  sql(`insert into "SuporteConversa"(id,"usuarioId","ultimaMensagemEm") values ('tse38','${ANA}', now() - interval '11 minutes')`);
  msg('tse38a', 'tse38', 'CLIENTE', 15, 'Preciso de ajuda com a campanha'); msg('tse38b', 'tse38', 'SUPORTE', 11, 'Claro, me mande o print');
  sql(`insert into "SuporteConversa"(id,"usuarioId","ultimaMensagemEm") values ('tse38u','${USU}', now() - interval '3 days')`);
  msg('tse38ua', 'tse38u', 'CLIENTE', 4320, 'Conversa antiga sem encerramento'); msg('tse38ub', 'tse38u', 'SUPORTE', 4310, 'Resolvido ontem');
  const T0 = total();

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => { await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`); await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard'); };
  const abrirChat = async (p) => { await p.goto(BASE + '/leads'); await espera(800); await p.click('[data-testid=botao-suporte]'); await espera(1500); };
  const bolhas = (p) => p.locator('[data-testid=janela-suporte] [data-autor]').count();
  const enviar = async (p, texto) => { await p.fill('[aria-label="Mensagem para o suporte"]', texto); await p.click('[data-testid=janela-suporte] button:has-text("Enviar")'); await espera(1800); };
  try {
    const [cS, pS] = await novo(); await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    const [cU, pU] = await novo(); await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');

    // ===== 1. Cliente COM o chat aberto na hora do encerramento: vê a mensagem uma vez; a tela só limpa na próxima vez =====
    await abrirChat(pU);
    ok('Antes de encerrar: o cliente vê as 2 mensagens do atendimento 1', (await bolhas(pU)) === 2);
    ok('Encerra o atendimento 1 (inatividade)', await fechar());
    ok('Com o chat aberto, o cliente vê a mensagem de encerramento (uma vez) em até 6 s', await ate(async () => (await pU.locator('[data-testid=janela-suporte] [data-testid=msg-sistema]').count()) === 1, 6000));
    ok('A tela NÃO limpa de repente: as mensagens continuam até ele sair e voltar', (await bolhas(pU)) === 2);
    await pU.screenshot({ path: OUT + '/atend-cliente-encerrado-aberto.png' });
    ok('A mensagem de encerramento ficou no atendimento 1 (o que fechou)', sql(`select atendimento from "SuporteMensagem" where "conversaId"='tse38' and autor='SISTEMA'`) === '1');

    // ===== 2. Cliente abre o chat de novo: tela limpa =====
    await abrirChat(pU);
    ok('Abrindo o chat de novo: TELA LIMPA (sem mensagens e sem a mensagem de encerramento)', (await bolhas(pU)) === 0 && (await pU.locator('[data-testid=janela-suporte] [data-testid=msg-sistema]').count()) === 0 && (await pU.locator('[data-testid=janela-suporte] [data-testid=chat-vazio]').count()) === 1);
    await pU.screenshot({ path: OUT + '/atend-cliente-limpo.png' });
    ok('Nada foi apagado do banco', total() === T0 + 1, `${total()} vs ${T0 + 1}`);

    // ===== 3. Super Admin: chat principal limpo + Atendimentos anteriores =====
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1800);
    ok('Super Admin: chat principal vazio, com o aviso de atendimento encerrado', (await pS.locator('[data-testid=chat-mensagens] [data-autor]').count()) === 0 && /Atendimento encerrado/.test(await pS.locator('[data-testid=chat-vazio]').innerText()));
    ok('Super Admin: selo "Encerrada" continua na lista', (await pS.locator('[data-testid=item-atendimento] [data-testid=selo-encerrada]').count()) >= 1);
    await pS.click('[data-testid=abrir-anteriores]'); await espera(1200);
    ok('Atendimentos anteriores: 1 bloco (Atendimento 1) com as mensagens e o encerramento', (await pS.locator('[data-testid=atendimento-anterior]').count()) === 1 && (await pS.locator('[data-testid=atendimento-anterior]').getAttribute('data-numero')) === '1' && /Preciso de ajuda com a campanha/.test(await pS.locator('[data-testid=anteriores]').innerText()) && /Claro, me mande o print/.test(await pS.locator('[data-testid=anteriores]').innerText()) && /encerrado por inatividade/.test(await pS.locator('[data-testid=anteriores]').innerText()));
    ok('Atendimentos anteriores é só leitura (sem caixa de escrever no modal)', (await pS.locator('[data-testid=anteriores] textarea').count()) === 0);
    await pS.screenshot({ path: OUT + '/atend-admin-anteriores.png' });
    await pS.click('[data-testid=fechar-anteriores]');

    // ===== 4. Cliente escreve: atendimento NOVO (2); a tela mostra só a mensagem nova =====
    await enviar(pU, 'Voltei, tenho outra dúvida');
    ok('A conversa reabriu como atendimento 2 e não está mais encerrada', at() === '2' && sql(`select "encerradaEm" is null from "SuporteConversa" where id='tse38'`) === 't');
    ok('A mensagem nova pertence ao atendimento 2 e as antigas seguem no 1', sql(`select string_agg(atendimento::text, ',' order by "criadoEm") from "SuporteMensagem" where "conversaId"='tse38'`) === '1,1,1,2');
    ok('Tela do cliente: só a mensagem nova (1 bolha)', (await bolhas(pU)) === 1 && (await pU.locator('[data-testid=janela-suporte] >> text=Voltei, tenho outra dúvida').count()) === 1);
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1800);
    ok('Super Admin: o chat principal mostra só o atendimento 2; o selo "Encerrada" sumiu', (await pS.locator('[data-testid=chat-mensagens] [data-autor]').count()) === 1 && (await pS.locator('[data-testid=chat-mensagens] >> text=Voltei, tenho outra dúvida').count()) === 1 && (await pS.locator('[data-testid=chat-mensagens] >> text=Preciso de ajuda com a campanha').count()) === 0 && (await pS.locator('[data-testid=item-atendimento] [data-testid=selo-encerrada]').count()) === 0);

    // ===== 5. Cliente que ESTAVA com a tela cheia e escreve: a tela troca para o atendimento novo (não mistura) =====
    // (volta a encerrar e reabre pela própria tela aberta)
    sql(`update "SuporteMensagem" set "criadoEm"=now() - interval '25 minutes' where "conversaId"='tse38' and autor='SISTEMA'`); // (o teste volta o relógio: a mensagem de encerramento antiga fica antes das novas)
    sql(`update "SuporteConversa" set "ultimaMensagemEm"=now() - interval '11 minutes' where id='tse38'`);
    sql(`update "SuporteMensagem" set "criadoEm"=now() - interval '11 minutes' where "conversaId"='tse38' and atendimento=2`);
    sql(`insert into "SuporteMensagem"(id,"conversaId",autor,"autorId",texto,atendimento,"criadoEm") values ('tse38c','tse38','SUPORTE','sa','Pode me passar o e-mail da conta?',2, now() - interval '11 minutes')`);
    await abrirChat(pU);
    ok('Atendimento 2 aberto na tela: 2 mensagens', (await bolhas(pU)) === 2);
    ok('Encerra o atendimento 2', await fechar());
    await ate(async () => (await pU.locator('[data-testid=janela-suporte] [data-testid=msg-sistema]').count()) === 1, 6000);
    await enviar(pU, 'Meu e-mail é ana@empresaexemplo.com.br');
    ok('Escrevendo com a tela cheia do atendimento anterior: a tela limpa e mostra SÓ a mensagem nova (atendimento 3)', at() === '3' && (await bolhas(pU)) === 1 && (await pU.locator('[data-testid=janela-suporte] [data-testid=msg-sistema]').count()) === 0 && (await pU.locator('[data-testid=janela-suporte] >> text=ana@empresaexemplo.com.br').count()) === 1);
    await pU.screenshot({ path: OUT + '/atend-cliente-atendimento3.png' });

    // ===== 6. Atendimentos anteriores com vários blocos (mais novo primeiro) =====
    sql(`update "SuporteMensagem" set "criadoEm"=now() - interval '25 minutes' where "conversaId"='tse38' and autor='SISTEMA'`);
    sql(`update "SuporteConversa" set "ultimaMensagemEm"=now() - interval '11 minutes' where id='tse38'`);
    sql(`update "SuporteMensagem" set "criadoEm"=now() - interval '11 minutes' where "conversaId"='tse38' and atendimento=3`);
    sql(`insert into "SuporteMensagem"(id,"conversaId",autor,"autorId",texto,atendimento,"criadoEm") values ('tse38d','tse38','SUPORTE','sa','Anotado, obrigado',3, now() - interval '11 minutes')`);
    ok('Encerra o atendimento 3', await fechar());
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1800);
    await pS.click('[data-testid=abrir-anteriores]'); await espera(1200);
    const nums = await pS.locator('[data-testid=atendimento-anterior]').evaluateAll((els) => els.map((e) => e.getAttribute('data-numero')));
    ok('Anteriores: 3 blocos, do mais novo (3) para o mais antigo (1)', nums.join(',') === '3,2,1', nums.join(','));
    await pS.click('[data-testid=fechar-anteriores]');

    // ===== 7. Super Admin escreve numa conversa encerrada (chamar o cliente): atendimento novo (4) =====
    const r = await pS.evaluate(async (id) => { const fd = new FormData(); fd.set('texto', 'Olá! Passando para saber se deu certo.'); const x = await fetch(`/api/suporte/${id}`, { method: 'POST', body: fd }); return x.json(); }, ANA);
    ok('Super Admin escreve na conversa encerrada: abre o atendimento 4', r.ok === true && at() === '4' && sql(`select "encerradaEm" is null from "SuporteConversa" where id='tse38'`) === 't');
    await pU.goto(BASE + '/leads'); await abrirChat(pU);
    ok('Cliente vê só a mensagem nova do suporte', (await bolhas(pU)) === 1 && (await pU.locator('[data-testid=janela-suporte] >> text=Passando para saber').count()) === 1);

    // ===== 8. Conversas que NUNCA foram encerradas continuam inteiras =====
    const [cU2, pU2] = await novo(); await entrar(pU2, 'usuario@disparopro.com.br', 'User@12345678');
    await abrirChat(pU2);
    ok('Conversa antiga e nunca encerrada: o cliente continua vendo tudo (2 mensagens)', (await bolhas(pU2)) === 2);
    await cU2.close();

    // ===== 9. Segurança: só o Super Admin lê os atendimentos anteriores =====
    const negado = await pU.evaluate(async (id) => { const x = await fetch(`/api/suporte/${id}/anteriores`, { redirect: 'manual' }); const t = await x.text().catch(() => ''); return { status: x.status, tipo: x.type, temMsg: /Preciso de ajuda/.test(t) }; }, ANA);
    ok('Cliente NÃO consegue ler os atendimentos anteriores pela API', !negado.temMsg && negado.status !== 200, JSON.stringify(negado));
    ok('Nada foi apagado do banco em nenhum momento (só mensagens novas)', total() >= T0 + 1 && sql(`select count(*) from "SuporteMensagem" where id in ('tse38a','tse38b','tse38ua','tse38ub')`) === '4');
    await cS.close(); await cU.close();
  } finally {
    await b.close();
    sql(`delete from "SuporteConversa"`);
    sql(`update "ConfigVenda" set "iaSuporteLigada"=${ligadaAntes === 't' ? 'true' : 'false'} where id='config'`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
