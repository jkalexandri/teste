// Teste de ponta a ponta da decisão #151 (M2 do Módulo 4): serviço 24/7 parado — a tela WhatsApp avisa em vez de mostrar
// "Conectado", e o site avisa o Super Admin por e-mail (um por queda). PARA e LIGA o serviço de teste de verdade.
// Requer: app em http://localhost:3005 (CRON_SECRET=segredo-teste, log em /var/tmp/web.log), serviço 24/7 em :4000 e Postgres com seed.
// Uso: node apps/web/tests/etapa24-servico-fora.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs'); const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => { const l = `${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`; res.push(l); console.error(l); };
const OUT = process.argv[2];
const WORKER = path.resolve(__dirname, '../../worker');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pararWorker = () => { try { execSync('pkill -f "src/[i]ndex.ts"'); } catch {} };
const ligarWorker = () => { // desvinculado (stdio ignorado): com execSync o teste ficaria esperando o serviço fechar a entrada
  const { spawn } = require('child_process');
  spawn('bash', ['-c', `cd ${WORKER} && set -a && . ./.env && set +a && DISPAROS=desligado PASTA_ARQUIVOS=/var/tmp/filapro-arquivos exec npx tsx src/index.ts > /tmp/worker-teste.log 2>&1`], { detached: true, stdio: 'ignore' }).unref();
};
const cron = async (segredo = 'segredo-teste') => { const r = await fetch(BASE + '/api/cron/servico', { headers: segredo ? { authorization: `Bearer ${segredo}` } : {} }); return { status: r.status, corpo: await r.json().catch(() => ({})) }; };
const contar = (assunto) => (fs.readFileSync('/var/tmp/web.log', 'utf8').match(new RegExp(`Assunto: ${assunto}`, 'g')) || []).length;
const ASS_FORA = 'FilaPro Leads — serviço do WhatsApp fora do ar', ASS_VOLTOU = 'FilaPro Leads — serviço do WhatsApp voltou';
let base = {};
/** E-mails enviados DESDE o início do teste (o log acumula os de execuções anteriores) */
const emails = (assunto) => contar(assunto) - base[assunto];
const ate = async (f, ms = 20000) => { for (let i = 0; i < ms / 300; i++) { if (await f()) return true; await espera(300); } return false; };

(async () => {
  const USU = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  const manutAntes = sql(`select ligada from "Manutencao" where id='geral'`);
  base = { [ASS_FORA]: contar(ASS_FORA), [ASS_VOLTOU]: contar(ASS_VOLTOU) };
  sql(`delete from "AlertaServico"`);
  if (manutAntes) sql(`update "Manutencao" set ligada=false where id='geral'`);
  const sessaoAntes = sql(`select count(*) from "WhatsappSessao" where id='${USU}'`);
  // Número "Conectado" no banco (o estado antigo que a tela mostraria sem a correção)
  sql(`delete from "WhatsappSessao" where id='${USU}'`);
  sql(`insert into "WhatsappSessao"(id,"usuarioId",status,numero,"conectadoEm","atualizadoEm") values ('${USU}','${USU}','CONECTADO','5511999990000',now(),now())`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha) => { await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard'); };
  const chip = (p) => p.locator('[data-testid=status-whatsapp]').first().innerText();

  try {
    const [cU, pU] = await novo(); await entrar(pU, 'usuario@disparopro.com.br', 'User@12345678');
    const [cS, pS] = await novo(); await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');

    // ===== Serviço no ar: tudo como antes =====
    await espera(1500);
    await pU.goto(BASE + '/whatsapp'); await espera(1200);
    ok('Serviço no ar: a tela mostra "Conectado" e não mostra o aviso', (await chip(pU)) === 'Conectado' && (await pU.locator('[data-testid=servico-fora]').count()) === 0);

    // ===== Serviço PARA de verdade =====
    pararWorker(); await espera(3000);
    await pU.goto(BASE + '/whatsapp'); await espera(1200);
    ok('Serviço parado: o selo vira "Serviço fora do ar" (e não "Conectado")', (await chip(pU)) === 'Serviço fora do ar');
    ok('Aparece a caixa explicando que campanhas e IA estão paradas', /fora do ar no momento/.test(await pU.locator('[data-testid=servico-fora]').innerText()) && /campanhas e respostas da IA estão paradas/.test(await pU.locator('[data-testid=servico-fora]').innerText()));
    ok('Os botões ficam desativados', (await pU.locator('[data-testid=conectar-whatsapp]').isDisabled()) && (await pU.locator('[data-testid=tentar-agora]').count()) === 0);
    ok('O cartão "Conectado desde" some (era o estado velho)', (await pU.locator('text=Conectado desde').count()) === 0);
    await pU.screenshot({ path: OUT + '/servico-fora-usuario.png' });
    // QR antigo não aparece com o serviço parado
    sql(`update "WhatsappSessao" set status='AGUARDANDO_QR', qr='qr-antigo', "qrEm"=now() where id='${USU}'`);
    await pU.reload(); await espera(1200);
    ok('QR Code antigo fica escondido com o serviço parado', (await pU.locator('img[alt^="QR Code"]').count()) === 0 && (await chip(pU)) === 'Serviço fora do ar');
    sql(`update "WhatsappSessao" set status='CONECTADO', qr=null, "qrEm"=null where id='${USU}'`);
    // Número da plataforma (Super Admin): mensagem própria
    await pS.goto(BASE + '/numero-plataforma'); await espera(1200);
    ok('Número da plataforma: "Serviço fora do ar" com texto dos avisos na fila', (await chip(pS)) === 'Serviço fora do ar' && /avisos do sistema ficam na fila/.test(await pS.locator('[data-testid=servico-fora]').innerText()));
    // Com "último sinal"
    sql(`delete from "ServicoInstancia"`); sql(`insert into "ServicoInstancia"(id,dono,"vistoEm") values ('servico24h','teste-parado', now() - interval '2 minutes')`);
    await pU.reload(); await espera(1200);
    ok('Com sinal antigo, a caixa mostra o horário do último sinal', /último sinal às \d\d:\d\d/.test(await pU.locator('[data-testid=servico-fora]').innerText()));
    // Menos de 90 s sem sinal ainda NÃO conta como fora do ar
    sql(`update "ServicoInstancia" set "vistoEm"=now() - interval '60 seconds' where id='servico24h'`);
    await pU.reload(); await espera(1200);
    ok('60 s sem sinal ainda é "Conectado" (pausa curta não pisca)', (await chip(pU)) === 'Conectado' && (await pU.locator('[data-testid=servico-fora]').count()) === 0);
    sql(`update "ServicoInstancia" set "vistoEm"=now() - interval '100 seconds' where id='servico24h'`);
    await pU.reload(); await espera(1200);
    ok('100 s sem sinal já é "fora do ar"', (await chip(pU)) === 'Serviço fora do ar');

    // ===== Aviso por e-mail =====
    ok('Rota do vigia exige o segredo', (await cron('')).status === 401 && (await cron('errado')).status === 401);
    sql(`update "ServicoInstancia" set "vistoEm"=now() - interval '2 minutes' where id='servico24h'`);
    let r = await cron();
    ok('Menos de 3 min parado: ainda não avisa', r.corpo.acao === 'nada' && emails('FilaPro Leads — serviço do WhatsApp fora do ar') === 0, JSON.stringify(r.corpo));
    sql(`update "ServicoInstancia" set "vistoEm"=now() - interval '4 minutes' where id='servico24h'`);
    r = await cron();
    ok('Mais de 3 min parado: avisa por e-mail UMA vez', r.corpo.acao === 'avisou-fora' && emails('FilaPro Leads — serviço do WhatsApp fora do ar') === 1, JSON.stringify(r.corpo));
    r = await cron(); await cron();
    ok('Continua parado: não repete o e-mail', r.corpo.acao === 'nada' && emails('FilaPro Leads — serviço do WhatsApp fora do ar') === 1);
    sql(`update "Manutencao" set ligada=true where id='geral'`);
    ok('Durante a manutenção (atualização) não mexe nem avisa', (await cron()).corpo.acao === 'manutencao');
    sql(`update "Manutencao" set ligada=false where id='geral'`);

    // ===== Serviço VOLTA de verdade =====
    sql(`delete from "ServicoInstancia"`); ligarWorker();
    ok('Serviço volta: a tela atualiza sozinha para "Conectado"', await ate(async () => { await pU.reload(); await espera(800); return (await chip(pU)) === 'Conectado'; }, 40000));
    ok('A caixa de aviso some', (await pU.locator('[data-testid=servico-fora]').count()) === 0);
    r = await cron();
    ok('Ao voltar, avisa por e-mail UMA vez que voltou', r.corpo.acao === 'avisou-voltou' && emails('FilaPro Leads — serviço do WhatsApp voltou') === 1, JSON.stringify(r.corpo));
    r = await cron();
    ok('No ar de novo: não repete', r.corpo.acao === 'nada' && emails('FilaPro Leads — serviço do WhatsApp voltou') === 1);
    await cU.close(); await cS.close();
  } finally {
    await b.close();
    sql(`delete from "WhatsappSessao" where id='${USU}'`);
    sql(`delete from "AlertaServico"`);
    if (manutAntes) sql(`update "Manutencao" set ligada=${manutAntes === 't' ? 'true' : 'false'} where id='geral'`);
    // Garante o serviço no ar para os próximos testes
    if (sql(`select count(*) from "ServicoInstancia" where dono not like 'teste-%'`) === '0') { pararWorker(); sql(`delete from "ServicoInstancia"`); ligarWorker(); await espera(8000); }
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
