// Teste de ponta a ponta da decisão #125: upgrade de conta dentro do sistema, pelo dono da conta.
// Cobre: usuário comum não faz upgrade; dono abre pelo selo do topo e pelo aviso de vencimento; só planos iguais ou maiores;
// resumo antes de pagar; valor cheio + soma dos dias; Free começa hoje; entre planos por disparo as sobras passam;
// plano menor recusado pelo servidor.
// Requer: site em http://localhost:3005 e Postgres com seed (PIX manual configurado pela etapa 4a). Asaas desligado.
// Uso: node apps/web/tests/etapa20-upgrade.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 60) => { for (let i = 0; i < vezes; i++) { if (await fn()) return true; await espera(250); } return false; };

(async () => {
  const IND = sql(`select "empresaId" from "Usuario" where email='usuario@disparopro.com.br'`);
  const EMP = sql(`select "empresaId" from "Usuario" where email='admin-empresa@empresaexemplo.com.br'`);
  const P = (nome) => sql(`select id from "Plano" where nome='${nome}'`);
  const [FREE, INDIVIDUAL, BASICO, PADRAO] = [P('Free'), P('Individual'), P('Básico'), P('Padrão')];
  // Guarda o estado das contas e planos de demonstração para devolver no fim
  const salvar = (id) => sql(`select row_to_json(e)::text from (select "planoId", pacote, "expiraEm", "prazoDias", "limiteDisparos", "disparosExtras", "inicioPeriodo", "whatsappsExtras", pacotes, "limiteUsuarios", "limiteLeads", "asaasAssinaturaId" from "Empresa" where id='${id}') e`);
  const antes = { ind: salvar(IND), emp: salvar(EMP) };
  sql(`update "ConfigVenda" set "asaasChave"=null where id='config'`);
  sql(`update "Pedido" set status='CANCELADO' where status='AGUARDANDO'`);
  // O plano Individual passa a permitir 2 números durante o teste (volta no fim)
  const maxWhats = sql(`select "maxWhatsapps" from "Plano" where id='${INDIVIDUAL}'`);
  sql(`update "Plano" set "maxWhatsapps"=2 where id='${INDIVIDUAL}'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, empresarial) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' });
    if (empresarial) await p.click('text=Módulo Empresarial');
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
    await espera(600);
  };
  /** Super Admin confirma o pedido aguardando de um e-mail (como o botão de Pedidos) */
  const confirmarComoSA = async (email) => {
    const [c, p] = await novo();
    await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
    await p.goto(BASE + '/pedidos', { waitUntil: 'networkidle' });
    await p.locator(`tr:has-text("${email}") >> text=Confirmar pagamento`).first().click();
    await ate(() => sql(`select count(*) from "Pedido" where email='${email}' and status='AGUARDANDO' and upgrade`) === '0');
    await c.close();
  };
  const diasEntre = (id, data) => Number(sql(`select ("expiraEm"::date - '${data}'::date) from "Empresa" where id='${id}'`));

  try {
    // ===== 1. Usuário comum da empresa: sem upgrade =====
    let [c, p] = await novo();
    await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', true);
    await p.click('[data-testid=chip-expira]');
    ok('Usuário comum: selo mostra a data e "Fale com o administrador", sem "Fazer upgrade"', (await p.locator('[data-testid=quadro-renovacao]').innerText()).includes('Fale com o administrador') && (await p.locator('[data-testid=botao-upgrade]').count()) === 0);
    // O quadrinho do selo fecha ao clicar fora e com Esc (antes só fechava tocando de novo no selo)
    await p.click('[data-testid=quadro-renovacao]', { position: { x: 20, y: 10 } });
    ok('Clicar DENTRO do quadrinho não fecha', (await p.locator('[data-testid=quadro-renovacao]').count()) === 1);
    await p.mouse.click(400, 500);
    ok('Clicar fora fecha o quadrinho', (await p.locator('[data-testid=quadro-renovacao]').count()) === 0);
    await p.click('[data-testid=chip-expira]');
    ok('Tocar no selo abre de novo', (await p.locator('[data-testid=quadro-renovacao]').count()) === 1);
    await p.keyboard.press('Escape');
    ok('Esc fecha o quadrinho', (await p.locator('[data-testid=quadro-renovacao]').count()) === 0);
    await p.click('[data-testid=chip-expira]'); await p.click('[data-testid=chip-expira]');
    ok('Tocar de novo no selo também fecha', (await p.locator('[data-testid=quadro-renovacao]').count()) === 0);
    await p.click('[data-testid=chip-expira]');
    const r403 = await p.evaluate(async () => (await fetch('/api/upgrade')).status);
    ok('Usuário comum: servidor recusa o upgrade', r403 === 403);
    await c.close();

    // ===== 2. Individual: Free → Individual começa hoje (item d), aberto pelo aviso de vencimento =====
    sql(`update "Empresa" set "planoId"='${FREE}', pacote='Free', "expiraEm"=now() + interval '5 days', "limiteDisparos"=20, "whatsappsExtras"=0, "prazoDias"=7 where id='${IND}'`);
    [c, p] = await novo();
    await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
    ok('Dono: aviso de vencimento com "Fazer upgrade ou renovar"', await ate(async () => (await p.locator('[data-testid=aviso-upgrade]').count()) === 1));
    await p.click('[data-testid=aviso-upgrade]');
    ok('Abre o popup de upgrade com os planos', await ate(async () => (await p.locator('[data-testid=popup-upgrade] article').count()) >= 1));
    await p.locator('[data-testid=popup-upgrade] article:has-text("Individual")').first().locator('[data-parte=botao]').click(); await espera(400);
    const resumoFree = await p.locator('[data-testid=resumo-upgrade]').innerText();
    ok('Resumo do Free: valor cheio e "o plano começa hoje"', resumoFree.includes('29,90') && resumoFree.includes('começa hoje'), resumoFree.slice(0, 160));
    await p.screenshot({ path: OUT + '/upgrade-resumo.png' });
    await p.click('[data-testid=popup-upgrade] button:has-text("Gerar PIX")');
    ok('Pedido de upgrade gerado (PIX)', await ate(() => sql(`select count(*) from "Pedido" where "empresaId"='${IND}' and upgrade and status='AGUARDANDO'`) === '1'));
    await c.close();
    await confirmarComoSA('usuario@disparopro.com.br');
    ok('Free → Individual: vence em hoje + 31 dias (os dias do teste não somam)', diasEntre(IND, sql(`select current_date::text`)) === 31, String(diasEntre(IND, sql(`select current_date::text`))));
    ok('Free → Individual: plano trocado e sem limite de disparos', sql(`select "planoId"||'|'||coalesce("limiteDisparos"::text,'sem')||'|'||"disparosExtras" from "Empresa" where id='${IND}'`) === `${INDIVIDUAL}|sem|0`);

    // ===== 3. Individual pago: mesmo plano com mais um número, pelo selo do topo; soma os dias (item c) =====
    const venc1 = sql(`select "expiraEm"::date::text from "Empresa" where id='${IND}'`);
    [c, p] = await novo();
    await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
    await p.click('[data-testid=chip-expira]'); await p.click('[data-testid=botao-upgrade]');
    await ate(async () => (await p.locator('[data-testid=popup-upgrade] article').count()) >= 1);
    ok('Plano atual marcado "Seu plano"', (await p.locator('[data-testid=popup-upgrade] article:has-text("Seu plano")').count()) >= 1);
    const card = p.locator('[data-testid=popup-upgrade] article:has-text("Individual")').first();
    await card.locator('[data-testid=qtd-2]').click();
    await card.locator('[data-parte=botao]').click(); await espera(400);
    const resumo2 = await p.locator('[data-testid=resumo-upgrade]').innerText();
    ok('Resumo: dias que faltavam somados', resumo2.includes('foram somados'), resumo2.slice(0, 160));
    // Plano menor (voltar a 1 número) é recusado pelo servidor (item e)
    const menor = await p.evaluate(async (id) => { const r = await fetch('/api/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planoId: id, quantidade: 1 }) }); return { s: r.status, d: await r.json() }; }, INDIVIDUAL);
    ok('Plano igual é aceito; menor seria recusado depois do upgrade', menor.s === 200);
    sql(`update "Pedido" set status='CANCELADO' where "empresaId"='${IND}' and status='AGUARDANDO'`);
    await p.click('[data-testid=popup-upgrade] button:has-text("Gerar PIX")');
    await ate(() => sql(`select count(*) from "Pedido" where "empresaId"='${IND}' and upgrade and status='AGUARDANDO'`) === '1');
    await c.close();
    await confirmarComoSA('usuario@disparopro.com.br');
    ok('Mesmo plano com 2 números: +31 dias sobre o vencimento e 1 extra', diasEntre(IND, venc1) === 31 && sql(`select "whatsappsExtras" from "Empresa" where id='${IND}'`) === '1', String(diasEntre(IND, venc1)));
    [c, p] = await novo();
    await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
    const recusa = await p.evaluate(async (id) => { const r = await fetch('/api/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planoId: id, quantidade: 1 }) }); return { s: r.status, d: await r.json() }; }, INDIVIDUAL);
    ok('Plano menor (menos números) recusado: "aguarde a renovação"', recusa.s === 400 && String(recusa.d.erro).includes('aguarde a renovação'), JSON.stringify(recusa));
    await c.close();

    // ===== 4. Empresarial por disparo → por disparo maior: as sobras passam (item c) =====
    sql(`update "Plano" set "disparosPorPeriodo"=300 where id='${BASICO}'`);
    sql(`update "Plano" set "disparosPorPeriodo"=500 where id='${PADRAO}'`);
    sql(`update "Empresa" set "planoId"='${BASICO}', pacote='Básico', "limiteDisparos"=300, "disparosExtras"=0, "inicioPeriodo"=now(), pacotes=1, "prazoDias"=31 where id='${EMP}'`);
    const sobra = Number(sql(`select 300 - count(*) from "Envio" en join "Campanha" ca on ca.id=en."campanhaId" where ca."empresaId"='${EMP}' and en.status='ENVIADO' and en."enviadoEm" >= (select "inicioPeriodo" from "Empresa" where id='${EMP}')`));
    const venc2 = sql(`select "expiraEm"::date::text from "Empresa" where id='${EMP}'`);
    [c, p] = await novo();
    await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', true);
    await p.click('[data-testid=chip-expira]'); await p.click('[data-testid=botao-upgrade]');
    await ate(async () => (await p.locator('[data-testid=popup-upgrade] article').count()) >= 1);
    // A aba do popup fica na de "Por disparo" (planos com disparos)
    const abaQtd = p.locator('[data-testid=popup-upgrade] [data-testid=aba-planos-quantidade]');
    if (await abaQtd.count()) await abaQtd.click();
    await p.locator('[data-testid=popup-upgrade] article:has-text("Padrão")').first().locator('[data-parte=botao]').click(); await espera(400);
    const resumo3 = await p.locator('[data-testid=resumo-upgrade]').innerText();
    ok('Resumo: disparos que sobraram passam para o novo período', resumo3.includes('disparos') && resumo3.includes('sobraram'), resumo3.slice(0, 200));
    await p.click('[data-testid=popup-upgrade] button:has-text("Gerar PIX")');
    await ate(() => sql(`select count(*) from "Pedido" where "empresaId"='${EMP}' and upgrade and status='AGUARDANDO'`) === '1');
    await c.close();
    await confirmarComoSA('admin-empresa@empresaexemplo.com.br');
    ok('Básico → Padrão: limite 500 e as sobras como extras', sql(`select "limiteDisparos"||'|'||"disparosExtras" from "Empresa" where id='${EMP}'`) === `500|${sobra}`, sql(`select "limiteDisparos"||'|'||"disparosExtras" from "Empresa" where id='${EMP}'`));
    ok('Básico → Padrão: +31 dias sobre o vencimento', diasEntre(EMP, venc2) === 31, String(diasEntre(EMP, venc2)));
    // Agora no Padrão: o Básico (menor) não aparece
    [c, p] = await novo();
    await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', true);
    const lista = await p.evaluate(async () => (await (await fetch('/api/upgrade')).json()).planos.map((x) => x.nome));
    ok('Só planos iguais ou maiores: Básico não aparece para quem está no Padrão', !lista.includes('Básico') && lista.includes('Padrão'), lista.join(','));
    await c.close();
  } catch (e) {
    ok('Erro inesperado', false, String(e.message).split('\n')[0].slice(0, 200));
  } finally {
    await b.close();
    // Limpeza: contas e planos de demonstração como estavam
    sql(`update "Plano" set "disparosPorPeriodo"=null where id in ('${BASICO}','${PADRAO}')`);
    sql(`update "Plano" set "maxWhatsapps"=${maxWhats} where id='${INDIVIDUAL}'`);
    for (const [id, j] of [[IND, antes.ind], [EMP, antes.emp]]) {
      const v = JSON.parse(j);
      const val = (x) => (x == null ? 'null' : typeof x === 'number' ? x : `'${String(x).replace(/'/g, "''")}'`);
      sql(`update "Empresa" set ${Object.entries(v).map(([k, x]) => `"${k}"=${val(x)}`).join(', ')} where id='${id}'`);
    }
    sql(`update "Pedido" set status='CANCELADO' where status='AGUARDANDO'`);
  }
  const f = res.filter((x) => x.startsWith('FALHOU')).length;
  console.log(res.join('\n'));
  console.log(`\nResultado: ${res.length - f} passaram, ${f} falharam`);
  process.exit(f ? 1 : 0);
})();
