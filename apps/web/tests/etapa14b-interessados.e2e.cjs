// Teste de ponta a ponta da decisão #104: chat para interessados (quem ainda não é cliente) na tela de Planos.
// Requer: app em http://localhost:3005, serviço 24/7 em :4000 (IA simulada) e Postgres com seed.
// Uso: node apps/web/tests/etapa14b-interessados.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const EMAIL = 'interessado14@exemplo.com.br';

(async () => {
  sql(`delete from "Interessado"`);
  sql(`delete from "Pedido" where email='${EMAIL}'`);
  sql(`delete from "Usuario" where email='${EMAIL}'`);
  // IA simulada para a conversa (como nos testes da etapa 10b)
  sql(`insert into "ConfigIA"(tarefa,provedor,modelo,"urlBase","precoEntrada","precoSaida","atualizadoEm") values ('conversar','simulado','simulado','',0,0,now()) on conflict (tarefa) do update set provedor='simulado', modelo='simulado', chave=null`);
  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const escrever = async (p, t) => { await p.fill('[data-testid=chat-interessado] [aria-label="Mensagem para o suporte"]', t); await p.click('[data-testid=chat-interessado] button:has-text("Enviar")'); };
  try {
    // ===== Visitante =====
    let [cV, pV] = await novo();
    await pV.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await pV.click('button:has-text("Planos")'); await espera(800);
    ok('Tela de Planos tem "Fale conosco"', (await pV.locator('[data-testid=fale-conosco]').count()) === 1);
    await pV.click('[data-testid=fale-conosco]'); await espera(800);
    ok('Pede os dados antes de conversar', (await pV.locator('[aria-label="Seu nome"]').count()) === 1);
    ok('Sem aceite da Política o botão fica desativado', await pV.locator('button:has-text("Começar conversa")').isDisabled());
    await pV.fill('[aria-label="Seu nome"]', 'Paula Interessada');
    await pV.fill('[aria-label="Seu WhatsApp"]', '123');
    await pV.check('[aria-label="Aceito a Política de Privacidade"]');
    await pV.click('button:has-text("Começar conversa")'); await espera(800);
    ok('WhatsApp inválido é recusado', (await pV.locator('text=Informe um WhatsApp válido').count()) === 1);
    await pV.fill('[aria-label="Seu WhatsApp"]', '(11) 98888-1414');
    await pV.fill('[aria-label="Seu e-mail"]', EMAIL);
    await pV.click('button:has-text("Começar conversa")'); await espera(1000);
    ok('Interessado gravado com aceite', sql(`select whatsapp||'|'||(email is not null)||'|'||("aceitouEm" is not null) from "Interessado"`) === '5511988881414|true|true');
    ok('Visitante não pode enviar arquivo', (await pV.locator('[data-testid=chat-interessado] [aria-label="Anexo (imagem ou PDF)"]').count()) === 0);
    await escrever(pV, 'Olá, quero comprar o sistema para minha imobiliária');
    await espera(6000);
    const msgs = await pV.locator('[data-testid=chat-interessado] [data-autor]').allInnerTexts();
    ok('A IA responde primeiro', msgs.some((m) => m.includes('Assistente virtual (IA)')), String(msgs.length));
    ok('IA qualifica o interessado', sql(`select temperatura from "Interessado"`) === 'QUENTE');
    await pV.screenshot({ path: OUT + '/interessado-chat.png' });
    // Continua no mesmo aparelho
    await pV.reload({ waitUntil: 'networkidle' });
    await pV.click('button:has-text("Planos")'); await espera(600);
    await pV.click('[data-testid=fale-conosco]'); await espera(1500);
    ok('Conversa continua no mesmo aparelho', (await pV.locator('[data-testid=chat-interessado] [data-autor]').count()) >= 2 && (await pV.locator('[aria-label="Seu nome"]').count()) === 0);
    // IA não sabe: pausa e fica com o Super Admin
    await escrever(pV, 'Quanto custa a integração com meu CRM?'); await espera(6000);
    ok('IA não sabe: pausa a conversa', sql(`select "iaPausada" from "Interessado"`) === 't');

    // ===== Super Admin =====
    let [cS, pS] = await novo();
    await entrar(pS, 'superadmin@disparopro.com.br', 'Super@12345678');
    await pS.goto(BASE + '/atendimento?aba=interessados'); await espera(800);
    ok('Atendimento tem a aba Interessados com não lidas', (await pS.locator('[data-testid=nao-lidas-interessado]').count()) === 1);
    await pS.click('[data-testid=item-interessado]:has-text("Paula")'); await espera(1500);
    ok('Super Admin vê a conversa com a IA', (await pS.locator('[data-testid=chat-suporte] >> text=quero comprar').count()) === 1 && (await pS.locator('[data-testid=chat-suporte] >> text=Assistente virtual (IA)').count()) >= 1);
    ok('Mostra que a IA pausou', (await pS.locator('text=A IA não soube responder').count()) >= 1);
    await pS.fill('[data-testid=chat-suporte] [aria-label="Mensagem para o suporte"]', 'Oi Paula! A integração com CRM sai no plano Premium.');
    await pS.click('[data-testid=chat-suporte] button:has-text("Enviar")'); await espera(4000);
    ok('Visitante recebe a resposta do Super Admin', (await pV.locator('[data-testid=chat-interessado] >> text=plano Premium').count()) === 1);
    await pS.screenshot({ path: OUT + '/atendimento-interessados.png', fullPage: true });
    // Devolver para a IA e assumir de novo
    await pS.reload(); await espera(800);
    await pS.click('button:has-text("Devolver para a IA")'); await espera(1000);
    ok('Devolver para a IA', sql(`select "iaPausada" from "Interessado"`) === 'f');
    await escrever(pV, 'Legal, vou pensar'); await espera(6000);
    ok('IA volta a responder depois de devolver', Number(sql(`select count(*) from "InteressadoMensagem" where autor='IA'`)) >= 3);
    await pS.reload(); await espera(800);
    await pS.click('button:has-text("Assumir conversa")'); await espera(1000);
    ok('Assumir a conversa', sql(`select "iaPausada" from "Interessado"`) === 't');
    // Limite contra robôs
    let recusou = false;
    for (let i = 0; i < 8; i++) {
      const st = await pV.evaluate(async (n) => { const f = new FormData(); f.set('texto', 'teste ' + n); return (await fetch('/api/interessados/mensagens', { method: 'POST', body: f })).status; }, i);
      if (st === 429) { recusou = true; break; }
    }
    ok('Limite de mensagens por minuto', recusou);
    // Rotas do Super Admin fechadas para o visitante
    const id = sql(`select id from "Interessado"`);
    const st = await pV.evaluate(async (i) => (await fetch('/api/interessados/' + i)).status, id).catch(() => 0);
    ok('Visitante não abre as rotas do Super Admin', st >= 400, String(st));
    // Outro aparelho não vê a conversa
    let [cO, pO] = await novo();
    await pO.goto(BASE + '/login');
    const r = await pO.evaluate(async () => (await fetch('/api/interessados')).json());
    ok('Outro aparelho não vê a conversa', r.novo === true && r.mensagens.length === 0);
    await cO.close();

    // ===== Comprou: vira o suporte do cliente =====
    const plano = sql(`select id from "Plano" where visivel and not personalizado and modulo='INDIVIDUAL' and "precoAtual">0 order by ordem limit 1`);
    const ped = await pV.evaluate(async (d) => (await fetch('/api/pedidos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) })).json(), { planoId: plano, nome: 'Paula Interessada', email: EMAIL, whatsapp: '(11) 98888-1414' });
    ok('Pedido criado', !!ped.codigo || ped.ok !== false, JSON.stringify(ped).slice(0, 80));
    await pS.goto(BASE + '/pedidos'); await espera(800);
    await pS.locator('tr, [data-testid=pedido]').filter({ hasText: EMAIL }).first().locator('button:has-text("Confirmar pagamento")').click(); await espera(2000);
    const cli = sql(`select id from "Usuario" where email='${EMAIL}'`);
    ok('Compra liga a conversa ao novo cliente', !!cli && Number(sql(`select count(*) from "SuporteMensagem" m join "SuporteConversa" c on c.id=m."conversaId" where c."usuarioId"='${cli}'`)) >= 5);
    ok('Interessado sai da lista depois da compra', sql(`select count(*) from "Interessado"`) === '0');
    await cV.close(); await cS.close();
  } finally {
    await b.close();
    sql(`delete from "Interessado"`);
    const cli = sql(`select coalesce(string_agg(id,','),'') from "Usuario" where email='${EMAIL}'`);
    if (cli) { sql(`delete from "SuporteConversa" where "usuarioId"='${cli}'`); sql(`delete from "Sessao" where "usuarioId"='${cli}'`); }
    sql(`delete from "Pedido" where email='${EMAIL}'`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
