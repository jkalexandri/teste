// Teste de ponta a ponta da etapa 10b (avisos e leads de anúncios — decisões #81, #82, #84, #90 e #94).
// O atendimento da IA e os resumos de avisos são testados no serviço 24/7 (apps/worker/tests/anuncios.test.ts).
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado basta) e Postgres com seed.
// Uso: node apps/web/tests/etapa10b-avisos-anuncios.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const IND = 'teste-conta-individual', EMP = 'teste-empresa-exemplo';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 40) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };
const postar = (url, corpo, tipo = 'application/json') => fetch(url, { method: 'POST', headers: { 'content-type': tipo }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });

(async () => {
  const USU = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  sql(`update "Empresa" set "leadsAnuncios"=false where id='${IND}'`);
  sql(`update "Usuario" set "tokenAnuncios"=null, "numeroAvisos"=null, "avisoQuente"=true, "avisoAnuncio"=true, "avisoRespondeu"=true where id='${USU}'`);
  sql(`delete from "LeadAnuncio" where "usuarioId"='${USU}'`);
  sql(`delete from "Lead" where "usuarioId"='${USU}' and telefone in ('5521987650001','5521987650002')`);
  sql(`insert into "ConfigIA"(tarefa,provedor,modelo,"urlBase","precoEntrada","precoSaida","atualizadoEm") values ('conversar','simulado','simulado','',0,0,now()) on conflict (tarefa) do update set provedor='simulado', modelo='simulado', chave=null`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };

  // ===== 1. Fora do plano =====
  let [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  ok('Menu do usuário tem Avisos e Leads de anúncios', (await p.locator('aside nav >> text=Avisos').count()) === 1 && (await p.locator('aside nav >> text=Leads de anúncios').count()) === 1);
  await p.goto(BASE + '/leads-anuncios'); await espera(500);
  ok('Sem o recurso no plano: mostra que não está incluído', (await p.locator('[data-testid=fora-do-plano]').count()) === 1);
  await c.close();
  // Endereço gerado antes de perder o recurso continua recusando
  sql(`update "Usuario" set "tokenAnuncios"='token-teste-fora-do-plano-123456' where id='${USU}'`);
  let r = await postar(`${BASE}/api/anuncios/token-teste-fora-do-plano-123456`, { nome: 'X', telefone: '21987650009' });
  ok('Endereço de conta sem o recurso responde 402 e registra "Fora do plano"', r.status === 402 && sql(`select status from "LeadAnuncio" where "usuarioId"='${USU}' order by "recebidoEm" desc limit 1`) === 'SEM_RECURSO');
  sql(`update "Usuario" set "tokenAnuncios"=null where id='${USU}'`);

  // ===== 2. Super Admin: plano e liga por conta =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Menu do Super Admin tem Avisos e Leads de anúncios', (await p.locator('aside nav >> text=Avisos').count()) === 1 && (await p.locator('aside nav >> text=Leads de anúncios').count()) === 1);
  await p.goto(BASE + '/planos'); await espera(500);
  await p.locator('button:has-text("Editar")').first().click(); await p.waitForSelector('[role=dialog]');
  const planoNome = await p.inputValue('#f-nome');
  const antes = sql(`select "leadsAnuncios" from "Plano" where nome='${planoNome}'`);
  await p.locator('#f-leadsAnuncios').click(); await p.click('button:has-text("Salvar plano")');
  ok('Plano: "Leads de anúncios incluído" salvo', await ate(() => sql(`select "leadsAnuncios" from "Plano" where nome='${planoNome}'`) !== antes));
  sql(`update "Plano" set "leadsAnuncios"=${antes === 't'} where nome='${planoNome}'`);
  await p.goto(BASE + '/usuarios-individuais'); await espera(600);
  await p.locator('tr', { has: p.locator('text=usuario@disparopro.com.br') }).locator('[data-testid=anuncios-conta]').click();
  ok('Super Admin liga leads de anúncios na conta', await ate(() => sql(`select "leadsAnuncios" from "Empresa" where id='${IND}'`) === 't'));
  await p.goto(BASE + '/empresas'); await espera(600);
  ok('Botão também em Empresas', (await p.locator('[data-testid=anuncios-conta]').count()) > 0);
  await c.close();

  // ===== 3. Usuário: endereço e recebimento =====
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await p.goto(BASE + '/leads-anuncios'); await espera(500);
  await p.click('button:has-text("Gerar meu endereço")');
  ok('Endereço secreto gerado', await ate(async () => (await p.locator('[data-testid=endereco]').count()) === 1));
  const endereco = await p.inputValue('[data-testid=endereco]');
  ok('Endereço no domínio do site', /\/api\/anuncios\/[A-Za-z0-9_-]{30,}$/.test(endereco), endereco.replace(/[A-Za-z0-9_-]{30,}$/, '…'));
  const url = BASE + new URL(endereco).pathname;
  // Google Ads
  r = await postar(url, { lead_id: 'x1', api_version: '1.0', form_id: 1, campaign_id: 2, google_key: 'qualquer', is_test: true,
    user_column_data: [{ column_id: 'FULL_NAME', string_value: 'Lucas Prado' }, { column_id: 'PHONE_NUMBER', string_value: '+55 21 98765-0001' }, { column_id: 'EMAIL', string_value: 'lucas@x.com' }, { column_name: 'Qual serviço?', string_value: 'Clareamento' }] });
  ok('Google Ads: lead aceito (200)', r.status === 200);
  ok('Google Ads: lead cadastrado com código e telefone', await ate(() => /^L\d{5,}\|Lucas Prado$/.test(sql(`select codigo||'|'||nome from "Lead" where "usuarioId"='${USU}' and telefone='5521987650001'`))));
  ok('Formulário guardado com origem e assunto', sql(`select origem||'|'||(assunto like '%Clareamento%') from "LeadAnuncio" where telefone='5521987650001'`) === 'google|true');
  ok('WhatsApp desconectado: lead fica esperando (#84)', await ate(() => sql(`select status from "LeadAnuncio" where telefone='5521987650001'`) === 'AGUARDANDO_WHATSAPP'));
  // Make/Zapier (formato livre) e sem telefone
  r = await postar(url, { nome: 'Rita', telefone: '(21) 98765-0002', assunto: 'Quero orçamento' });
  ok('Make/Zapier: lead aceito', r.status === 200 && await ate(() => sql(`select count(*) from "Lead" where "usuarioId"='${USU}' and telefone='5521987650002'`) === '1'));
  r = await postar(url, { nome: 'Sem Fone', email: 's@x.com' });
  ok('Sem telefone: não vira lead e aparece como "Sem telefone"', r.status === 200 && sql(`select status from "LeadAnuncio" where nome='Sem Fone'`) === 'SEM_TELEFONE');
  r = await postar(url, 'nome=Form&telefone=21987650002', 'application/x-www-form-urlencoded');
  ok('Mesmo telefone de novo: não duplica o lead', r.status === 200 && sql(`select count(*) from "Lead" where "usuarioId"='${USU}' and telefone='5521987650002'`) === '1');
  r = await postar(url, 'isso não é json');
  ok('Corpo inválido: 400', r.status === 400);
  r = await postar(`${BASE}/api/anuncios/endereco-que-nao-existe-123456789`, { telefone: '21987650003' });
  ok('Endereço inexistente: 404', r.status === 404);
  await p.reload(); await espera(800);
  const linhas = await p.locator('[data-testid=recebidos] tbody tr').allInnerTexts();
  ok('Lista mostra os recebidos com a situação', linhas.length >= 4 && linhas.some((l) => l.includes('Esperando o WhatsApp')) && linhas.some((l) => l.includes('Sem telefone')) && linhas.some((l) => l.includes('Google Ads')), linhas.length + '');
  await p.screenshot({ path: OUT + '/leads-anuncios.png', fullPage: true });
  // Gerar novo endereço: o antigo para de funcionar
  await p.click('button:has-text("Gerar novo endereço")'); await espera(1200);
  r = await postar(url, { telefone: '21987650004' });
  ok('Gerar novo endereço desativa o antigo', r.status === 404 && (await p.inputValue('[data-testid=endereco]')) !== endereco);

  // ===== 4. Avisos =====
  await p.goto(BASE + '/avisos'); await espera(500);
  await p.fill('#numeroAvisos', '123'); await p.click('button:has-text("Salvar")'); await espera(800);
  ok('Número inválido é recusado', sql(`select coalesce("numeroAvisos",'') from "Usuario" where id='${USU}'`) === '');
  await p.fill('#numeroAvisos', '(21) 99876-5432'); await p.locator('input[name=avisoRespondeu]').uncheck(); await p.click('button:has-text("Salvar")');
  ok('Número e liga/desliga salvos', await ate(() => sql(`select "numeroAvisos"||'|'||"avisoQuente"||'|'||"avisoRespondeu" from "Usuario" where id='${USU}'`) === '5521998765432|true|false'));
  await p.click('button:has-text("Enviar aviso de teste")');
  ok('Aviso de teste responde (sem o número da plataforma conectado, explica)', await ate(async () => (await p.locator('text=/Aviso de teste enviado|Não foi possível enviar/').count()) >= 1));
  await p.screenshot({ path: OUT + '/avisos.png', fullPage: true });
  await c.close();

  // Admin da Empresa: tem Avisos, não tem Leads de anúncios
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  ok('Admin: Avisos sim, Leads de anúncios não', (await p.locator('aside nav >> text=Avisos').count()) === 1 && (await p.locator('aside nav >> text=Leads de anúncios').count()) === 0);
  await p.goto(BASE + '/avisos'); await espera(400);
  ok('Admin: tela explica que recebe os avisos de todos os usuários', (await p.locator('text=de todos os usuários da empresa').count()) === 1);
  await p.goto(BASE + '/leads-anuncios'); await espera(400);
  ok('Admin não abre Leads de anúncios', !p.url().includes('/leads-anuncios'));
  await c.close();

  // Login continua idêntico
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1500);
  await p.screenshot({ path: OUT + '/login.png' });
  await c.close();
  await b.close();

  // Limpeza
  sql(`delete from "LeadAnuncio" where "usuarioId"='${USU}'`);
  sql(`delete from "Lead" where "usuarioId"='${USU}' and telefone in ('5521987650001','5521987650002')`);
  sql(`update "Empresa" set "leadsAnuncios"=false where id='${IND}'`);
  sql(`update "Usuario" set "tokenAnuncios"=null, "numeroAvisos"=null, "avisoRespondeu"=true where id='${USU}'`);
  sql(`delete from "ConfigIA" where tarefa='conversar'`);
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FALHOU')).length;
  console.log(`\n${res.length - f}/${res.length} passaram`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
