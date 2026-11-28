// Teste de ponta a ponta da etapa 11 (relatórios do Super Admin — especificação seção 6 e decisão #96).
// Requer: app em http://localhost:3005 e Postgres com seed. Uso: node apps/web/tests/etapa11-relatorios.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const lerExcel = require(path.join(__dirname, '../node_modules/read-excel-file/node/index.cjs')).default ?? require(path.join(__dirname, '../node_modules/read-excel-file/node/index.cjs'));
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo', IND = 'teste-conta-individual';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const USU = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  const SA = sql(`select id from "Usuario" where email='superadmin@disparopro.com.br'`);
  sql(`delete from "Campanha" where assunto='Relatório 11'`);
  sql(`delete from "Lead" where codigo like 'TR11-%'`);
  // 120 leads da Ana (paginação), 5 qualificados, 3 inativos, 2 antigos (janeiro/2026)
  sql(`insert into "Lead"(id,codigo,nome,telefone,status,ativo,"usuarioId","empresaId","codigoUsuario","criadoEm","atualizadoEm",qualificacao)
       select 'tr11-'||g, 'TR11-'||lpad(g::text,4,'0'), 'Lead Relatório '||g, '55119700'||lpad(g::text,5,'0'),
         (case when g<=5 then 'QUALIFICADO' else 'NOVO' end)::"StatusLead", g>3 or g>5, '${ANA}', '${EMP}', 'x',
         case when g in (119,120) then timestamp '2026-01-15 12:00' else now() end, now(), case when g<=5 then 'QUENTE' end
       from generate_series(1,120) g`);
  sql(`update "Lead" set ativo=false where codigo in ('TR11-0006','TR11-0007','TR11-0008')`);
  // Campanha com 3 enviadas (1 respondeu, 1 pediu para sair), 1 falha e 1 pulada
  sql(`insert into "Campanha"(id,"usuarioId","empresaId",assunto,mensagem,status,"totalLeads","criadoEm","atualizadoEm") values ('tr11-c','${ANA}','${EMP}','Relatório 11','x','CONCLUIDA',5,now(),now())`);
  sql(`insert into "Envio"(id,"campanhaId","leadId",telefone,nome,ordem,status,"enviadoEm") values
       ('tr11-e1','tr11-c','tr11-10','x1','',1,'ENVIADO',now()-interval '2 hours'),('tr11-e2','tr11-c','tr11-11','x2','',2,'ENVIADO',now()-interval '2 hours'),
       ('tr11-e3','tr11-c','tr11-12','x3','',3,'ENVIADO',now()-interval '2 hours'),('tr11-e4','tr11-c','tr11-13','x4','',4,'FALHOU',null),('tr11-e5','tr11-c','tr11-14','x5','',5,'PULADO',null)`);
  sql(`update "Lead" set "ultimaRespostaEm"=now() where id='tr11-10'`);
  sql(`update "Lead" set "pediuSairEm"=now(), status='PEDIU_SAIR' where id='tr11-11'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await c.addInitScript(() => { window.print = () => { window.__imprimiu = true; }; }); const p = await c.newPage(); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const tabela = async (p) => p.locator('[data-testid=tabela-relatorio] tbody tr').allInnerTexts();
  const total = async (p) => Number((await p.locator('[data-testid=total] b').innerText()).replace(/\D/g, ''));

  let [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Menu: 5 relatórios', (await p.locator('aside nav >> text=Relatório de campanhas').count()) === 1 && (await p.locator('aside nav >> text=Leads Business').count()) === 1);

  // ===== 1. Empresarial =====
  await p.goto(BASE + '/relatorios/empresarial'); await espera(500);
  await p.selectOption('#rel-conta', EMP); await p.waitForURL('**conta=' + EMP); await espera(600);
  const resumo = await p.locator('[data-testid=resumo]').innerText();
  ok('Empresarial: nome, pacote e expiração', resumo.includes('Empresa Exemplo') && resumo.includes(sql(`select pacote from "Empresa" where id='${EMP}'`)) && /\d{2}\/\d{2}\/\d{4}/.test(resumo));
  let linhas = await tabela(p);
  const totalEmp = Number(sql(`select count(*) from "Lead" where "empresaId"='${EMP}'`));
  const daAna = Number(sql(`select count(*) from "Lead" where "usuarioId"='${ANA}'`));
  ok('Empresarial: leads por usuário', linhas.some((l) => l.includes('Ana') && l.includes(daAna.toLocaleString('pt-BR'))));
  ok('Empresarial: total da empresa = soma', linhas.at(-1).includes('Total da empresa') && linhas.at(-1).includes(totalEmp.toLocaleString('pt-BR')), `${totalEmp}`);
  await p.screenshot({ path: OUT + '/rel-empresarial.png', fullPage: true });

  // ===== 2. Individual (sem empresas na lista) =====
  await p.goto(BASE + '/relatorios/individual'); await espera(500);
  const opcoes = await p.locator('#rel-conta option').allInnerTexts();
  ok('Individual: lista só usuários individuais', opcoes.some((o) => o.includes('usuario@disparopro.com.br')) && !opcoes.some((o) => o.includes('ana@empresaexemplo')));
  await p.selectOption('#rel-conta', USU); await p.waitForURL('**conta=' + USU); await espera(600);
  ok('Individual: total de leads', (await p.locator('[data-testid=resumo]').innerText()).includes(Number(sql(`select count(*) from "Lead" where "usuarioId"='${USU}'`)).toLocaleString('pt-BR')));

  // ===== 3. Leads Empresarial =====
  await p.goto(BASE + '/relatorios/leads-empresarial?conta=' + EMP); await espera(600);
  ok('Leads Empresarial: total e 100 por página', (await total(p)) === totalEmp && (await tabela(p)).length === 100);
  ok('Colunas: data, código, nome, telefone, status, temperatura, usuário', (await p.locator('[data-testid=tabela-relatorio] thead').innerText()).replace(/\s+/g, ' ').toUpperCase().includes('DATA CÓDIGO NOME TELEFONE STATUS TEMPERATURA USUÁRIO'));
  await p.click('text=Próxima →'); await espera(600);
  ok('Página 2', (await p.locator('[data-testid=total]').innerText()).includes('página 2'));
  await p.selectOption('#rel-usuario', ANA); await espera(800);
  ok('Filtro por usuário', (await total(p)) === daAna);
  await p.selectOption('#rel-status', 'QUALIFICADO'); await espera(800);
  ok('Filtro por status', (await total(p)) === Number(sql(`select count(*) from "Lead" where "usuarioId"='${ANA}' and status='QUALIFICADO'`)));
  await p.selectOption('#rel-status', ''); await espera(600); await p.selectOption('#rel-ativos', 'inativos'); await espera(800);
  ok('Filtro Inativos', (await total(p)) === Number(sql(`select count(*) from "Lead" where "usuarioId"='${ANA}' and not ativo`)));
  await p.selectOption('#rel-ativos', ''); await espera(600);
  await p.fill('#rel-de', '2026-01-01'); await espera(800); await p.fill('#rel-ate', '2026-01-31'); await espera(900);
  ok('Filtro por período', (await total(p)) === 2, String(await total(p)));
  // Excel com os filtros
  const urlExcel = BASE + await p.locator('[data-testid=baixar-excel]').getAttribute('href');
  const r = await p.request.get(urlExcel);
  ok('Baixar Excel responde planilha', r.ok() && (r.headers()['content-type'] || '').includes('spreadsheetml'));
  const planilha = await lerExcel(Buffer.from(await r.body()));
  const linhasXlsx = (planilha[0]?.data ?? planilha).filter((l) => l.some((v) => String(v ?? '').startsWith('TR11-')));
  ok('Excel tem as linhas do filtro', linhasXlsx.length === 2, String(linhasXlsx.length));
  // Imprimir: todas as linhas, sem menu
  await p.goto(BASE + '/relatorios/leads-empresarial?conta=' + EMP + '&usuario=' + ANA + '&imprimir=1'); await espera(1500);
  ok('Imprimir: todas as linhas numa página só', (await tabela(p)).length === daAna);
  ok('Imprimir: abre a janela de impressão', await p.evaluate(() => !!window.__imprimiu));
  await p.emulateMedia({ media: 'print' });
  ok('Na impressão o menu e os botões somem', !(await p.locator('aside').isVisible()) && (await p.locator('header').isVisible()) === false);
  await p.screenshot({ path: OUT + '/rel-impressao.png' });
  await p.emulateMedia({ media: 'screen' });
  // Decisão #97: cabeçalho com a logo, quem emitiu e a linha; quebra de página e "Página X de Y"
  const cab = await p.locator('[data-testid=cabecalho-impressao]').innerText();
  ok('Cabeçalho da impressão com o relatório e quem emitiu', cab.includes('Leads Business') && cab.includes('Emitido por') && cab.includes(sql(`select nome from "Usuario" where id='${SA}'`)));
  ok('Logo no cabeçalho', await p.evaluate(() => { const i = document.querySelector('.impressao-logo'); return !!i && i.complete && i.naturalWidth > 0; }));
  ok('Menu do celular não aparece na impressão', await (async () => { await p.emulateMedia({ media: 'print' }); const v = await p.locator('.nao-imprimir').evaluateAll((es) => es.every((e) => getComputedStyle(e).display === 'none')); await p.emulateMedia({ media: 'screen' }); return v; })());
  const pdf = path.join(OUT, 'relatorio.pdf');
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  await p.emulateMedia({ media: null });
  const paginas = Number(/Pages:\s+(\d+)/.exec(execSync(`pdfinfo ${pdf}`).toString())?.[1] ?? 0);
  const texto = execSync(`pdftotext -layout ${pdf} -`).toString();
  ok('PDF em várias páginas A4', paginas >= 2 && execSync(`pdfinfo ${pdf}`).toString().includes('(A4)'), String(paginas));
  ok('Rodapé "Página X de Y" em todas as páginas', Array.from({ length: paginas }, (_, i) => `Página ${i + 1} de ${paginas}`).every((t) => texto.includes(t)));
  ok('Cabeçalho repetido em todas as páginas', (texto.match(/Emitido por/g) || []).length === paginas);

  // ===== 4. Lead Individual (com o Super Admin) =====
  await p.goto(BASE + '/relatorios/lead-individual'); await espera(500);
  ok('Lead Individual: opção "Super Admin (meus leads)"', (await p.locator('#rel-conta option').allInnerTexts()).includes('Super Admin (meus leads)'));
  await p.selectOption('#rel-conta', SA); await espera(800);
  ok('Leads do Super Admin', (await total(p)) === Number(sql(`select count(*) from "Lead" where "usuarioId"='${SA}'`)));
  await p.selectOption('#rel-conta', USU); await espera(800);
  ok('Lead Individual do usuário', (await total(p)) === Number(sql(`select count(*) from "Lead" where "usuarioId"='${USU}'`)));

  // ===== 5. Campanhas =====
  await p.goto(BASE + '/relatorios/campanhas?conta=e:' + EMP); await espera(800);
  linhas = await tabela(p);
  const linha = linhas.find((l) => l.includes('Relatório 11')) ?? '';
  const nums = linha.split('\t').map((x) => x.trim());
  // Data, Campanha, Empresa, Usuário, Status, Leads, Enviadas, Falhas, Puladas, Respostas, Taxa, Sair
  ok('Campanhas: enviadas 3, falhas 1, puladas 1, respostas 1, taxa 33,3%, saíram 1', nums[6] === '3' && nums[7] === '1' && nums[8] === '1' && nums[9] === '1' && nums[10] === '33,3%' && nums[11] === '1', nums.join('|'));
  ok('Campanhas: linha de total', linhas.at(-1).startsWith('\tTotal') || linhas.at(-1).includes('Total'));
  await p.screenshot({ path: OUT + '/rel-campanhas.png', fullPage: true });
  await c.close();

  // ===== 6. Só o Super Admin =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  await p.goto(BASE + '/relatorios/empresarial'); await espera(500);
  ok('Admin da Empresa não abre relatórios', !p.url().includes('/relatorios'));
  ok('Excel recusa quem não é Super Admin', (await p.request.get(BASE + '/api/relatorios/empresarial?conta=' + EMP)).status() === 403);
  await c.close();

  // Login continua idêntico
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1500);
  await p.screenshot({ path: OUT + '/login.png' });
  await c.close();
  await b.close();

  sql(`delete from "Campanha" where assunto='Relatório 11'`);
  sql(`delete from "Lead" where codigo like 'TR11-%'`);
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FALHOU')).length;
  console.log(`\n${res.length - f}/${res.length} passaram`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
