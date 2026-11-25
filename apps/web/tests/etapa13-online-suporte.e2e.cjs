// Teste de ponta a ponta da decisão #102: disparos por quantidade (saldo e pacote extra), Online, Suporte e Mensagens aos usuários.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (DISPAROS=desligado) e Postgres com seed.
// Uso: node apps/web/tests/etapa13-online-suporte.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const ADM = sql(`select id from "Usuario" where email='admin-empresa@empresaexemplo.com.br'`);
  const PLANO = sql(`select "planoId" from "Empresa" where id='${EMP}'`);
  const antes = sql(`select coalesce("limiteDisparos"::text,'null')||'|'||"disparosExtras"||'|'||"inicioPeriodo" from "Empresa" where id='${EMP}'`);
  const planoAntes = sql(`select coalesce("disparosPorPeriodo"::text,'null')||'|'||coalesce("pacoteDisparos"::text,'null')||'|'||coalesce("precoPacoteDisparos"::text,'null') from "Plano" where id='${PLANO}'`);
  sql(`delete from "Comunicado"`); sql(`delete from "SuporteConversa"`);
  sql(`delete from "Pedido" where "pacotesDisparos">0`);
  sql(`update "Plano" set "pacoteDisparos"=500, "precoPacoteDisparos"=49.9 where id='${PLANO}'`);
  sql(`update "Empresa" set "limiteDisparos"=10, "disparosExtras"=0 where id='${EMP}'`);

  const b = await chromium.launch();
  const novo = async (vp = { width: 1440, height: 900 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };

  try {
    // ===== 1. Disparos por quantidade =====
    let [cA, pA] = await novo();
    await entrar(pA, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
    const card = await pA.locator('[data-testid=saldo-disparos]').innerText().catch(() => '');
    ok('Admin vê o saldo de disparos do período', /de 10/.test(card), card.replace(/\s+/g, ' ').slice(0, 80));
    await pA.click('[data-testid=comprar-disparos]'); await espera(1500);
    ok('Comprar pacote gera o PIX', (await pA.locator('[data-testid=pix-disparos]').count()) === 1);
    const ped = sql(`select id||'|'||"pacotesDisparos" from "Pedido" where "empresaId"='${EMP}' and "pacotesDisparos">0 and status='AGUARDANDO'`);
    ok('Pedido do pacote criado com 500 disparos', ped.endsWith('|500'), ped);
    await pA.screenshot({ path: OUT + '/saldo-admin.png' });

    let [cS, pS] = await novo();
    await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    await pS.goto(BASE + '/pedidos'); await espera(600);
    ok('Pedidos mostra os disparos extras', (await pS.locator('text=500 disparos extras').count()) >= 1);
    await pS.locator('tr, [data-testid=pedido]').filter({ hasText: '500 disparos extras' }).first().locator('button:has-text("Confirmar pagamento")').click();
    await espera(1500);
    ok('Confirmar soma os disparos extras', sql(`select "disparosExtras" from "Empresa" where id='${EMP}'`) === '500');
    await pA.reload(); await espera(600);
    ok('Saldo do Admin mostra o total novo', /de 510/.test(await pA.locator('[data-testid=saldo-disparos]').innerText()));

    // Usuário da empresa (não é o dono da conta) não compra
    let [cU, pU] = await novo();
    await entrar(pU, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
    ok('Usuário da empresa não tem o botão de comprar', (await pU.locator('[data-testid=comprar-disparos]').count()) === 0);

    // ===== 2. Online =====
    await pU.goto(BASE + '/leads'); await espera(1500);
    await pS.goto(BASE + '/online?aba=empresarial'); await espera(800);
    const grupos = await pS.locator('[data-testid=grupo-empresa]').allInnerTexts();
    const ge = grupos.find((g) => g.includes('Empresa Exemplo')) ?? '';
    ok('Online: Empresarial agrupado por empresa', ge.includes('Ana') && ge.includes('Admin'), ge.replace(/\s+/g, ' ').slice(0, 120));
    ok('Online: mostra a tela e o aparelho', /Leads/.test(ge) && /Computador/.test(ge));
    ok('Online: aba Super Admin conta o Super Admin', Number(await pS.locator('[data-testid=conta-superadmin]').innerText()) >= 1);
    await pS.screenshot({ path: OUT + '/online.png', fullPage: true });
    await pS.goto(BASE + '/online?aba=todos&busca=Exemplo'); await espera(600);
    ok('Online: aba Todos com último acesso', (await pS.locator('th:has-text("Último acesso")').count()) === 1 && (await pS.locator('[data-testid=tabela-online] tbody tr').count()) >= 2);
    sql(`update "Usuario" set "vistoEm"=now()-interval '10 minutes' where id='${ADM}'`);
    await pS.goto(BASE + '/online?aba=empresarial'); await espera(600);
    const ge2 = (await pS.locator('[data-testid=grupo-empresa]').allInnerTexts()).find((g) => g.includes('Empresa Exemplo')) ?? '';
    ok('Online: quem parou há mais de 2 min sai da lista', ge2.includes('Ana') && !ge2.includes('admin-empresa@'));
    await cA.close();

    // ===== 3. Suporte =====
    ok('Cliente tem o botão Suporte', (await pU.locator('[data-testid=botao-suporte]').count()) === 1);
    ok('Super Admin não tem o botão Suporte', (await pS.locator('[data-testid=botao-suporte]').count()) === 0);
    // Ícone do suporte (decisão #137): o atendente verde, sem o antigo "💬 Suporte"
    ok('Suporte é o ícone do atendente (imagem carregada, sem o texto antigo)', await pU.locator('[data-testid=botao-suporte] img').evaluate((i) => i.complete && i.naturalWidth > 0) && (await pU.locator('text=💬 Suporte').count()) === 0);
    await pU.click('[data-testid=botao-suporte]');
    await pU.fill('[aria-label="Mensagem para o suporte"]', 'Olá, preciso de ajuda com a campanha');
    await pU.click('[data-testid=janela-suporte] button:has-text("Enviar")'); await espera(800);
    ok('Mensagem do cliente gravada', sql(`select count(*) from "SuporteMensagem" m join "SuporteConversa" c on c.id=m."conversaId" where c."usuarioId"='${ANA}' and m.autor='CLIENTE'`) === '1');
    await pS.goto(BASE + '/atendimento'); await espera(800);
    ok('Atendimento lista a conversa com não lidas', (await pS.locator('[data-testid=nao-lidas-atendimento]').first().innerText()) === '1');
    ok('Menu do Super Admin mostra contador do Atendimento', (await pS.locator('aside nav a[href="/atendimento"]').innerText()).includes('1'));
    await pS.click('[data-testid=item-atendimento]:has-text("Ana")'); await espera(1200);
    ok('Super Admin vê a mensagem do cliente', (await pS.locator('[data-testid=chat-suporte] >> text=preciso de ajuda').count()) === 1);
    await pS.fill('[aria-label="Mensagem para o suporte"]', 'Claro! Pode me mandar um print?');
    await pS.setInputFiles('[aria-label="Anexo (imagem ou PDF)"]', { name: 'guia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await pS.click('[data-testid=chat-suporte] button:has-text("Enviar")'); await espera(800);
    await espera(3500);
    ok('Cliente recebe a resposta em tempo real', (await pU.locator('[data-testid=janela-suporte] >> text=mandar um print').count()) === 1);
    ok('Cliente vê o anexo PDF', (await pU.locator('[data-testid=janela-suporte] a:has-text("guia.pdf")').count()) === 1);
    const href = await pU.locator('[data-testid=janela-suporte] a:has-text("guia.pdf")').getAttribute('href');
    const st = await pU.evaluate(async (h) => (await fetch(h)).status, href);
    ok('Anexo abre para o cliente', st === 200, String(st));
    await pS.screenshot({ path: OUT + '/atendimento.png', fullPage: true });
    await pU.screenshot({ path: OUT + '/suporte-cliente.png' });
    // Outro cliente não abre o anexo
    let [cI, pI] = await novo();
    await entrar(pI, 'usuario@disparopro.com.br', 'User@12345678');
    const st2 = await pI.evaluate(async (h) => (await fetch(h)).status, href);
    ok('Outro cliente não abre o anexo', st2 === 404 || st2 === 403, String(st2));
    // Admin não vê o chat dos usuários (só o próprio)
    const r = await pI.evaluate(async () => (await fetch('/api/suporte')).json());
    ok('Cada cliente só vê a própria conversa', r.ok && r.mensagens.length === 0);
    // Super Admin chama o cliente: o chat abre sozinho
    const IND = sql(`select id from "Usuario" where email='usuario@disparopro.com.br'`);
    await pS.goto(BASE + `/atendimento?cliente=${IND}`); await espera(800);
    await pS.click('button:has-text("Chamar cliente")'); await espera(800);
    await pI.reload(); await espera(2500);
    ok('Chamar: o chat abre sozinho na tela do cliente', (await pI.locator('[data-testid=janela-suporte]').count()) === 1);
    ok('Chamado é limpo depois de abrir', sql(`select count(*) from "SuporteConversa" where "usuarioId"='${IND}' and "chamadoEm" is not null`) === '0');
    await cI.close();

    // ===== 4. Mensagens aos usuários =====
    await pS.goto(BASE + '/comunicados'); await espera(600);
    await pS.fill('#com-titulo', 'Manutenção programada');
    await pS.fill('#com-texto', 'O sistema ficará fora do ar no domingo das 2h às 3h.');
    await pS.fill('#com-link', 'https://filaproleads.com.br/ajuda');
    await pS.selectOption('#com-publico', `empresa:${EMP}`);
    await pS.click('button:has-text("Enviar mensagem")'); await espera(1200);
    const total = Number(sql(`select count(*) from "ComunicadoDestino"`));
    const daEmpresa = Number(sql(`select count(*) from "Usuario" where "empresaId"='${EMP}' and status='ATIVO' and cargo<>'SUPERADMIN'`));
    ok('Mensagem criada para todos da empresa', total === daEmpresa && total > 0, `${total}/${daEmpresa}`);
    await pU.reload(); await espera(1500);
    ok('Popup aparece no centro da tela do usuário', (await pU.locator('[data-testid=popup-comunicado] >> text=Manutenção programada').count()) === 1);
    ok('Popup tem o link', (await pU.locator('[data-testid=popup-comunicado] a:has-text("Abrir o link")').count()) === 1);
    await pU.screenshot({ path: OUT + '/popup-comunicado.png' });
    await pU.keyboard.press('Escape'); await espera(300);
    ok('Popup não fecha sem OK', (await pU.locator('[data-testid=popup-comunicado]').count()) === 1);
    await pU.click('[data-testid=popup-comunicado] button:has-text("OK")'); await espera(800);
    ok('OK fecha o popup', (await pU.locator('[data-testid=popup-comunicado]').count()) === 0);
    await pU.reload(); await espera(1500);
    ok('Depois do OK não aparece de novo', (await pU.locator('[data-testid=popup-comunicado]').count()) === 0);
    await pS.reload(); await espera(600);
    ok('Relatório de leitura', (await pS.locator('[data-testid=leitura]').first().innerText()) === `1 de ${total} leram`);
    await pS.locator('[data-testid=comunicado] summary').first().click(); await espera(300);
    await pS.screenshot({ path: OUT + '/comunicados.png', fullPage: true });
    // Mensagem vencida não aparece
    sql(`insert into "Comunicado"(id,titulo,texto,publico,"autorId","validoAte") values ('tc13','Vencida','x','teste','x',now()-interval '1 day')`);
    sql(`insert into "ComunicadoDestino"(id,"comunicadoId","usuarioId") values ('tcd13','tc13','${ANA}')`);
    await pU.reload(); await espera(1500);
    ok('Mensagem vencida não aparece', (await pU.locator('[data-testid=popup-comunicado]').count()) === 0);
    // Link sem https é recusado
    await pS.fill('#com-titulo', 'Teste'); await pS.fill('#com-texto', 'x'); await pS.fill('#com-link', 'http://exemplo.com');
    await pS.click('button:has-text("Enviar mensagem")'); await espera(800);
    ok('Link sem https é recusado', (await pS.locator('text=O link precisa começar com https://').count()) >= 1);
    // Rotas do Super Admin bloqueadas para clientes
    await pU.goto(BASE + '/online'); await espera(500);
    ok('Usuário não abre o Online', !pU.url().includes('/online'));
    await cU.close(); await cS.close();
  } finally {
    await b.close();
    const [l, e, i] = antes.split('|');
    sql(`update "Empresa" set "limiteDisparos"=${l}, "disparosExtras"=${e}, "inicioPeriodo"='${i}' where id='${EMP}'`);
    const [d1, d2, d3] = planoAntes.split('|');
    sql(`update "Plano" set "disparosPorPeriodo"=${d1}, "pacoteDisparos"=${d2}, "precoPacoteDisparos"=${d3} where id='${PLANO}'`);
    sql(`delete from "Comunicado"`); sql(`delete from "SuporteConversa"`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
