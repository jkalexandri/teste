// Teste de ponta a ponta da etapa 8b (site + serviço 24/7 com o motor de disparos LIGADO).
// Sem WhatsApp real aqui: confere que o motor pega a campanha iniciada no site e, como o número
// não está conectado no serviço, pausa sozinho com o motivo certo (as regras de envio são
// testadas em apps/worker/tests/disparos.test.ts; o envio real é testado na VPS).
// Requer: app em http://localhost:3005 e serviço 24/7 em http://127.0.0.1:4000 (sem DISPAROS=desligado).
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, max = 40) => { for (let i = 0; i < max; i++) { if (fn()) return true; await espera(1000); } return false; };

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const ANA_COD = sql(`select codigo from "Usuario" where id='${ANA}'`);
  sql(`delete from "Campanha" where "usuarioId"='${ANA}'`);
  sql(`delete from "Lead" where "usuarioId"='${ANA}'`);
  sql(`insert into "Lead"(id,codigo,nome,telefone,"usuarioId","empresaId","codigoUsuario","codigoEmpresa","atualizadoEm") values ('t8b-1','ELT8B01','Lead Motor','5511990008801','${ANA}','${EMP}','${ANA_COD}','E00001',now())`);
  // No banco o WhatsApp aparece conectado (o site deixa iniciar), mas o serviço não tem a conexão real.
  sql(`insert into "WhatsappSessao"(id,"usuarioId",status,numero,"conectadoEm","atualizadoEm") values ('${ANA}','${ANA}','CONECTADO','5511900002222',now(),now()) on conflict (id) do update set status='CONECTADO'`);
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'], status='ATIVO' where id='${ANA}'`);

  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept());
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await p.click('text=Módulo Empresarial');
  await p.fill('#email', 'ana@empresaexemplo.com.br'); await p.fill('#senha', 'User@12345678'); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  await p.goto(BASE + '/campanhas?aba=nova'); await espera(800);
  await p.fill('#assunto', 'Motor 8b'); await p.fill('#msg', 'Olá {nome}');
  await p.click('[aria-label="Passos da nova campanha"] >> text="Prévia|envio"'); await p.click('button:has-text("Iniciar disparo")');
  ok('Campanha iniciada pelo site', await ate(() => sql(`select status from "Campanha" where assunto='Motor 8b'`) !== '', 10));
  ok('O motor do serviço 24/7 pega a campanha e pausa porque o WhatsApp não está conectado nele', await ate(() => sql(`select status from "Campanha" where assunto='Motor 8b'`) === 'PAUSADA'));
  await p.goto(BASE + '/campanhas?aba=pausada'); await espera(800);
  ok('Tela mostra o motivo e que volta sozinha', (await p.locator('article:has-text("Motor 8b") >> text=WhatsApp desconectado').count()) === 1 && (await p.locator('text=Volta sozinha quando reconectar').count()) === 1);
  ok('Nenhum envio foi feito', sql(`select count(*) from "Envio" e join "Campanha" c on c.id=e."campanhaId" where c.assunto='Motor 8b' and e.status='ENVIADO'`) === '0');
  await p.screenshot({ path: OUT + '/campanha-pausada-auto.png' });
  await b.close();

  sql(`delete from "Campanha" where "usuarioId"='${ANA}'`);
  sql(`delete from "WhatsappSessao" where id='${ANA}'`);
  console.log(res.join('\n'));
  console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
