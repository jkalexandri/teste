// Teste de ponta a ponta da decisão #171 (avisos da VPS e monitor externo), pela API do site de teste.
// Requer: app em http://localhost:3005 (CRON_SECRET=segredo-teste, MONITOR_TOKEN=token-monitor-teste-1234567890abcdef, log em /var/tmp/web.log) e Postgres com seed.
// Uso: node apps/web/tests/etapa37-alertas-vps.e2e.cjs
const { execSync } = require('child_process');
const fs = require('fs');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const TOKEN = 'token-monitor-teste-1234567890abcdef';
let PASS = 0, FAIL = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${!c && x ? ' (' + x + ')' : ''}`); c ? PASS++ : FAIL++; };
const post = async (itens, segredo = 'segredo-teste') => { const r = await fetch(BASE + '/api/cron/vps', { method: 'POST', headers: { 'content-type': 'application/json', ...(segredo ? { authorization: `Bearer ${segredo}` } : {}) }, body: JSON.stringify({ itens }) }); return { status: r.status, corpo: await r.json().catch(() => ({})) }; };
const monitor = async (t = TOKEN) => { const r = await fetch(BASE + '/api/monitor' + (t === null ? '' : `?t=${t}`)); return { status: r.status, texto: await r.text() }; };
const log = () => fs.readFileSync('/var/tmp/web.log', 'utf8');
const contar = (assunto) => (log().match(new RegExp('Assunto: ' + assunto.replace(/[()]/g, '\\$&'), 'g')) || []).length;
const A_DISCO = 'FilaPro Leads — VPS: pouco espaço livre no disco da VPS';
const A_MEM = 'FilaPro Leads — VPS: memória da VPS no limite';
const SAS = Number(sql(`select count(*) from "Usuario" where cargo='SUPERADMIN' and status='ATIVO'`));
const limpar = () => sql(`delete from "AlertaServico" where id like 'vps:%'`);

(async () => {
  const manutAntes = sql(`select ligada from "Manutencao" where id='geral'`);
  sql(`update "Manutencao" set ligada=false where id='geral'`);
  limpar();
  const b0 = { disco: contar(A_DISCO), mem: contar(A_MEM) };
  const novos = (a, base) => contar(a) - base;

  // ---- Proteção das rotas
  ok('Relatório sem segredo: 401', (await post([], null)).status === 401);
  ok('Relatório com segredo errado: 401', (await post([], 'errado')).status === 401);
  ok('GET no relatório: 405', (await fetch(BASE + '/api/cron/vps')).status === 405);
  const rInv = await fetch(BASE + '/api/cron/vps', { method: 'POST', headers: { authorization: 'Bearer segredo-teste', 'content-type': 'application/json' }, body: 'não é json' });
  ok('Corpo que não é JSON: 400', rInv.status === 400);
  ok('Mais de 50 itens: 400', (await post(Array.from({ length: 51 }, () => ({ id: 'disco', nivel: 'ok' })))).status === 400);
  ok('Monitor sem token: 404', (await monitor(null)).status === 404);
  ok('Monitor com token errado: 404', (await monitor('errado')).status === 404);
  ok('Monitor com token certo e sem nenhum relatório da VPS: 503', (await monitor()).status === 503, JSON.stringify(await monitor()));

  // ---- Relatório tudo ok: monitor 200
  let r = await post([{ id: 'disco', nivel: 'ok', valor: 'disco em 40%' }, { id: 'backup', nivel: 'ok', valor: 'há 3 h' }]);
  ok('Relatório tudo ok: processado sem avisos', r.status === 200 && r.corpo.avisos === 0 && r.corpo.resolvidos === 0, JSON.stringify(r));
  let m = await monitor(); ok('Monitor: 200 "ok"', m.status === 200 && m.texto === 'ok', JSON.stringify(m));
  ok('Nenhuma linha de aviso criada para itens ok', sql(`select count(*) from "AlertaServico" where id like 'vps:%' and id<>'vps:relatorio'`) === '0');

  // ---- Disco: aviso, sem repetir, piora, lembrete, resolvido
  r = await post([{ id: 'disco', nivel: 'aviso', valor: 'disco em 83%' }]);
  ok('Disco 83%: avisa (1)', r.corpo.avisos === 1, JSON.stringify(r));
  ok('O e-mail foi para todos os Super Admins ativos', novos(A_DISCO, b0.disco) === SAS && SAS >= 1, `${novos(A_DISCO, b0.disco)} de ${SAS}`);
  ok('O e-mail traz o "o que fazer" e o valor', /du -xh/.test(log()) && /disco em 83%/.test(log()));
  r = await post([{ id: 'disco', nivel: 'aviso', valor: 'disco em 83%' }]);
  ok('Mesmo problema de novo: NÃO repete o e-mail', r.corpo.avisos === 0 && r.corpo.lembretes === 0 && novos(A_DISCO, b0.disco) === SAS);
  ok('Aviso (não crítico): o monitor segue 200', (await monitor()).status === 200);
  r = await post([{ id: 'disco', nivel: 'critico', valor: 'disco em 92%' }]);
  ok('Piorou para crítico: avisa na hora', r.corpo.avisos === 1 && novos(A_DISCO, b0.disco) === 2 * SAS, JSON.stringify(r));
  m = await monitor(); ok('Crítico aberto: o monitor responde 503 "problema critico"', m.status === 503 && m.texto === 'problema critico', JSON.stringify(m));
  r = await post([{ id: 'disco', nivel: 'critico', valor: 'disco em 92%' }]);
  ok('Crítico, antes de 6 h: sem lembrete', r.corpo.lembretes === 0);
  sql(`update "AlertaServico" set "ultimoAvisoEm" = now() - interval '7 hours' where id='vps:disco'`);
  r = await post([{ id: 'disco', nivel: 'critico', valor: 'disco em 92%' }]);
  ok('Crítico, 7 h depois: lembrete (6 h)', r.corpo.lembretes === 1 && contar(A_DISCO + ' (lembrete)') >= SAS, JSON.stringify(r));
  const A_RES = 'FilaPro Leads — VPS: pouco espaço livre no disco da VPS (resolvido)'; const bRes = contar(A_RES);
  r = await post([{ id: 'disco', nivel: 'ok', valor: 'disco em 50%' }]);
  ok('Voltou ao normal: e-mail "resolvido"', r.corpo.resolvidos === 1 && contar(A_RES) - bRes === SAS, JSON.stringify(r));
  ok('Resolvido: linha zerada e monitor 200', sql(`select "avisouEm" is null and contagem=0 from "AlertaServico" where id='vps:disco'`) === 't' && (await monitor()).status === 200);
  r = await post([{ id: 'disco', nivel: 'ok' }]);
  ok('Ok de novo: não manda "resolvido" duas vezes', r.corpo.resolvidos === 0);

  // ---- Memória: só avisa na 2ª leitura
  r = await post([{ id: 'memoria', nivel: 'aviso', valor: 'memória livre 5%' }]);
  ok('Memória, 1ª leitura ruim: ainda não avisa', r.corpo.avisos === 0 && novos(A_MEM, b0.mem) === 0);
  r = await post([{ id: 'memoria', nivel: 'aviso', valor: 'memória livre 5%' }]);
  ok('Memória, 2ª leitura seguida ruim: avisa', r.corpo.avisos === 1 && novos(A_MEM, b0.mem) === SAS);
  await post([{ id: 'memoria', nivel: 'ok' }]);

  // ---- Itens inválidos
  r = await post([{ id: 'xyz', nivel: 'critico' }, { id: 'disco', nivel: 'urgente' }, { id: 'disco', nivel: 'ok' }, { id: 'disco', nivel: 'critico' }]);
  ok('Código desconhecido, nível inválido e item repetido são ignorados', r.corpo.ignorados === 3 && sql(`select count(*) from "AlertaServico" where id='vps:xyz'`) === '0', JSON.stringify(r));
  await post([{ id: 'disco', nivel: 'ok' }]);

  // ---- Valor malicioso é limpo antes de ir no e-mail
  limpar(); await post([{ id: 'reinicio', nivel: 'aviso', valor: '<script>alert(1)</script>"; rm -rf /' }]);
  ok('Valor com HTML/aspas: o e-mail não leva < > nem aspas do valor', !/<script>/.test(log()) && /Situação: scriptalert\(1\)\/script rm -rf \//.test(log()), '');
  await post([{ id: 'reinicio', nivel: 'ok' }]);

  // ---- Relatório antigo (a VPS parou de reportar)
  sql(`update "AlertaServico" set "atualizadoEm" = now() - interval '2 hours' where id='vps:relatorio'`);
  m = await monitor(); ok('VPS sem reportar há 2 h: o monitor responde 503 "sem relatorio"', m.status === 503 && /sem relatorio/.test(m.texto), JSON.stringify(m));
  await post([{ id: 'disco', nivel: 'ok' }]);
  ok('Voltou a reportar: monitor 200', (await monitor()).status === 200);

  // ---- Manutenção: relatório não processa; monitor livre responde 200 "manutencao"
  sql(`update "Manutencao" set ligada=true where id='geral'`); await new Promise((r) => setTimeout(r, 3500));
  const bM = contar(A_DISCO);
  const rm = await post([{ id: 'disco', nivel: 'critico', valor: 'disco em 95%' }]);
  ok('Em manutenção: o relatório é recusado (503) e nada é avisado', rm.status === 503 && contar(A_DISCO) === bM, JSON.stringify(rm));
  m = await monitor(); ok('Em manutenção: o monitor responde 200 "manutencao" (não alarma na atualização)', m.status === 200 && m.texto === 'manutencao', JSON.stringify(m));
  sql(`update "Manutencao" set ligada=${manutAntes === 't' ? 'true' : 'false'} where id='geral'`);

  // ---- Limpeza e conferência final
  limpar();
  ok('Nenhuma saída do teste vazou o segredo nem o token', !/segredo-teste|token-monitor-teste/.test(log()));
  console.log(`\n== ${PASS} passaram, ${FAIL} falharam ==`); process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE', e); process.exit(1); });
