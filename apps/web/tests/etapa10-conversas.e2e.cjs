// Teste de ponta a ponta da etapa 10 (Conversas IA — decisão #92).
// As respostas automáticas da IA são testadas no serviço 24/7 (apps/worker/tests/conversas.test.ts);
// aqui as conversas são criadas direto no banco e a tela é conferida.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado basta) e Postgres com seed.
// Uso: node apps/web/tests/etapa10-conversas.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 40) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'], status='ATIVO', "iaConversas"=true where id='${ANA}'`);
  sql(`delete from "Lead" where codigo like 'TC10-%'`);
  // 3 conversas da Ana
  sql(`insert into "Lead"(id,codigo,nome,telefone,status,"usuarioId","empresaId","codigoUsuario","codigoEmpresa","ultimaMensagemEm","naoLidas",qualificacao,"qualificacaoMotivo","atualizadoEm") values
    ('tc10-1','TC10-1','Maria Quente','5519990000001','QUALIFICADO','${ANA}','${EMP}','x','x',now(),2,'QUENTE','Quer agendar sábado',now()),
    ('tc10-2','TC10-2','João Objeção','5519990000002','OBJECAO','${ANA}','${EMP}','x','x',now()-interval '1 hour',0,'MORNO',null,now()),
    ('tc10-3','TC10-3','Pedro Frio','5519990000003','EM_CONVERSA','${ANA}','${EMP}','x','x',now()-interval '2 hours',0,'FRIO',null,now())`);
  sql(`insert into "Mensagem"(id,"leadId",autor,texto,tipo,"criadoEm") values
    ('tm10-1','tc10-1','CAMPANHA','Bom dia Maria, tudo bem? Temos horários livres.','texto',now()-interval '10 minutes'),
    ('tm10-2','tc10-1','LEAD','Quero agendar para sábado','texto',now()-interval '5 minutes'),
    ('tm10-3','tc10-1','IA','Ótimo! Qual o melhor horário para você?','texto',now()-interval '4 minutes'),
    ('tm10-4','tc10-1','LEAD','','audio',now()-interval '1 minute'),
    ('tm10-5','tc10-2','LEAD','Achei caro','texto',now()-interval '1 hour'),
    ('tm10-6','tc10-3','LEAD','Só estou olhando','texto',now()-interval '2 hours')`);

  const b = await chromium.launch();
  const novo = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };

  // ===== 1. Usuário: lista, conversa, filtros, assumir/devolver, status e temperatura =====
  let [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
  await p.click('aside nav >> text=Conversas IA'); await p.waitForURL('**/conversas'); await espera(600);
  const itens = await p.locator('[data-testid=lista-conversas] li').allInnerTexts();
  ok('Lista com as 3 conversas, a mais recente primeiro', itens.length === 3 && itens[0].includes('Maria Quente'), itens.map((x) => x.split('\n')[0]).join(' | '));
  ok('Lista mostra temperatura e não lidas', itens[0].includes('Quente') && (await p.locator('[data-testid=nao-lidas]').first().innerText()) === '2');
  await p.click('text=Maria Quente'); await p.waitForURL('**lead=tc10-1'); await espera(800);
  const autores = await p.locator('[data-testid=conversa] [data-autor]').evaluateAll((e) => e.map((x) => x.getAttribute('data-autor')));
  ok('Histórico em ordem: campanha, lead, IA, áudio', JSON.stringify(autores) === JSON.stringify(['CAMPANHA', 'LEAD', 'IA', 'LEAD']), autores.join(','));
  ok('Áudio aparece identificado', (await p.locator('[data-testid=conversa] >> text=🎤 Áudio').count()) === 1);
  ok('Abrir a conversa zera as não lidas', await ate(() => sql(`select "naoLidas" from "Lead" where id='tc10-1'`) === '0'));
  await p.screenshot({ path: OUT + '/conversas-usuario.png' });

  await p.click('button:has-text("Assumir conversa")');
  ok('"Assumir conversa" pausa a IA', await ate(() => sql(`select "iaPausada" from "Lead" where id='tc10-1'`) === 't'));
  await espera(800);
  ok('Aviso de IA pausada na conversa', (await p.locator('[data-testid=aviso-pausa]').count()) === 1);
  await p.waitForSelector('button:has-text("Devolver para a IA")'); await p.click('button:has-text("Devolver para a IA")');
  ok('"Devolver para a IA" retoma', await ate(() => sql(`select "iaPausada"||'|'||coalesce("iaPausaMotivo",'') from "Lead" where id='tc10-1'`) === 'false|'));
  await espera(600);
  await p.selectOption('select[aria-label="Status do lead"]', 'VENDA_CONCLUIDA');
  ok('Usuário marca Venda concluída', await ate(() => sql(`select status from "Lead" where id='tc10-1'`) === 'VENDA_CONCLUIDA'));
  await espera(600);
  await p.selectOption('select[aria-label=Temperatura]', 'MORNO');
  ok('Usuário muda a temperatura', await ate(() => sql(`select qualificacao from "Lead" where id='tc10-1'`) === 'MORNO'));
  // Enviar com o WhatsApp desconectado: mensagem clara, nada gravado
  await espera(600);
  await p.fill('#conv-texto', 'Olá Maria, aqui é a Ana!'); await p.click('button:has-text("Enviar")');
  ok('Sem WhatsApp conectado, avisa e não grava', await ate(async () => (await p.locator('text=/desconectado/').count()) >= 1) && sql(`select count(*) from "Mensagem" where "leadId"='tc10-1' and autor='USUARIO'`) === '0');
  // Filtros
  await p.selectOption('select[aria-label="Filtrar por temperatura"]', 'FRIO'); await espera(1200);
  let lista = await p.locator('[data-testid=lista-conversas] li').allInnerTexts();
  ok('Filtro por temperatura', lista.length === 1 && lista[0].includes('Pedro Frio'), lista.length + '');
  await p.selectOption('select[aria-label="Filtrar por temperatura"]', ''); await espera(1200); await p.selectOption('select[aria-label="Filtrar por status"]', 'OBJECAO'); await espera(1200);
  lista = await p.locator('[data-testid=lista-conversas] li').allInnerTexts();
  ok('Filtro por status', lista.length === 1 && lista[0].includes('João'), lista.length + '');
  await p.selectOption('select[aria-label="Filtrar por status"]', ''); await espera(1200);
  await p.fill('input[aria-label="Buscar conversa"]', '5519990000003'); await p.click('button:has-text("Buscar")'); await espera(1200);
  lista = await p.locator('[data-testid=lista-conversas] li').allInnerTexts();
  ok('Busca por telefone', lista.length === 1 && lista[0].includes('Pedro'), lista.length + '');
  // Liga/desliga geral
  await p.locator('[data-testid=ia-geral]').click();
  ok('Desligar "IA responde sozinha"', await ate(() => sql(`select "iaConversas" from "Usuario" where id='${ANA}'`) === 'f'));
  await espera(1200); await p.locator('[data-testid=ia-geral]').click();
  ok('Ligar de novo', await ate(() => sql(`select "iaConversas" from "Usuario" where id='${ANA}'`) === 't'));

  // Rolagem (decisão #136): a página rola só até a busca encostar no topo; lista e mensagens rolam sozinhas;
  // busca, cabeçalho da conversa e caixa de escrever ficam visíveis
  sql(`insert into "Mensagem"(id,"leadId",autor,texto,tipo,"criadoEm") select 'tm10-rol-'||g,'tc10-2',(case when g%2=0 then 'LEAD' else 'IA' end)::"AutorMensagem",'Mensagem '||g||' do teste de rolagem.','texto',now()-((40-g)||' seconds')::interval from generate_series(1,30) g`);
  await p.goto(BASE + '/conversas?lead=tc10-2'); await espera(1200);
  await p.evaluate(() => window.scrollTo(0, 99999)); await espera(500);
  const rol = await p.evaluate(() => {
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.height > 0; };
    const area = document.querySelector('[data-testid=conversa] .overflow-y-auto');
    return { busca: vis(document.querySelector('[aria-label="Buscar conversa"]')), cabecalho: vis(document.querySelector('[data-testid=conversa] b')),
      caixa: vis(document.querySelector('#conv-texto')), enviar: vis([...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Enviar')),
      rolaDentro: !!area && area.scrollHeight > area.clientHeight, naMaisRecente: !!area && Math.abs(area.scrollTop + area.clientHeight - area.scrollHeight) < 4 };
  });
  ok('Rolagem: busca, cabeçalho da conversa e caixa de escrever continuam visíveis', rol.busca && rol.cabecalho && rol.caixa && rol.enviar, JSON.stringify(rol));
  ok('Rolagem: as mensagens rolam dentro do quadro e abrem na mais recente', rol.rolaDentro && rol.naMaisRecente);
  await p.screenshot({ path: OUT + '/conversas-rolagem.png' });
  sql(`delete from "Mensagem" where id like 'tm10-rol-%'`);
  await c.close();

  // Celular: lista e conversa em telas separadas
  [c, p] = await novo({ width: 390, height: 844 });
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
  await p.goto(BASE + '/conversas?lead=tc10-2'); await espera(800);
  ok('Celular: conversa ocupa a tela, sem rolagem lateral', (await p.locator('[data-testid=conversa]').isVisible()) && (await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
  await p.screenshot({ path: OUT + '/conversas-celular.png' });
  await c.close();

  // Sem a permissão "conversas"
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','arquivos','empresa-ia'] where id='${ANA}'`);
  [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');
  await p.goto(BASE + '/conversas'); await espera(600);
  ok('Sem a permissão, não abre Conversas IA', !p.url().includes('/conversas'));
  await c.close();
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'] where id='${ANA}'`);

  // ===== 2. Admin da Empresa: vê as da empresa, só leitura =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Business');
  ok('Menu do Admin tem Conversas IA', (await p.locator('aside nav >> text=Conversas IA').count()) === 1);
  await p.goto(BASE + '/conversas?lead=tc10-2'); await espera(800);
  ok('Admin vê as conversas da empresa, com o usuário', (await p.locator('[data-testid=lista-conversas] li').count()) >= 3 && (await p.locator('text=Usuário: Ana').count()) >= 1);
  ok('Admin: somente leitura (sem enviar, assumir ou IA)', (await p.locator('text=Somente leitura: só o usuário dono do lead responde.').count()) === 1 && (await p.locator('button:has-text("Assumir conversa")').count()) === 0 && (await p.locator('[data-testid=ia-geral]').count()) === 0);
  await p.screenshot({ path: OUT + '/conversas-admin.png' });
  await c.close();

  // ===== 3. Super Admin: vê tudo, responde só as dele =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Menu do Super Admin tem Conversas IA', (await p.locator('aside nav >> text=Conversas IA').count()) === 1);
  await p.goto(BASE + '/conversas?lead=tc10-3'); await espera(800);
  ok('Super Admin vê conversa de outro usuário só para ler', (await p.locator('text=Somente leitura: só o usuário dono do lead responde.').count()) === 1 && (await p.locator('[data-testid=ia-geral]').count()) === 1);
  await c.close();

  // ===== 4. Empresa | IA: campo "Como qualificar" =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Business');
  await p.goto(BASE + '/empresa-ia'); await espera(600);
  // "Como qualificar" abre o editor grande em popup (decisão #120)
  await p.click('#ei-qualificar');
  const editor = p.locator('[data-testid=editor-comoQualificar]');
  const caixa = await editor.locator('textarea').boundingBox();
  ok('Clicar no campo abre o editor grande no meio da tela', (await editor.count()) === 1 && caixa && caixa.height >= 350 && caixa.width >= 600, caixa ? `${Math.round(caixa.width)}x${Math.round(caixa.height)}` : 'sem popup');
  await editor.locator('textarea').fill('Texto que vai ser descartado'); await p.click('[data-testid=editor-comoQualificar] >> button:has-text("Cancelar")');
  ok('Cancelar fecha o popup sem mudar o campo', (await editor.count()) === 0 && (await p.inputValue('#ei-qualificar')) !== 'Texto que vai ser descartado');
  // Botão "Texto sugestão" (decisão #121): preenche o texto padrão e pede para trocar os colchetes
  await p.click('#ei-qualificar'); await editor.locator('textarea').fill('Texto antigo');
  const dialogos = []; p.on('dialog', (d) => dialogos.push(d.message()));
  await p.click('[data-testid=sugestao-comoQualificar]');
  const sug = await editor.locator('textarea').inputValue();
  ok('Texto sugestão preenche o campo com o texto padrão', sug.startsWith('Você é [NOME DA IA], atendente virtual') && sug.length > 6000, String(sug.length));
  ok('Pergunta antes de substituir o texto que já estava escrito', dialogos.some((m) => m.includes('Substituir o texto atual')));
  ok('Faixa amarela pede para trocar os colchetes', (await p.locator('[data-testid=aviso-colchetes-comoQualificar]').count()) === 1);
  await p.screenshot({ path: OUT + '/empresa-ia-sugestao.png' });
  await editor.locator('textarea').fill('Pergunte o tipo de clínica e quantas salas.');
  ok('Sem colchetes, a faixa amarela some', (await p.locator('[data-testid=aviso-colchetes-comoQualificar]').count()) === 0);
  await p.click('[data-testid=salvar-comoQualificar]');
  ok('"Como qualificar" salvo no Empresa | IA', await ate(() => sql(`select "comoQualificar" from "FichaEmpresa" where "empresaId"='${EMP}'`) === 'Pergunte o tipo de clínica e quantas salas.'));
  await c.close();

  // Login continua idêntico
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1500);
  await p.screenshot({ path: OUT + '/login.png' });
  await c.close();

  await b.close();
  sql(`delete from "Lead" where codigo like 'TC10-%'`);
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FALHOU')).length;
  console.log(`\n${res.length - f}/${res.length} passaram`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
