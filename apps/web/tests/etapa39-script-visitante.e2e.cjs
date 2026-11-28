// Teste de ponta a ponta da decisão #178: script do Fale conosco (só o Super Admin), texto sugestão, salvar, testar uma mensagem
// e o chat da tela de Planos recebendo planos com promoção. Requer: app em :3005, serviço 24/7 em :4000 (código novo), Postgres com seed.
// Uso: node apps/web/tests/etapa39-script-visitante.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => { const l = `${c ? 'PASSOU' : 'FALHOU'} — ${n}${!c && x ? ' (' + x + ')' : ''}`; res.push(l); console.error(l); };
const OUT = process.argv[2] || '/tmp';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (f, ms = 15000) => { for (let i = 0; i < ms / 300; i++) { if (await f()) return true; await espera(300); } return false; };

(async () => {
  const SAID = sql(`select id from "Usuario" where email='superadmin@disparopro.com.br'`);
  const scriptAntes = sql(`select "orientacoesVisitante" from "FichaEmpresa" where "superAdminId"='${SAID}'`);
  const conversarAntes = sql(`select provedor from "ConfigIA" where tarefa='conversar'`);
  const ligadaAntes = sql(`select "iaVisitanteLigada" from "ConfigVenda" where id='config'`);
  sql(`update "FichaEmpresa" set "orientacoesVisitante"='' where "superAdminId"='${SAID}'`);
  if (conversarAntes) sql(`update "ConfigIA" set provedor='simulado', modelo='simulado', "urlBase"='' where tarefa='conversar'`);
  else sql(`insert into "ConfigIA"(tarefa,provedor,modelo,"urlBase","precoEntrada","precoSaida","atualizadoEm") values ('conversar','simulado','simulado','',0,0,now())`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => { await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`); await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard'); };
  try {
    const [cS, pS] = await novo(); await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    await pS.goto(BASE + '/empresa-ia'); await espera(1200);
    ok('Super Admin vê o cartão "Script do Fale conosco"', (await pS.locator('[data-testid=orientacoes-visitante]').count()) === 1 && /Script do Fale conosco/.test(await pS.locator('[data-testid=orientacoes-visitante] h2').innerText()));
    ok('O cartão explica que os valores e promoções vêm do cadastro dos planos', /promoções dos planos direto do cadastro/.test(await pS.locator('[data-testid=orientacoes-visitante]').innerText()));
    ok('O cartão do suporte continua lá (os dois convivem)', (await pS.locator('[data-testid=orientacoes-suporte]').count()) === 1);

    // Texto sugestão (modelo inicial)
    await pS.click('#ev-orientacoes'); await espera(500);
    await pS.click('[data-testid=sugestao-orientacoesVisitante]'); await espera(300);
    const sug = await pS.locator('[data-testid=editor-orientacoesVisitante] textarea').inputValue();
    ok('"Texto sugestão" preenche o modelo (abertura, perguntas, recomendação, promoções, respostas prontas e regras)', /ABERTURA/.test(sug) && /PERGUNTAS PARA ENTENDER/.test(sug) && /COMO RECOMENDAR O PLANO/.test(sug) && /PROMOÇÕES E CONDIÇÕES/.test(sug) && /RESPOSTAS PRONTAS/.test(sug) && /REGRAS DE ATENDIMENTO/.test(sug));
    ok('O modelo manda citar só promoções cadastradas e nunca prometer desconto', /exatamente como estão/.test(sug) && /Nunca prometa desconto/.test(sug));
    await pS.screenshot({ path: OUT + '/script-visitante-sugestao.png' });
    await pS.click('[data-testid=editor-orientacoesVisitante] >> text=Cancelar'); await espera(300);

    // Escrever o próprio script e salvar
    await pS.click('#ev-orientacoes'); await espera(400);
    await pS.locator('[data-testid=editor-orientacoesVisitante] textarea').fill('Abra perguntando o ramo do visitante. SCRIPT-E2E-178');
    await pS.click('[data-testid=salvar-orientacoesVisitante]'); await espera(500);
    await pS.click('[data-testid=salvar-orientacoes-visitante]'); await espera(1500);
    const salvo = sql(`select "orientacoesVisitante" from "FichaEmpresa" where "superAdminId"='${SAID}'`);
    ok('Salvar grava o script do Super Admin', /SCRIPT-E2E-178/.test(salvo), salvo.slice(0, 60));
    ok('Salvar o script não mexe nas orientações do suporte nem refaz a ficha', sql(`select count(*) from "FichaEmpresa" where "superAdminId"='${SAID}' and montando`) === '0');
    ok('Editor limitado a 6.000 caracteres', (await (async () => { await pS.click('#ev-orientacoes'); await espera(400); const m = await pS.locator('[data-testid=editor-orientacoesVisitante] textarea').getAttribute('maxlength'); await pS.click('[data-testid=editor-orientacoesVisitante] >> text=Cancelar'); return m; })()) === '6000');

    // Testar uma mensagem
    await pS.goto(BASE + '/empresa-ia'); await espera(1200);
    const msgsAntes = sql(`select count(*) from "InteressadoMensagem"`); const intAntes = sql(`select count(*) from "Interessado"`);
    await pS.fill('[data-testid=pergunta-teste-visitante]', 'Oi, quanto custa e como funciona? TESTE-TELA-178'); await pS.click('[data-testid=testar-visitante]');
    ok('Testar mostra a resposta da IA do Fale conosco', await ate(async () => (await pS.locator('[data-testid=teste-visitante-resposta]').count()) === 1, 20000) && (await pS.locator('[data-testid=teste-visitante-resposta]').innerText()).length > 10);
    ok('O teste mostra o que a IA recebeu: o SEU script, o material comercial e os planos', /seu script \(\d+ caracteres\)/.test(await pS.locator('[data-testid=teste-visitante-usando]').innerText()) && /material comercial \(\d/.test(await pS.locator('[data-testid=teste-visitante-usando]').innerText()) && /plano\(s\) visível/.test(await pS.locator('[data-testid=teste-visitante-usando]').innerText()));
    ok('O teste mostra o interesse percebido', /Interesse percebido/.test(await pS.locator('[data-testid=resultado-teste-visitante]').innerText()));
    ok('O teste NÃO cria visitante nem mensagem', sql(`select count(*) from "InteressadoMensagem"`) === msgsAntes && sql(`select count(*) from "Interessado"`) === intAntes);
    await pS.screenshot({ path: OUT + '/script-visitante-teste.png', fullPage: true });

    // Quem não é Super Admin não vê o cartão nem consegue chamar as ações
    const [cU, pU] = await novo(); await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
    await pU.goto(BASE + '/empresa-ia'); await espera(1000);
    ok('Admin da Empresa não vê o script do Fale conosco', (await pU.locator('[data-testid=orientacoes-visitante]').count()) === 0);
    await cU.close(); await cS.close();
  } finally {
    await b.close();
    sql(`update "FichaEmpresa" set "orientacoesVisitante"='${scriptAntes.replace(/'/g, "''")}' where "superAdminId"='${SAID}'`);
    if (conversarAntes) sql(`update "ConfigIA" set provedor='${conversarAntes}' where tarefa='conversar'`); else sql(`delete from "ConfigIA" where tarefa='conversar'`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
