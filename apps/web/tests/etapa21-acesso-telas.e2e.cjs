// Teste de ponta a ponta da decisão #130 (falha C1 da auditoria do Módulo 4): nenhuma tela entrega conteúdo
// a quem não pode vê-la — nem abrindo direto, nem pela navegação interna do site (pedido com cabeçalho "RSC: 1").
// Para cada perfil, percorre TODAS as telas da área logada:
//  - tela permitida: abre normalmente;
//  - tela proibida: abrir direto leva ao Dashboard e a resposta interna não traz nada da tela
//    (nem o título, nem o QR do número da plataforma, nem e-mail de cliente).
// Requer: app em http://localhost:3005 e Postgres de teste com seed.
// Uso: node apps/web/tests/etapa21-acesso-telas.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);

// Todas as telas da área logada, lidas das pastas (as dinâmicas ganham um exemplo; a de "em construção" fica de fora)
function telas() {
  const raiz = path.join(__dirname, '..', 'app', '(app)');
  const saida = [];
  const andar = (dir, rota) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith('[...')) continue;
      const seg = e.name === '[tipo]' ? 'empresarial' : e.name === '[manual]' ? null : e.name;
      if (seg === null) continue;
      const r = `${rota}/${seg}`;
      if (fs.existsSync(path.join(dir, e.name, 'page.tsx'))) saida.push(r);
      andar(path.join(dir, e.name), r);
    }
  };
  andar(raiz, '');
  return saida.sort();
}

const PERFIS = [
  { nome: 'Super Admin', email: 'superadmin@disparopro.com.br', senha: 'Super@12345678' },
  { nome: 'Admin da Empresa', email: 'admin-empresa@empresaexemplo.com.br', senha: 'Admin@12345678', modulo: 'Módulo Business' },
  { nome: 'Usuário Individual', email: 'usuario@disparopro.com.br', senha: 'User@12345678' },
  { nome: 'Usuário de empresa', email: 'ana@empresaexemplo.com.br', senha: 'User@12345678', modulo: 'Módulo Business' },
];

(async () => {
  const ROTAS = telas();
  ok(`Telas encontradas para testar (${ROTAS.length})`, ROTAS.length >= 35, ROTAS.length + '');
  // Número da plataforma com QR na tela (o caso da auditoria) e um e-mail de cliente em Pedidos
  sql(`insert into "WhatsappSessao"(id,status,qr,"qrEm","atualizadoEm") values ('plataforma','AGUARDANDO_QR','QR-TESTE-C1',now(),now()) on conflict (id) do update set status='AGUARDANDO_QR', qr='QR-TESTE-C1', "qrEm"=now()`);
  const EMAIL_PEDIDO = sql(`select email from "Pedido" where email <> '' order by "criadoEm" desc limit 1`);

  const b = await chromium.launch();
  const titulos = {}; // título de cada tela, visto por quem pode abrir
  const proibidas = []; // [perfil, rota]
  const contextos = [];
  for (const perfil of PERFIS) {
    const c = await b.newContext(); const p = await c.newPage(); contextos.push({ perfil, p });
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    if (perfil.modulo) await p.click(`text=${perfil.modulo}`);
    await p.fill('#email', perfil.email); await p.fill('#senha', perfil.senha); await p.click('button[type=submit]');
    await p.waitForURL('**/dashboard', { timeout: 20000 });
    let permitidas = 0;
    for (const r of ROTAS) {
      await p.goto(BASE + r, { waitUntil: 'domcontentloaded' });
      const final = new URL(p.url()).pathname;
      if (final === r) {
        permitidas++;
        const h = await p.locator('main h1, section h1').first().innerText({ timeout: 3000 }).catch(() => '');
        if (h && !titulos[r]) titulos[r] = h.trim();
      } else proibidas.push([perfil, r]);
    }
    ok(`${perfil.nome}: abre as telas dele (${permitidas})`, permitidas > 0);
  }

  // Telas proibidas: a resposta da navegação interna não pode trazer nada da tela
  const vazadas = [];
  for (const [perfil, r] of proibidas) {
    const { p } = contextos.find((x) => x.perfil === perfil);
    const t = await p.evaluate(async (u) => (await fetch(u, { headers: { RSC: '1' } })).text(), r);
    const motivos = [];
    // O título da tela, do jeito que o cabeçalho dela o mostra (a palavra solta pode aparecer na descrição do site)
    if (titulos[r] && t.includes(`"children":${JSON.stringify(titulos[r])}`) && !['Dashboard', 'Ajuda'].includes(titulos[r])) motivos.push('título');
    if (t.includes('data:image/png')) motivos.push('QR');
    if (EMAIL_PEDIDO && t.includes(EMAIL_PEDIDO)) motivos.push('e-mail de cliente');
    if (motivos.length) vazadas.push(`${perfil.nome} ${r}: ${motivos.join(', ')}`);
  }
  ok(`Nenhuma tela proibida entrega conteúdo (${proibidas.length} combinações perfil × tela)`, vazadas.length === 0, vazadas.slice(0, 6).join(' | '));

  // Casos da auditoria, explícitos
  const usuario = contextos.find((x) => x.perfil.nome === 'Usuário Individual').p;
  const plat = await usuario.evaluate(async () => (await fetch('/numero-plataforma', { headers: { RSC: '1' } })).text());
  ok('Usuário comum NÃO recebe o QR do número da plataforma', !plat.includes('data:image/png') && !plat.includes('QR-TESTE-C1'));
  const ped = await usuario.evaluate(async () => (await fetch('/pedidos', { headers: { RSC: '1' } })).text());
  ok('Usuário comum NÃO recebe dados de Pedidos', !EMAIL_PEDIDO || !ped.includes(EMAIL_PEDIDO));
  const sa = contextos.find((x) => x.perfil.nome === 'Super Admin').p;
  await sa.goto(BASE + '/numero-plataforma'); await sa.waitForTimeout(800);
  ok('Super Admin continua vendo o Número da plataforma com o QR', (await sa.locator('img[alt="QR Code para conectar o WhatsApp"]').count()) === 1);

  sql(`update "WhatsappSessao" set status='DESCONECTADO', qr=null, "qrEm"=null where id='plataforma'`);
  await b.close();
  console.log(res.join('\n'));
  console.log(`\n${res.filter((x) => x.startsWith('PASSOU')).length}/${res.length} verificações passaram`);
  process.exit(res.some((x) => x.startsWith('FALHOU')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
