// Teste de ponta a ponta da etapa 8c (painéis: Todos os disparos, Disparos por usuários, dashboards e saúde do número).
// Requer: app em http://localhost:3005 e Postgres com seed. Uso: node apps/web/tests/etapa8c-paineis.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo', IND = 'teste-conta-individual';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const IUS = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  for (const u of [ANA, IUS]) { sql(`delete from "Campanha" where "usuarioId"='${u}'`); sql(`delete from "Lead" where "usuarioId"='${u}'`); }
  sql(`delete from "Campanha" where "empresaId"='${EMP}'`);

  // Ana: 30 enviados (5 hoje), 10 falhas, 3 bloqueados 24h, 4 na fila → saúde Ruim (25% de falhas)
  sql(`insert into "Campanha"(id,"usuarioId","empresaId",assunto,mensagem,status,"iniciadaEm","totalLeads","atualizadoEm") values ('t8c-ana','${ANA}','${EMP}','Campanha da Ana','Olá','EM_ANDAMENTO',now(),47,now())`);
  sql(`insert into "Envio"(id,"campanhaId",telefone,status,"enviadoEm","criadoEm") select 't8c-a-env-'||g,'t8c-ana','55119911'||lpad(g::text,5,'0'),'ENVIADO', case when g<=5 then now() else now()-interval '2 day' end, now()-interval '2 day' from generate_series(1,30) g`);
  sql(`insert into "Envio"(id,"campanhaId",telefone,status,motivo,"criadoEm") select 't8c-a-fal-'||g,'t8c-ana','55119922'||lpad(g::text,5,'0'),'FALHOU','erro',now()-interval '1 day' from generate_series(1,10) g`);
  sql(`insert into "Envio"(id,"campanhaId",telefone,status,motivo,"criadoEm") select 't8c-a-blq-'||g,'t8c-ana','55119933'||lpad(g::text,5,'0'),'PULADO','Bloqueio 24h',now() from generate_series(1,3) g`);
  sql(`insert into "Envio"(id,"campanhaId",telefone,nome,status,ordem,"criadoEm") select 't8c-a-pen-'||g,'t8c-ana','55119944'||lpad(g::text,5,'0'),'Próximo '||g,'PENDENTE',g,now() from generate_series(1,4) g`);
  // Individual: 25 enviados, 6 responderam → saúde Boa
  sql(`insert into "Campanha"(id,"usuarioId","empresaId",assunto,mensagem,status,"iniciadaEm","concluidaEm","totalLeads","atualizadoEm") values ('t8c-ind','${IUS}','${IND}','Campanha Individual','Olá','CONCLUIDA',now(),now(),25,now())`);
  sql(`insert into "Lead"(id,codigo,nome,telefone,"usuarioId","empresaId","codigoUsuario","codigoEmpresa","ultimaRespostaEm","atualizadoEm") select 't8c-l-'||g,'LT8C'||g,'Lead '||g,'55119955'||lpad(g::text,5,'0'),'${IUS}','${IND}','00001','00001', case when g<=6 then now() else null end, now() from generate_series(1,25) g`);
  sql(`insert into "Envio"(id,"campanhaId","leadId",telefone,status,"enviadoEm","criadoEm") select 't8c-i-env-'||g,'t8c-ind','t8c-l-'||g,'55119955'||lpad(g::text,5,'0'),'ENVIADO',now()-interval '1 day',now()-interval '1 day' from generate_series(1,25) g`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const kpi = async (p, nome) => (await p.locator(`[data-kpi="${nome}"] .font-display`).innerText()).trim();
  const linha = async (p, attr, nome) => (await p.locator(`tr[${attr}="${nome}"]`).innerText()).replace(/\s+/g, ' ');

  // ===== Usuário (Ana): dashboard =====
  let [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
  const kpis = (await p.locator('main .card .font-display.text-\\[24px\\]').allInnerTexts()).map((t) => t.trim());
  ok('Dashboard do usuário: fila 4, enviados hoje 5, bloqueados 3, qualificados 0', kpis.slice(0, 4).join(',') === '4,5,3,0', kpis.join(','));
  ok('Próximos na fila com nomes reais', (await p.locator('text=Próximo 1').count()) === 1);
  const saude = await p.locator('[data-testid=saude-numero]').innerText();
  ok('Saúde do número: Ruim por falhas (25%) e sugere o modo Conservador', saude.includes('Ruim') && saude.includes('Falhas: 25%') && saude.includes('modo Conservador'), saude.replace(/\s+/g, ' '));
  await p.screenshot({ path: OUT + '/dashboard-usuario.png', fullPage: true });
  await c.close();

  // ===== Admin da Empresa =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Business');
  const kAdmin = (await p.locator('main .card .font-display.text-\\[24px\\]').allInnerTexts()).map((t) => t.trim());
  ok('Dashboard do Admin com números reais da empresa', kAdmin.slice(0, 4).join(',') === '4,5,3,0', kAdmin.join(','));
  ok('Disparos por usuários do dashboard sem o Admin', (await p.locator('td:has-text("Admin da Empresa Exemplo")').count()) === 0 && (await p.locator('tr:has-text("Ana Souza")').innerText()).includes('30'));
  await p.click('aside nav >> text=Todos os disparos'); await p.waitForURL('**/todos-os-disparos');
  ok('Admin: Todos os disparos com totais da empresa', (await kpi(p, 'Enviados')) === '30' && (await kpi(p, 'Em fila')) === '4' && (await kpi(p, 'Bloqueados 24h')) === '3');
  ok('Admin não vê outras empresas nem individuais', (await p.locator('text=Campanha Individual').count()) === 0 && (await p.locator('text=Usuário Demo').count()) === 0);
  ok('Admin: linha da Ana com saúde Ruim', (await linha(p, 'data-usuario', 'Ana Souza')).includes('Ruim'));
  ok('Admin: campanhas ativas da empresa', (await p.locator('td:has-text("Campanha da Ana")').count()) === 1);
  await p.selectOption('#filtro-usuario-disparos', ANA); await p.click('button:has-text("Filtrar")'); await espera(800);
  ok('Filtro por usuário', p.url().includes('usuario=') && (await kpi(p, 'Enviados')) === '30');
  await p.screenshot({ path: OUT + '/admin-todos-disparos.png', fullPage: true });
  await c.close();

  // ===== Super Admin =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  const sCards = await p.locator('main .card').allInnerTexts();
  const card = (n) => (sCards.find((t) => t.includes(n)) || '').split('\n')[0].trim();
  ok('Dashboard do Super Admin com totais reais', card('Enviados (total)') === '55' && card('Em fila (total)') === '4', `${card('Enviados (total)')}/${card('Em fila (total)')}`);
  await p.click('aside nav >> text=Todos os disparos'); await p.waitForURL('**/todos-os-disparos');
  ok('Super Admin: total geral (empresas + individuais)', (await kpi(p, 'Enviados')) === '55');
  ok('Grupo Empresas com a soma da empresa', (await linha(p, 'data-empresa', 'Empresa Exemplo')).includes('30 4 3 0 1'), await linha(p, 'data-empresa', 'Empresa Exemplo'));
  ok('Grupo Individuais separado', (await linha(p, 'data-usuario', 'Usuário Demo')).includes('25 0 0 0 1'), await linha(p, 'data-usuario', 'Usuário Demo'));
  await p.screenshot({ path: OUT + '/superadmin-todos-disparos.png', fullPage: true });
  await p.click('aside nav >> text=Disparos por usuários'); await p.waitForURL('**/disparos-por-usuarios');
  ok('Disparos por usuários: Admin da Empresa aparece para o Super Admin', (await p.locator('tr[data-usuario="Admin da Empresa Exemplo"] >> text=Admin da Empresa').count()) >= 1);
  ok('Saúde: Ana Ruim, individual Boa', (await linha(p, 'data-usuario', 'Ana Souza')).includes('Ruim') && (await linha(p, 'data-usuario', 'Usuário Demo')).includes('Boa'));
  ok('Leads por usuário', (await linha(p, 'data-usuario', 'Usuário Demo')).includes('25'));
  await p.screenshot({ path: OUT + '/disparos-por-usuarios.png', fullPage: true });
  await c.close();

  // Limpeza
  for (const u of [ANA, IUS]) { sql(`delete from "Campanha" where "usuarioId"='${u}'`); sql(`delete from "Lead" where "usuarioId"='${u}'`); }
  await b.close();
  console.log(res.join('\n'));
  console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
