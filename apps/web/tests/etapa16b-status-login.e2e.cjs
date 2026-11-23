// Teste de ponta a ponta da decisão #109: pílula de status real no login (verde, amarelo, vermelho e uptime medido).
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 e Postgres. Reinicia o serviço 24/7 no meio do teste.
// Uso: node apps/web/tests/etapa16b-status-login.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const WORKER = `cd ${__dirname}/../../worker && set -a && . ./.env && set +a && DISPAROS=desligado PASTA_ARQUIVOS=/var/tmp/filapro-arquivos nohup npx tsx src/index.ts > /tmp/claude-0/worker.log 2>&1 &`;
// Religa o serviço 24/7 solto do teste (sem prender a saída do teste)
const ligarWorker = async () => { spawn('bash', ['-c', WORKER], { detached: true, stdio: 'ignore' }).unref(); for (let i = 0; i < 30; i++) { try { if ((await fetch('http://127.0.0.1:4000/saude')).ok) return; } catch {} await espera(500); } };

(async () => {
  const b = await chromium.launch();
  const ver = async (nome) => {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1500);
    const r = { cor: await p.locator('[data-testid=status-cor]').getAttribute('data-cor'), corFila: await p.locator('[data-testid=status-cor-fila]').getAttribute('data-cor'), sistema: await p.locator('[data-testid=status-sistema]').innerText(), fila: await p.locator('[data-testid=status-fila]').innerText(), uptime: (await p.locator('[data-testid=status-uptime]').count()) ? await p.locator('[data-testid=status-uptime]').innerText() : null };
    if (nome) await p.locator('.login-status-pill').screenshot({ path: `${OUT}/${nome}.png` });
    await p.close();
    return r;
  };
  try {
    // Uptime: 10 horas medidas, 1 hora com 30 minutos fora → (600-30)/600 = 95%
    sql(`delete from "Disponibilidade"`);
    sql(`insert into "Disponibilidade"(hora,minutos) select date_trunc('hour', now()) - (n || ' hours')::interval, case when n=5 then 30 else 60 end from generate_series(1,10) n`);
    await espera(31000); // cache do status (30 s)
    let s = await ver('status-verde');
    ok('Verde: Sistema Online', s.cor === 'verde' && s.sistema === 'Sistema Online', JSON.stringify(s));
    ok('Fila reflete o motor (desligado nos testes → Fila pausada, bolinha amarela)', s.fila === 'Fila pausada' && s.corFila === 'amarelo', `${s.fila} ${s.corFila}`);
    // Conta feita direto no banco: minutos registrados ÷ minutos desde a primeira hora medida
    const esperado = Number(sql(`select least(100, sum(minutos) * 100.0 / (extract(epoch from (now() - min(hora))) / 60)) from "Disponibilidade"`));
    const up = parseFloat(String(s.uptime));
    ok('Uptime medido de verdade (minutos no ar ÷ minutos do período)', Math.abs(up - esperado) < 0.5 && up < 99, `${s.uptime} x ${esperado.toFixed(1)}%`);
    // Serviço registra a disponibilidade a cada minuto
    ok('Serviço 24/7 registra o minuto atual', Number(sql(`select count(*) from "Disponibilidade" where hora >= date_trunc('hour', now())`)) === 1);
    // Amarelo: em atualização
    sql(`insert into "Manutencao"(id,ligada,desde) values ('geral',true,now()) on conflict (id) do update set ligada=true, desde=now()`);
    await espera(31000);
    s = await ver('status-amarelo');
    ok('Amarelo: Em atualização', s.cor === 'amarelo' && s.sistema === 'Em atualização' && s.fila === 'Em manutenção' && s.corFila === 'amarelo', JSON.stringify(s));
    sql(`update "Manutencao" set ligada=false, desde=null where id='geral'`);
    // Vermelho: serviço 24/7 fora do ar
    execSync(`pkill -f "src/[i]ndex.ts" || true`);
    await espera(31000);
    s = await ver('status-vermelho');
    ok('Vermelho: Instabilidade (serviço 24/7 sem responder)', s.cor === 'vermelho' && s.sistema === 'Instabilidade' && s.fila === 'Fila parada' && s.corFila === 'vermelho', JSON.stringify(s));
    await ligarWorker();
    await espera(31000);
    s = await ver();
    ok('Volta ao verde quando o serviço volta', s.cor === 'verde', JSON.stringify(s));
    const st = await fetch(BASE + '/api/status').then((r) => r.json());
    ok('Rota pública não expõe dados de clientes', Object.keys(st).sort().join(',') === 'cor,corFila,fila,sistema,uptime');
  } catch (e) {
    ok('Erro inesperado', false, String(e.message).split('\n')[0]);
  } finally {
    sql(`update "Manutencao" set ligada=false, desde=null where id='geral'`);
    sql(`delete from "Disponibilidade" where hora < date_trunc('hour', now()) - interval '30 minutes'`);
    try { await fetch('http://127.0.0.1:4000/saude'); } catch { await ligarWorker(); }
    await b.close();
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
