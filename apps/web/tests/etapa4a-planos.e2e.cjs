// Teste de ponta a ponta da etapa 4a (planos do Super Admin, botão Planos e popup no login).
// Requer: app em http://localhost:3005 e Postgres local com seed. Uso: node apps/web/tests/etapa4a-planos.e2e.cjs <pasta-prints>
// Atenção: grava preços FICTÍCIOS no banco de teste.
const { chromium } = require('playwright');
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
// Estado inicial: planos ocultos e sem preço; pagamento sem configuração.
sql("update \"Plano\" set visivel=false, \"precoAtual\"=null, \"precoAntigo\"=null, selo='', frase='', condicoes='', \"ofertaTexto\"='', recursos='{}', destaque=(slug='padrao')");
sql("update \"ConfigVenda\" set \"chavePix\"='', \"nomeRecebedor\"='', \"cidadeRecebedor\"='', \"contatoPersonalizado\"=''");
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await p.click('text=Entrar como Super Admin'); await p.waitForURL('**/dashboard');
  ok('Menu do Super Admin tem Planos e Pagamento', (await p.locator('aside nav').innerText()).includes('Planos') && (await p.locator('aside nav').innerText()).includes('Pagamento'));
  await p.click('aside nav >> text=Planos'); await p.waitForURL('**/planos');
  ok('Tela Planos lista 7 planos', await p.locator('table tbody tr').count() === 7);
  ok('Padrão começa em destaque', (await p.locator('tr:has-text("Padrão")').innerText()).includes('Em destaque'));
  // tentar exibir sem preço
  await p.click('tr:has-text("Básico") >> text=Oculto'); await p.waitForTimeout(800);
  ok('Não exibe plano sem preço', (await p.locator('text=Defina o preço atual do plano Básico').count()) >= 1);

  const editar = async (nome, campos) => {
    await p.click(`tr:has-text("${nome}") >> text=Editar`);
    for (const [k, v] of Object.entries(campos)) await p.fill(`#f-${k}`, v);
    await p.click('text=Salvar plano'); await p.waitForTimeout(1000);
  };
  await editar('Free', { frase: 'Teste grátis para conhecer a ferramenta.', recursos: '1 usuário\n7 dias ou 20 disparos' });
  await editar('Individual', { precoAntigo: '49,90', precoAtual: '29,90', selo: '40% de desconto', frase: 'Para quem trabalha sozinho.', condicoes: 'Cobrança mensal. Cancele quando quiser.', recursos: '1 usuário\nAntibloqueio\nIA' });
  await editar('Padrão', { precoAntigo: '299,90', precoAtual: '199,90', selo: 'Mais vendido', frase: 'Para equipes de vendas.', condicoes: 'Cobrança mensal.', ofertaTexto: 'Oferta de lançamento: 1º mês com 30% off', recursos: '10 usuários\nAntibloqueio\nIA qualifica leads' });
  await editar('Básico', { precoAtual: '99,90', frase: 'Para pequenas equipes.', recursos: '3 usuários' });
  for (const n of ['Free', 'Individual', 'Básico', 'Padrão']) { await p.click(`tr:has-text("${n}") >> text=Oculto`); await p.waitForTimeout(700); }
  ok('Prévia mostra 4 planos', await p.locator('.login-future article').count() === 4, String(await p.locator('.login-future article').count()));
  await p.screenshot({ path: OUT + '/admin-planos.png', fullPage: true });
  // pagamento
  await p.click('aside nav >> text=Pagamento'); await p.waitForURL('**/pagamento');
  await p.fill('#chavePix', 'teste@exemplo.com'); await p.click('button:has-text("Salvar")'); await p.waitForTimeout(800);
  ok('PIX exige nome e cidade', (await p.locator('text=informe também o nome do recebedor').count()) === 1);
  await p.fill('#nomeRecebedor', 'FILAPRO TESTE'); await p.fill('#cidadeRecebedor', 'SAO PAULO'); await p.fill('#contatoPersonalizado', '(11) 99999-0000');
  await p.click('button:has-text("Salvar")'); await p.waitForTimeout(800);
  ok('Pagamento salvo', (await p.locator('text=Configurações de pagamento salvas').count()) >= 1);
  await c.close();

  // login público: botão Planos + popup
  const c2 = await b.newContext({ viewport: { width: 1389, height: 578 }, deviceScaleFactor: 1.38 }); const q = await c2.newPage();
  await q.goto(BASE + '/login', { waitUntil: 'networkidle' }); await q.waitForTimeout(1500);
  ok('Botão de tema só com ícone', (await q.locator('[aria-label="Usar tema escuro"]').innerText()).trim() === '');
  await q.screenshot({ path: OUT + '/login-botao-planos.png' });
  await q.click('button:has-text("Planos")'); await q.waitForTimeout(1200);
  ok('Popup mostra os 4 planos visíveis', await q.locator('[aria-label="Planos"] article').count() === 4);
  await q.setViewportSize({ width: 1440, height: 900 }); await q.waitForTimeout(500);
  await q.screenshot({ path: OUT + '/popup-planos.png' });
  await q.click('article:has-text("Padrão") >> text=Escolher plano'); await q.waitForTimeout(500);
  ok('Escolher plano abre a compra', (await q.locator('#ck-nome').count()) === 1);
  await q.keyboard.press('Escape'); await q.waitForTimeout(300);
  ok('Esc fecha o popup', await q.locator('[aria-label="Planos"]').count() === 0);
  await c2.close();
  console.log(res.join('\n')); await b.close();
})();
