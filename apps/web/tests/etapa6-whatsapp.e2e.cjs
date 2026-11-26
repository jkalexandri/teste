// Teste de ponta a ponta da etapa 6a (telas do WhatsApp + avisos pelo número da plataforma).
// Usa um serviço 24/7 FALSO na porta 4000 (o WhatsApp real só é testado na VPS — etapa 6b).
// Requer: app em http://localhost:3005 com WORKER_URL=http://127.0.0.1:4000 e WORKER_TOKEN=token-local-teste,
// log em /var/tmp/web.log e Postgres local com seed.
// Uso: node apps/web/tests/etapa6-whatsapp.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const http = require('http');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Serviço falso: registra as chamadas e responde como o worker real ----
const chamadas = [];
let plataformaConectada = false;
const falso = http.createServer((req, resp) => {
  let corpo = '';
  req.on('data', (d) => (corpo += d));
  req.on('end', () => {
    if (req.url === '/saude') return resp.end('{"ok":true}');
    const autorizado = req.headers.authorization === 'Bearer token-local-teste';
    chamadas.push({ url: req.url, corpo: corpo ? JSON.parse(corpo) : {}, autorizado });
    resp.setHeader('content-type', 'application/json');
    if (!autorizado) { resp.statusCode = 401; return resp.end('{"ok":false,"mensagem":"Não autorizado."}'); }
    if (req.url.endsWith('/enviar') && !plataformaConectada) { resp.statusCode = 409; return resp.end('{"ok":false,"mensagem":"WhatsApp não conectado."}'); }
    resp.end('{"ok":true,"mensagem":"OK"}');
  });
});

(async () => {
  await new Promise((r) => falso.listen(4000, '127.0.0.1', r));
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  sql(`delete from "WhatsappSessao" where id in ('plataforma','${ANA}')`);
  sql(`update "ConfigVenda" set "numeroAvisos"='' where id='config'`);
  sql(`update "Empresa" set ativa=true, "expiraEm"=(current_date+40)::timestamp where id='teste-empresa-exemplo'`);
  sql(`update "Usuario" set status='ATIVO', permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'] where id='${ANA}'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo = 'Módulo Empresarial') => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const status = async (p) => (await p.locator('[data-testid=status-whatsapp]').innerText()).trim();

  // ===== 1. Usuário conecta o próprio WhatsApp =====
  let [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678');
  await p.click('aside nav >> text=WhatsApp'); await p.waitForURL('**/whatsapp');
  ok('Tela WhatsApp do usuário abre', (await p.locator('h1:has-text("WhatsApp")').count()) === 1);
  ok('Começa desconectado', (await status(p)) === 'Desconectado', await status(p));
  await p.click('button:has-text("Conectar WhatsApp")'); await espera(800);
  const ch = chamadas.find((x) => x.url === `/sessoes/${ANA}/conectar`);
  ok('Site chamou o serviço com o token e a sessão do próprio usuário', !!ch && ch.autorizado && ch.corpo.usuarioId === ANA, JSON.stringify(ch || {}));

  // O serviço real grava o QR no banco; aqui simulamos
  sql(`insert into "WhatsappSessao"(id,"usuarioId",status,qr,"qrEm","atualizadoEm") values ('${ANA}','${ANA}','AGUARDANDO_QR','2@teste-qr-code,abc,def',now(),now())
       on conflict (id) do update set status='AGUARDANDO_QR', qr='2@teste-qr-code,abc,def', "qrEm"=now()`);
  await espera(3800);
  ok('QR Code aparece sozinho (atualiza a cada 3 s)', (await p.locator('img[alt="QR Code para conectar o WhatsApp"]').count()) === 1);
  ok('Status "Aguardando leitura do QR Code"', (await status(p)) === 'Aguardando leitura do QR Code', await status(p));
  ok('Instruções de leitura do QR', (await p.locator('text=Dispositivos conectados').count()) === 1);
  await p.screenshot({ path: OUT + '/whatsapp-qr.png' });

  sql(`update "WhatsappSessao" set status='CONECTADO', qr=null, numero='5511987654321', "conectadoEm"=now() where id='${ANA}'`);
  await espera(3800);
  ok('Conectado: mostra o número', (await status(p)) === 'Conectado' && (await p.locator('text=+55 (11) 98765-4321').count()) === 1);
  await p.screenshot({ path: OUT + '/whatsapp-conectado.png' });

  // Um usuário não pode controlar a sessão da plataforma
  const r403 = await p.request.get(BASE + '/api/whatsapp/plataforma');
  ok('Usuário não acessa o número da plataforma (403)', r403.status() === 403, String(r403.status()));
  const rIdx = await p.request.post(BASE + '/api/whatsapp/proprio', { data: { acao: 'apagar-tudo' } });
  ok('Ação inválida recusada', rIdx.status() === 400, String(rIdx.status()));

  await p.click('button:has-text("Desconectar")'); await espera(800);
  ok('Desconectar chama o serviço', chamadas.some((x) => x.url === `/sessoes/${ANA}/desconectar`));

  // Reconexão automática (decisão #139): quadro explicando, "Tentar agora" sem apagar o login, sem o "Cancelar"
  sql(`update "WhatsappSessao" set status='RECONECTANDO', numero=null, "quedaEm"=now()-interval '2 minutes', "tentativaReconexao"=3, "proximaTentativaEm"=now()+interval '40 seconds' where id='${ANA}'`);
  await espera(3800);
  ok('Reconectando: selo e quadro "está voltando sozinha"', (await status(p)) === 'Reconectando…' && (await p.locator('[data-testid=reconectando] >> text=está voltando sozinha').count()) === 1 && (await p.locator('[data-testid=reconectando] >> text=/Tentativa 3 — próxima em \\d+ s/').count()) === 1, await status(p));
  ok('Reconectando: sem o "Cancelar" que apagava o login', (await p.locator('button:has-text("Cancelar")').count()) === 0);
  const antesTentar = chamadas.length;
  await p.click('[data-testid=tentar-agora]'); await espera(800);
  ok('"Tentar agora" pede para conectar (não desconecta)', chamadas.slice(antesTentar).some((x) => x.url === `/sessoes/${ANA}/conectar`) && !chamadas.slice(antesTentar).some((x) => x.url.endsWith('/desconectar')));
  let perguntou = '';
  p.removeAllListeners('dialog'); p.on('dialog', (d) => { perguntou = d.message(); d.dismiss(); });
  const antesDesc = chamadas.length;
  await p.click('button:has-text("Desconectar")'); await espera(600);
  ok('"Desconectar" pede confirmação e, se recusar, nada acontece', perguntou.includes('ler o QR Code') && !chamadas.slice(antesDesc).some((x) => x.url.endsWith('/desconectar')), perguntou);
  await p.screenshot({ path: OUT + '/whatsapp-reconectando.png' });
  p.removeAllListeners('dialog'); p.on('dialog', (d) => d.accept());

  // Erro gravado pelo serviço aparece na tela
  sql(`update "WhatsappSessao" set status='DESCONECTADO', numero=null, erro='O WhatsApp foi desconectado pelo celular. Conecte de novo lendo o QR Code.' where id='${ANA}'`);
  await espera(3800);
  ok('Motivo da desconexão aparece', (await p.locator('text=desconectado pelo celular').count()) === 1);

  // Serviço fora do ar
  await new Promise((r) => falso.close(r));
  await p.click('button:has-text("Conectar WhatsApp")'); await espera(1500);
  ok('Serviço fora do ar: mensagem clara', (await p.locator('text=O serviço do WhatsApp está fora do ar').count()) >= 1);
  await new Promise((r) => falso.listen(4000, '127.0.0.1', r));
  await c.close();

  // ===== 2. Admin da Empresa não usa WhatsApp =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678');
  ok('Admin não tem WhatsApp no menu', (await p.locator('aside nav >> text=WhatsApp').count()) === 0);
  await p.goto(BASE + '/whatsapp'); await p.waitForTimeout(800);
  ok('Admin que abre /whatsapp volta para o dashboard', p.url().endsWith('/dashboard'), p.url());
  ok('Admin recebe 403 na API do WhatsApp', (await p.request.get(BASE + '/api/whatsapp/proprio')).status() === 403);
  await c.close();

  // ===== 3. Super Admin: número da plataforma e avisos =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.click('aside nav >> text=Número da plataforma'); await p.waitForURL('**/numero-plataforma');
  ok('Tela "Número da plataforma" abre', (await p.locator('h1:has-text("Número da plataforma")').count()) === 1);
  await p.click('button:has-text("Conectar WhatsApp")'); await espera(800);
  ok('Conectar usa a sessão "plataforma"', chamadas.some((x) => x.url === '/sessoes/plataforma/conectar'));
  await p.click('button:has-text("Enviar mensagem de teste")'); await espera(800);
  ok('Teste sem número salvo: pede para salvar', (await p.locator('text=Salve primeiro o número').count()) === 1);
  await p.fill('#numeroAvisos', '12'); await p.click('form button:has-text("Salvar")'); await espera(800);
  ok('Número inválido recusado', (await p.locator('text=Informe o WhatsApp com DDD').count()) === 1);
  await p.fill('#numeroAvisos', '(11) 91234-5678'); await p.click('form button:has-text("Salvar")'); await espera(800);
  ok('Número dos avisos salvo com DDI', sql(`select "numeroAvisos" from "ConfigVenda" where id='config'`) === '5511912345678');
  await p.click('button:has-text("Enviar mensagem de teste")'); await espera(800);
  ok('Plataforma desconectada: avisa', (await p.locator('text=WhatsApp não conectado').count()) >= 1);
  plataformaConectada = true;
  sql(`insert into "WhatsappSessao"(id,status,numero,"conectadoEm","atualizadoEm") values ('plataforma','CONECTADO','5511900001111',now(),now())
       on conflict (id) do update set status='CONECTADO', numero='5511900001111', "conectadoEm"=now()`);
  await p.click('button:has-text("Enviar mensagem de teste")'); await espera(800);
  const teste = chamadas.filter((x) => x.url === '/sessoes/plataforma/enviar').pop();
  ok('Mensagem de teste vai para o número dos avisos', teste && teste.corpo.para === '5511912345678' && (await p.locator('text=Mensagem de teste enviada').count()) >= 1);
  await espera(3000);
  await p.screenshot({ path: OUT + '/numero-plataforma.png', fullPage: true });
  await c.close();

  // ===== 4. Novo pedido avisa o Super Admin pelo WhatsApp (decisão #38) =====
  const antes = chamadas.length;
  const plano = sql(`select id from "Plano" where nome='Padrão'`);
  const email = `aviso${Date.now().toString().slice(-6)}@empresa.com`;
  const rp = await fetch(BASE + '/api/pedidos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planoId: plano, nome: 'Cliente Aviso', email, whatsapp: '11955554444', empresaNome: 'Empresa Aviso' }) });
  const jp = await rp.json();
  await espera(1500);
  const aviso = chamadas.slice(antes).find((x) => x.url === '/sessoes/plataforma/enviar');
  ok('Pedido criado normalmente', rp.ok && !!jp.codigo, JSON.stringify(jp).slice(0, 80));
  ok('Aviso de novo pedido enviado ao Super Admin', !!aviso && aviso.corpo.para === '5511912345678' && aviso.corpo.texto.includes(jp.codigo) && aviso.corpo.texto.includes('Cliente Aviso'));

  // Serviço fora do ar não impede a compra
  await new Promise((r) => falso.close(r));
  const rp2 = await fetch(BASE + '/api/pedidos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planoId: plano, nome: 'Cliente Dois', email: 'b' + email, whatsapp: '11955554444', empresaNome: 'Empresa Dois' }) });
  ok('Com o serviço fora do ar a compra continua funcionando', rp2.ok);

  // Limpeza
  sql(`delete from "Pedido" where email in ('${email}','b${email}')`);
  sql(`delete from "WhatsappSessao" where id in ('plataforma','${ANA}')`);
  sql(`update "ConfigVenda" set "numeroAvisos"='' where id='config'`);
  await b.close();
  console.log(res.join('\n'));
  console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
