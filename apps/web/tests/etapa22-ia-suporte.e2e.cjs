// Teste de ponta a ponta da IA no suporte dos clientes (decisão #146), com a IA "simulado".
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa22-ia-suporte.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (f, ms = 15000) => { for (let i = 0; i < ms / 300; i++) { if (await f()) return true; await espera(300); } return false; };

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const configIA = sql(`select provedor||'|'||modelo from "ConfigIA" where tarefa='conversar'`);
  const ligadaAntes = sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) || 'f';
  sql(`delete from "SuporteConversa"`);
  // IA simulada (sem custo) durante o teste
  if (configIA) sql(`update "ConfigIA" set provedor='simulado', modelo='simulado', chave=null where tarefa='conversar'`);
  else sql(`insert into "ConfigIA"(tarefa,provedor,modelo,"urlBase","precoEntrada","precoSaida","atualizadoEm") values ('conversar','simulado','simulado','',0,0,now())`);
  sql(`update "ConfigVenda" set "iaSuporteLigada"=false where id='config'`);
  // Estado anterior dos 4 pontos (como o vigia do serviço já teria guardado): Suporte desligado, os outros ligados
  sql(`delete from "EstadoIAPonto"`);
  for (const [p, e] of [['LEADS', 'VERDE'], ['CAMPANHAS', 'VERDE'], ['SUPORTE', 'VERMELHO'], ['VISITANTE', 'VERDE']]) sql(`insert into "EstadoIAPonto"(ponto,estado,"atualizadoEm") values ('${p}','${e}',now())`);

  const b = await chromium.launch();
  const novo = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const escrever = async (p, texto) => { await p.fill('[aria-label="Mensagem para o suporte"]', texto); await p.click('[data-testid=janela-suporte] button:has-text("Enviar")'); };
  const ia = () => Number(sql(`select count(*) from "SuporteMensagem" m join "SuporteConversa" c on c.id=m."conversaId" where c."usuarioId"='${ANA}' and m.autor='IA'`));

  try {
    const [cS, pS] = await novo(); await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    const [cU, pU] = await novo(); await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Business');

    // ===== Chave geral: começa desligada =====
    await pS.goto(BASE + '/atendimento'); await espera(800);
    ok('Chave da IA no suporte começa desligada (estado no Atendimento)', (await pS.locator('[data-testid=ia-suporte-estado]').innerText()) === 'Desligado');
    // Desligada: cliente escreve e a IA NÃO responde
    await pU.click('[data-testid=botao-suporte]');
    await escrever(pU, 'Como conecto o meu WhatsApp?'); await espera(6500);
    ok('Com a IA desligada, ninguém responde sozinho', ia() === 0);

    // ===== Liga a chave =====
    await pS.goto(BASE + '/inteligencia-artificial'); await espera(1200);
    ok('No menu Inteligência Artificial o Suporte aparece vermelho (desligado)', (await pS.locator('[data-testid=ia-ponto-SUPORTE]').getAttribute('data-cor')) === 'VERMELHO');
    await pS.click('[data-testid=ia-ponto-alternar-SUPORTE]'); await espera(2500);
    ok('Ligar a IA grava a chave geral', sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) === 't');
    ok('A tela mostra o Suporte verde (ligado)', (await pS.locator('[data-testid=ia-ponto-SUPORTE]').getAttribute('data-cor')) === 'VERDE');
    // Ao ligar, a IA responde quem ficou esperando (a pergunta feita com a IA desligada)
    ok('Ao ligar, a IA responde quem ficou esperando', await ate(() => ia() === 1, 12000));
    ok('A conversa não recebeu resposta repetida', ia() === 1);

    // ===== IA responde =====
    await escrever(pU, 'Como conecto o meu WhatsApp?');
    ok('A IA responde o cliente em poucos segundos', await ate(() => ia() === 2));
    ok('Cliente vê a resposta com o rótulo "Assistente virtual (IA)"', await ate(async () => (await pU.locator('[data-testid=janela-suporte] >> text=Assistente virtual (IA)').count()) >= 1, 8000));
    ok('A resposta usa o manual (QR Code)', (await pU.locator('[data-testid=janela-suporte] >> text=QR Code').count()) >= 1);
    ok('Conversa segue com a IA atendendo', sql(`select "iaPausada" from "SuporteConversa" where "usuarioId"='${ANA}'`) === 'f');
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1500);
    ok('Super Admin vê "IA atendendo" e a mensagem da IA do lado dele', (await pS.locator('[data-testid=ia-suporte-conversa]').innerText()) === 'IA atendendo' && (await pS.locator('[data-testid=chat-mensagens] >> text=QR Code').count()) >= 1);
    await pS.screenshot({ path: OUT + '/ia-suporte-atendendo.png' });

    // ===== Assunto sensível: passa para o atendente, sem IA =====
    await escrever(pU, 'Quero cancelar o meu plano');
    ok('Assunto sensível: avisa o cliente que um atendente vai responder', await ate(async () => (await pU.locator('[data-testid=janela-suporte] >> text=Vou chamar um atendente').count()) >= 1, 12000));
    ok('A IA pausou com o motivo', await ate(() => /Assunto que fica com o atendente/.test(sql(`select coalesce("iaPausaMotivo",'') from "SuporteConversa" where "usuarioId"='${ANA}'`)), 4000));
    const antes = ia();
    await escrever(pU, 'Alguém aí?'); await espera(6500);
    ok('Com a IA pausada, nova mensagem não é respondida por ela', ia() === antes);
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1500);
    ok('Super Admin vê "Com você" e o motivo', /Com você/.test(await pS.locator('[data-testid=ia-suporte-conversa]').innerText()));
    await pS.screenshot({ path: OUT + '/ia-suporte-com-voce.png' });

    // ===== Devolver para a IA =====
    await pS.click('[data-testid=painel-chat] button:has-text("Devolver para a IA")'); await espera(1500);
    ok('Devolver para a IA tira a pausa', sql(`select "iaPausada" from "SuporteConversa" where "usuarioId"='${ANA}'`) === 'f');

    // ===== Super Admin escreve: assume =====
    await pS.goto(BASE + `/atendimento?cliente=${ANA}`); await espera(1200);
    await pS.fill('[aria-label="Mensagem para o suporte"]', 'Oi, aqui é o suporte. Já vejo isso para você.');
    await pS.click('[data-testid=chat-suporte] button:has-text("Enviar")'); await espera(1200);
    const assumida = sql(`select "iaPausada"||'|'||coalesce("iaPausaMotivo",'') from "SuporteConversa" where "usuarioId"='${ANA}'`);
    ok('Quando o Super Admin escreve, a IA pausa (assumida)', assumida === 'true|Assumida pelo Super Admin', assumida + ' / msgs: ' + sql(`select string_agg(autor,',' order by "criadoEm") from "SuporteMensagem" m join "SuporteConversa" c on c.id=m."conversaId" where c."usuarioId"='${ANA}'`));

    // ===== Orientações do suporte (decisão #148): só o Super Admin, salvar, texto sugestão e testar =====
    const SAID = sql(`select id from "Usuario" where email='superadmin@disparopro.com.br'`);
    const orientAntes = sql(`select "orientacoesSuporte" from "FichaEmpresa" where "superAdminId"='${SAID}'`);
    sql(`update "FichaEmpresa" set "orientacoesSuporte"='' where "superAdminId"='${SAID}'`);
    await pS.goto(BASE + '/empresa-ia'); await espera(1200);
    ok('Super Admin vê o cartão "Orientações do suporte"', (await pS.locator('[data-testid=orientacoes-suporte]').count()) === 1);
    await pS.click('#ei-orientacoes'); await espera(500);
    await pS.click('[data-testid=sugestao-orientacoes]'); await espera(300);
    const sug = await pS.locator('[data-testid=editor-orientacoes] textarea').inputValue();
    ok('"Texto sugestão" preenche o modelo (horário, perguntas e regras)', /HORÁRIO E CANAIS/.test(sug) && /PERGUNTAS FREQUENTES/.test(sug) && /REGRAS DE ATENDIMENTO/.test(sug));
    await pS.keyboard.press('Escape'); await espera(300);
    // Escreve as orientações e salva
    await pS.click('#ei-orientacoes'); await espera(400);
    await pS.locator('[data-testid=editor-orientacoes] textarea').fill('Atendemos de segunda a sexta, das 9h às 18h. ORIENT-E2E-148');
    await pS.click('[data-testid=salvar-orientacoes]'); await espera(1500);
    const salvo = sql(`select "orientacoesSuporte" from "FichaEmpresa" where "superAdminId"='${SAID}'`);
    ok('Salvar grava as orientações do Super Admin', /ORIENT-E2E-148/.test(salvo), salvo.slice(0, 60));
    ok('Salvar as orientações não refaz a ficha (não mexe no resumo)', sql(`select count(*) from "FichaEmpresa" where "superAdminId"='${SAID}' and montando`) === '0');
    // Testar uma pergunta
    await pS.goto(BASE + '/empresa-ia'); await espera(1200);
    await pS.fill('[data-testid=pergunta-teste]', 'Como conecto o meu WhatsApp?'); await pS.click('[data-testid=testar-pergunta]');
    ok('Testar mostra a resposta da IA', await ate(async () => (await pS.locator('[data-testid=teste-resposta]').count()) === 1, 15000) && /QR Code/.test(await pS.locator('[data-testid=teste-resposta]').innerText()));
    ok('Pergunta comum não vai para o atendente', (await pS.locator('[data-testid=teste-atendente]').count()) === 0);
    await pS.fill('[data-testid=pergunta-teste]', 'Preciso cancelar tudo TESTE-TELA-148'); await pS.click('[data-testid=testar-pergunta]');
    ok('Assunto sensível: mostra "iria para o atendente"', await ate(async () => (await pS.locator('[data-testid=teste-atendente]').count()) === 1, 15000) && /atendente/.test(await pS.locator('[data-testid=teste-atendente]').innerText()));
    ok('O teste não cria conversa nem mensagem', sql(`select count(*) from "SuporteMensagem" where texto like '%TESTE-TELA-148%'`) === '0');
    await pS.screenshot({ path: OUT + '/orientacoes-suporte.png', fullPage: true });
    // Limite de tamanho: o servidor corta em 6.000
    await pS.click('#ei-orientacoes'); await espera(400);
    ok('Editor limitado a 6.000 caracteres', (await pS.locator('[data-testid=editor-orientacoes] textarea').getAttribute('maxlength')) === '6000');
    await pS.keyboard.press('Escape'); await espera(300);
    // Quem não é Super Admin não vê o cartão
    await pU.goto(BASE + '/empresa-ia'); await espera(1200);
    ok('Usuário comum não vê as orientações do suporte', (await pU.locator('[data-testid=orientacoes-suporte]').count()) === 0);
    sql(`update "FichaEmpresa" set "orientacoesSuporte"='${orientAntes.replace(/'/g, "''")}' where "superAdminId"='${SAID}'`);

    // ===== Desligar a chave =====
    await pS.goto(BASE + '/inteligencia-artificial'); await espera(1000);
    await pS.click('[data-testid=ia-ponto-alternar-SUPORTE]'); await espera(1500);
    ok('Desligar a IA grava a chave geral', sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) === 'f');

    // ===== Controle de acesso: cliente não liga a IA =====
    const r = await pU.evaluate(async () => (await fetch('/api/ia/pontos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ponto: 'SUPORTE', ligada: true }) })).status);
    ok('Cliente não consegue ligar a chave geral', r !== 200 && sql(`select "iaSuporteLigada" from "ConfigVenda" where id='config'`) === 'f', String(r));
    await cS.close(); await cU.close();
  } finally {
    await b.close();
    sql(`update "ConfigVenda" set "iaSuporteLigada"=${ligadaAntes === 't' ? 'true' : 'false'} where id='config'`);
    if (configIA) { const [p, m] = configIA.split('|'); sql(`update "ConfigIA" set provedor='${p}', modelo='${m}' where tarefa='conversar'`); } else sql(`delete from "ConfigIA" where tarefa='conversar'`);
    sql(`delete from "SuporteConversa"`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
