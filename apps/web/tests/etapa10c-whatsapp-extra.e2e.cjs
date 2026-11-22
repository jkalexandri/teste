// Teste de ponta a ponta da etapa 10c (vários WhatsApps no Individual — decisões #79, #80 e #95).
// O rodízio e as conversas por número são testados no serviço 24/7 (apps/worker/tests/numeros.test.ts).
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa10c-whatsapp-extra.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const IND = 'teste-conta-individual';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 40) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };

(async () => {
  const USU = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
  const PLANO = sql(`select id from "Plano" where nome='Individual' and modulo='INDIVIDUAL'`);
  const planoAntes = sql(`select "maxWhatsapps"||'|'||coalesce("precoWhatsappExtra"::text,'') from "Plano" where id='${PLANO}'`);
  sql(`update "Plano" set "maxWhatsapps"=1, "precoWhatsappExtra"=null where id='${PLANO}'`);
  const contaAntes = sql(`select "expiraEm"||'|'||"prazoDias"||'|'||pacote from "Empresa" where id='${IND}'`).split('|');
  // Conta individual no plano Individual, vencendo em 15 dias de um plano de 31 dias
  sql(`update "Empresa" set "planoId"='${PLANO}', pacote='Individual', "prazoDias"=31, "expiraEm"=now() + interval '15 days', "whatsappsExtras"=0, "tokenRenovacao"='tok-10c-teste' where id='${IND}'`);
  sql(`delete from "WhatsappSessao" where "usuarioId"='${USU}' and id <> '${USU}'`);
  sql(`delete from "Pedido" where email='usuario@disparopro.com.br'`);
  sql(`delete from "Campanha" where "usuarioId"='${USU}' and assunto='Rodízio 10c'`);
  sql(`delete from "Lead" where codigo='TC10C-1'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.type() === 'prompt' ? d.accept(globalThis.__resposta ?? '') : d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };

  // ===== 1. Super Admin configura o plano =====
  let [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.goto(BASE + '/planos'); await espera(500);
  await p.locator('article:has-text("Individual") >> button:has-text("Editar")').first().click().catch(async () => {
    await p.locator(`button:has-text("Editar")`).nth(1).click();
  });
  await p.waitForSelector('[role=dialog]');
  ok('Plano Individual tem máximo de WhatsApps e preço do extra', (await p.locator('#f-maxWhatsapps').count()) === 1 && (await p.locator('#f-precoWhatsappExtra').count()) === 1);
  await p.fill('#f-maxWhatsapps', '3'); await p.fill('#f-precoWhatsappExtra', '31,00'); await p.click('button:has-text("Salvar plano")');
  ok('Máximo 3 e extra de R$ 31,00 salvos', await ate(() => sql(`select "maxWhatsapps"||'|'||"precoWhatsappExtra" from "Plano" where id='${PLANO}'`) === '3|3100'));
  await c.close();

  // ===== 2. Usuário compra um extra (proporcional) =====
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await p.goto(BASE + '/whatsapp'); await espera(800);
  ok('Começa com 1 número', (await p.locator('[data-testid=numero]').count()) === 1);
  ok('Mostra "Adicionar mais um WhatsApp" com valor proporcional (R$ 31 × 15/31 = R$ 15,00)', (await p.locator('[data-testid=comprar-extra]').innerText()).includes('15,00'), (await p.locator('[data-testid=comprar-extra]').innerText()).replace(/\s+/g, ' ').slice(0, 160));
  await p.click('button:has-text("Adicionar mais um WhatsApp")');
  ok('PIX do extra gerado', await ate(async () => (await p.locator('[data-testid=pix-extra]').count()) === 1));
  ok('Pedido de extra com o valor proporcional', sql(`select "somenteExtras"||'|'||"whatsappsExtras"||'|'||valor from "Pedido" where email='usuario@disparopro.com.br' order by "criadoEm" desc limit 1`) === 'true|1|1500');
  await p.screenshot({ path: OUT + '/whatsapp-comprar.png', fullPage: true });
  await c.close();

  // ===== 3. Super Admin confirma o pagamento =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.goto(BASE + '/pedidos'); await espera(800);
  const linha = p.locator('tr', { has: p.locator('text=WhatsApp extra (1)') }).first();
  ok('Pedidos mostra "WhatsApp extra"', (await linha.count()) === 1);
  await linha.locator('text=Confirmar pagamento').click();
  ok('Confirmar libera o extra na conta', await ate(() => sql(`select "whatsappsExtras" from "Empresa" where id='${IND}'`) === '1'));
  ok('Número extra criado', await ate(() => sql(`select count(*) from "WhatsappSessao" where "usuarioId"='${USU}' and id <> '${USU}' and not bloqueada`) === '1'));
  // Super Admin dá mais um sem pedido (#95, item 5)
  await p.goto(BASE + '/usuarios-individuais'); await espera(800);
  globalThis.__resposta = '2';
  await p.locator('tr', { has: p.locator('text=usuario@disparopro.com.br') }).locator('[data-testid=extras-conta]').click();
  ok('Super Admin dá extras sem pedido', await ate(() => sql(`select "whatsappsExtras" from "Empresa" where id='${IND}'`) === '2'));
  await c.close();

  // ===== 4. Usuário vê os números, dá apelido e escolhe na campanha =====
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await p.goto(BASE + '/whatsapp'); await espera(1000);
  ok('Tela WhatsApp com 3 números', (await p.locator('[data-testid=numero]').count()) === 3);
  ok('Cada número mostra a saúde', (await p.locator('[data-testid=saude-numero]').count()) === 3);
  const extra1 = sql(`select id from "WhatsappSessao" where "usuarioId"='${USU}' and id <> '${USU}' order by ordem limit 1`);
  await p.locator(`[data-id="${extra1}"] input[aria-label="Apelido do número"]`).fill('Vendas 2');
  await p.locator(`[data-id="${extra1}"] button:has-text("Salvar apelido")`).click();
  ok('Apelido salvo', await ate(() => sql(`select apelido from "WhatsappSessao" where id='${extra1}'`) === 'Vendas 2'));
  ok('Plano no máximo: não oferece mais', await ate(async () => { await p.reload(); return (await p.locator('text=Você já usa o máximo de números do seu plano').count()) === 1; }, 4));
  await p.screenshot({ path: OUT + '/whatsapp-numeros.png', fullPage: true });
  // Campanha: aba Antibloqueio com a escolha dos números
  await p.goto(BASE + '/campanhas?aba=nova'); await espera(800);
  await p.fill('#assunto', 'Rodízio 10c'); await p.fill('#msg', 'Oi {nome}, tudo bem?');
  await p.click('button:has-text("Próximo")'); await espera(500); await p.click('button:has-text("Próximo")'); await espera(500);
  ok('Antibloqueio mostra "Enviar pelos números" com os 3', (await p.locator('[data-testid=numeros-campanha] input[type=checkbox]').count()) === 3);
  await p.locator('[data-testid=numeros-campanha] label', { hasText: 'Vendas 2' }).locator('input').uncheck();
  await p.click('button:has-text("Salvar rascunho")');
  ok('Rascunho guarda os números escolhidos', await ate(() => { const s = sql(`select array_length(sessoes,1)||'|'||(not ('${extra1}' = any(sessoes))) from "Campanha" where assunto='Rodízio 10c'`); return s === '2|true'; }));
  // Conversa mostra o número
  sql(`insert into "Lead"(id,codigo,nome,telefone,"usuarioId","empresaId","codigoUsuario","ultimaMensagemEm","sessaoId","atualizadoEm") values ('tc10c-1','TC10C-1','Léo','5511990009999','${USU}','${IND}','x',now(),'${extra1}',now())`);
  sql(`insert into "Mensagem"(id,"leadId",autor,texto,"sessaoId") values ('tm10c-1','tc10c-1','LEAD','Oi','${extra1}')`);
  await p.goto(BASE + '/conversas?lead=tc10c-1'); await espera(800);
  ok('Conversa mostra por qual número é', (await p.locator('[data-testid=numero-conversa]').innerText()).includes('Vendas 2'));
  await c.close();

  // ===== 5. Renovação com menos extras, escolhendo qual manter =====
  [c, p] = await novo();
  await p.goto(BASE + '/renovar/tok-10c-teste', { waitUntil: 'networkidle' }); await espera(500);
  await p.locator('article:has-text("Individual") >> button').first().click(); await espera(500);
  ok('Renovação: passo dos extras aparece com os 2 atuais', (await p.locator('[data-testid=passo-extras]').count()) === 1 && (await p.locator('#rn-extras option').count()) === 3);
  await p.selectOption('#rn-extras', '1'); await espera(300);
  const caixas = p.locator('[data-testid=passo-extras] input[type=checkbox]');
  ok('Escolhe qual número manter', (await caixas.count()) === 2);
  // mantém o segundo (o mais novo), não o "Vendas 2"
  if (await caixas.nth(0).isChecked()) await caixas.nth(0).uncheck();
  await caixas.nth(1).check();
  ok('Total com 1 extra: R$ 29,90 + R$ 31,00 = R$ 60,90', (await p.locator('[data-testid=passo-extras]').innerText()).includes('60,90'));
  await p.click('button:has-text("Gerar PIX")');
  ok('PIX de renovação gerado com 1 extra e o número escolhido', await ate(() => sql(`select "whatsappsExtras"||'|'||array_length("manterSessoes",1)||'|'||valor from "Pedido" where email='usuario@disparopro.com.br' and renovacao order by "criadoEm" desc limit 1`) === '1|1|6090'));
  await p.screenshot({ path: OUT + '/renovar-extras.png', fullPage: true });
  await c.close();
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.goto(BASE + '/pedidos'); await espera(800);
  await p.locator('tr', { has: p.locator('text=1 WhatsApp extra') }).first().locator('text=Confirmar pagamento').click();
  ok('Renovação confirmada: "Vendas 2" bloqueado, o escolhido continua', await ate(() => sql(`select bloqueada from "WhatsappSessao" where id='${extra1}'`) === 't' && sql(`select count(*) from "WhatsappSessao" where "usuarioId"='${USU}' and id <> '${USU}' and not bloqueada`) === '1'));
  await c.close();
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await p.goto(BASE + '/whatsapp'); await espera(800);
  ok('Tela mostra o número fora do plano (conversas guardadas)', (await p.locator('[data-testid=bloqueados]').innerText()).includes('Vendas 2') && sql(`select count(*) from "Mensagem" where "leadId"='tc10c-1'`) === '1');
  ok('Número bloqueado não abre o QR', (await p.evaluate(async (id) => (await fetch('/api/whatsapp/' + id)).status, extra1)) === 403);
  await c.close();

  // ===== 6. Popup Planos: extras só no passo do pagamento =====
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(800);
  await p.screenshot({ path: OUT + '/login.png' });
  await p.click('button:has-text("Planos")'); await espera(800);
  await p.click('[aria-label="Planos"] article:has-text("Individual") >> button'); await espera(400);
  ok('Pagamento do plano Individual tem "WhatsApps extras"', (await p.locator('#ck-extras').count()) === 1 && (await p.locator('#ck-extras option').count()) === 3);
  await p.selectOption('#ck-extras', '2');
  ok('Total com 2 extras: R$ 29,90 + 2 × R$ 31,00 = R$ 91,90', (await p.locator('[data-testid=total-extras]').innerText()).includes('91,90'));
  await p.screenshot({ path: OUT + '/checkout-extras.png' });
  await c.close();
  await b.close();

  // Limpeza
  const [maxA, precoA] = planoAntes.split('|');
  sql(`update "Plano" set "maxWhatsapps"=${maxA}, "precoWhatsappExtra"=${precoA || 'null'} where id='${PLANO}'`);
  sql(`delete from "Lead" where codigo='TC10C-1'`);
  sql(`delete from "Campanha" where "usuarioId"='${USU}' and assunto='Rodízio 10c'`);
  sql(`delete from "WhatsappSessao" where "usuarioId"='${USU}' and id <> '${USU}'`);
  sql(`delete from "Pedido" where email='usuario@disparopro.com.br'`);
  sql(`update "Empresa" set "whatsappsExtras"=0, "planoId"=null, "tokenRenovacao"=null, "expiraEm"='${contaAntes[0]}', "prazoDias"=${contaAntes[1]}, pacote='${contaAntes[2]}' where id='${IND}'`);
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FALHOU')).length;
  console.log(`\n${res.length - f}/${res.length} passaram`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
