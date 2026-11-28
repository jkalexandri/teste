// Teste de ponta a ponta da decisão #149: atendimento por IA em 4 pontos (Leads, Campanhas, Suporte, Visitante não Cliente)
// com semáforo no Dashboard, chaves no menu Inteligência Artificial e bloqueio de cada ponto. IA "simulado".
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa23-ia-pontos.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const PONTOS = ['LEADS', 'CAMPANHAS', 'SUPORTE', 'VISITANTE'];

(async () => {
  const flagsAntes = sql(`select "iaLeadsLigada"||'|'||"iaCampanhasLigada"||'|'||"iaSuporteLigada"||'|'||"iaVisitanteLigada" from "ConfigVenda" where id='config'`);
  const configsAntes = sql(`select tarefa||'|'||provedor||'|'||modelo||'|'||coalesce(chave,'') from "ConfigIA" where tarefa in ('conversar','gerar_mensagens')`).split('\n').filter(Boolean);
  const manutAntes = sql(`select ligada from "Manutencao" where id='geral'`);
  const globalAntes = sql(`select coalesce(chave,'') from "ConfigIA" where tarefa='_anthropic'`);
  // IA simulada, sem falhas recentes e sem manutenção: todos os ligados ficam verdes
  for (const t of ['conversar', 'gerar_mensagens']) {
    if (sql(`select count(*) from "ConfigIA" where tarefa='${t}'`) === '0') sql(`insert into "ConfigIA"(tarefa,provedor,modelo,"urlBase","precoEntrada","precoSaida","atualizadoEm") values ('${t}','simulado','simulado','',0,0,now())`);
    else sql(`update "ConfigIA" set provedor='simulado', modelo='simulado', chave=null where tarefa='${t}'`);
  }
  sql(`delete from "UsoIA" where ok=false and "criadoEm" > now() - interval '30 minutes'`);
  if (manutAntes) sql(`update "Manutencao" set ligada=false where id='geral'`);
  sql(`update "ConfigVenda" set "iaLeadsLigada"=true, "iaCampanhasLigada"=true, "iaSuporteLigada"=false, "iaVisitanteLigada"=true where id='config'`);
  sql(`delete from "EstadoIAPonto"`);

  const b = await chromium.launch();
  const novo = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const cor = async (p, ponto) => p.locator(`[data-testid=ia-status-${ponto}]`).getAttribute('data-cor');
  const alternar = async (p, ponto) => { await p.goto(BASE + '/inteligencia-artificial'); await espera(900); await p.click(`[data-testid=ia-ponto-alternar-${ponto}]`); await espera(2200); };

  try {
    const [cS, pS] = await novo(); await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    // ===== Dashboard: semáforo =====
    await pS.goto(BASE + '/dashboard'); await espera(900);
    ok('Dashboard mostra os 4 pontos de IA', (await pS.locator('[data-testid^=ia-status-]').count()) === 4);
    ok('Ligados ficam verdes (Leads, Campanhas e Visitante)', (await cor(pS, 'LEADS')) === 'VERDE' && (await cor(pS, 'CAMPANHAS')) === 'VERDE' && (await cor(pS, 'VISITANTE')) === 'VERDE');
    ok('Suporte desligado fica vermelho', (await cor(pS, 'SUPORTE')) === 'VERMELHO');
    ok('Textos: "Ligado" e "Desligado"', /Ligado/.test(await pS.locator('[data-testid=ia-status-LEADS]').innerText()) && /Desligado/.test(await pS.locator('[data-testid=ia-status-SUPORTE]').innerText()));
    await pS.screenshot({ path: OUT + '/ia-dashboard-verde-vermelho.png' });

    // ===== Menu Inteligência Artificial: as 4 chaves =====
    await pS.goto(BASE + '/inteligencia-artificial'); await espera(900);
    ok('Menu Inteligência Artificial tem as 4 chaves', (await pS.locator('[data-testid^=ia-ponto-alternar-]').count()) === 4);
    await pS.screenshot({ path: OUT + '/ia-menu-pontos.png' });

    // ===== Desligar Leads: vermelho, banner para o usuário =====
    await alternar(pS, 'LEADS');
    ok('Desligar grava a chave de Leads', sql(`select "iaLeadsLigada" from "ConfigVenda" where id='config'`) === 'f');
    await pS.goto(BASE + '/dashboard'); await espera(900);
    ok('Dashboard: Leads fica vermelho', (await cor(pS, 'LEADS')) === 'VERMELHO');
    const [cU, pU] = await novo(); await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
    await pU.goto(BASE + '/conversas'); await espera(1200);
    ok('Usuário vê o aviso "IA desligada pela plataforma" nas Conversas IA', (await pU.locator('[data-testid=ia-desligada-plataforma]').count()) === 1);
    await pU.screenshot({ path: OUT + '/ia-conversas-desligada.png' });

    // ===== Desligar Campanhas: o "Atualizar prévia" não gasta IA =====
    await alternar(pS, 'CAMPANHAS');
    const usoAntes = sql(`select count(*) from "UsoIA" where tarefa='gerar_mensagens'`);
    await pU.goto(BASE + '/campanhas?aba=nova'); await espera(1200);
    await pU.fill('#assunto', 'Campanha IA desligada'); await pU.fill('#referencia', 'Quero apresentar nosso serviço de limpeza para clínicas');
    await pU.click('button:has-text("Atualizar prévia")'); await espera(1800);
    ok('Campanhas desligado: avisa para escrever manualmente', (await pU.locator('text=desligada pelo administrador').count()) >= 1);
    ok('Campanhas desligado: não gastou IA', sql(`select count(*) from "UsoIA" where tarefa='gerar_mensagens'`) === usoAntes);
    await pS.goto(BASE + '/dashboard'); await espera(900);
    ok('Dashboard: Campanhas vermelho', (await cor(pS, 'CAMPANHAS')) === 'VERMELHO');

    // ===== Religar: volta ao verde =====
    await alternar(pS, 'LEADS'); await alternar(pS, 'CAMPANHAS');
    await pS.goto(BASE + '/dashboard'); await espera(900);
    ok('Religados voltam a verde', (await cor(pS, 'LEADS')) === 'VERDE' && (await cor(pS, 'CAMPANHAS')) === 'VERDE');
    await pU.goto(BASE + '/conversas'); await espera(1000);
    ok('Banner some quando a IA volta', (await pU.locator('[data-testid=ia-desligada-plataforma]').count()) === 0);

    // ===== Amarelo: falta de chave e manutenção =====
    sql(`update "ConfigIA" set provedor='anthropic', chave=null where tarefa='conversar'`);
    sql(`update "ConfigIA" set chave=null where tarefa='_anthropic'`); // sem a chave única também
    await pS.goto(BASE + '/dashboard'); await espera(900);
    ok('Sem chave da IA: Leads e Visitante ficam amarelos', (await cor(pS, 'LEADS')) === 'AMARELO' && (await cor(pS, 'VISITANTE')) === 'AMARELO');
    ok('Campanhas (outra tarefa) continua verde', (await cor(pS, 'CAMPANHAS')) === 'VERDE');
    ok('O texto diz que falta a chave', /falta a chave da IA/.test(await pS.locator('[data-testid=ia-status-LEADS]').innerText()));
    await pS.screenshot({ path: OUT + '/ia-dashboard-amarelo.png' });
    sql(`update "ConfigIA" set provedor='simulado', modelo='simulado' where tarefa='conversar'`);
    sql(`update "Manutencao" set ligada=true where id='geral'`);
    await pS.goto(BASE + '/dashboard'); await espera(900);
    ok('Manutenção: os ligados ficam amarelos', (await cor(pS, 'LEADS')) === 'AMARELO' && /manutenção/.test(await pS.locator('[data-testid=ia-status-LEADS]').innerText()));
    sql(`update "Manutencao" set ligada=false where id='geral'`);

    // ===== Controle de acesso =====
    const st = await pU.evaluate(async () => (await fetch('/api/ia/pontos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ponto: 'LEADS', ligada: false }) })).status);
    ok('Usuário comum não liga/desliga os pontos', st !== 200 && sql(`select "iaLeadsLigada" from "ConfigVenda" where id='config'`) === 't', String(st));
    ok('Usuário comum não vê o semáforo no Dashboard', (await (async () => { await pU.goto(BASE + '/dashboard'); await espera(800); return pU.locator('[data-testid=status-ia]').count(); })()) === 0);
    // Atendimento: só o estado, com link para o controle
    await pS.goto(BASE + '/atendimento'); await espera(900);
    ok('Atendimento mostra o estado do Suporte e o link para ligar/desligar', (await pS.locator('[data-testid=estado-ia-suporte] a[href="/inteligencia-artificial#atendimento"]').count()) === 1 && (await pS.locator('[data-testid=ia-suporte-alternar]').count()) === 0);
    await cS.close(); await cU.close();
  } finally {
    await b.close();
    const [l, c, s, v] = flagsAntes.split('|').map((x) => (x === 't' || x === 'true' ? 'true' : 'false')); // o banco devolve 'true'/'false' ao concatenar
    sql(`update "ConfigVenda" set "iaLeadsLigada"=${l}, "iaCampanhasLigada"=${c}, "iaSuporteLigada"=${s}, "iaVisitanteLigada"=${v} where id='config'`);
    for (const c2 of configsAntes) { const [t, p, m, ch] = c2.split('|'); sql(`update "ConfigIA" set provedor='${p}', modelo='${m}', chave=${ch ? `'${ch}'` : 'null'} where tarefa='${t}'`); }
    if (globalAntes) sql(`update "ConfigIA" set chave='${globalAntes}' where tarefa='_anthropic'`);
    if (manutAntes) sql(`update "Manutencao" set ligada=${manutAntes === 't' ? 'true' : 'false'} where id='geral'`);
    sql(`delete from "EstadoIAPonto"`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
