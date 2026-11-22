// Teste de ponta a ponta da etapa 9b (Empresa | IA — decisões #74, #75, #77 e #78).
// Usa a IA "simulada" (sem custo). Requer: app em http://localhost:3005, serviço 24/7 em :4000
// (DISPAROS=desligado basta) e Postgres com seed.
// Uso: node apps/web/tests/etapa9b-empresa-ia.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const EMP = 'teste-empresa-exemplo', IND = 'teste-conta-individual';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn, vezes = 60) => { for (let i = 0; i < vezes; i++) { if (fn()) return true; await espera(250); } return false; };
const ficha = (emp) => sql(`select id from "FichaEmpresa" where "empresaId"='${emp}'`);

// Arquivos de teste: PDF de 2 páginas e uma imagem PNG
function pdfCom(paginas) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${paginas.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${paginas.length} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  paginas.forEach((t, i) => {
    const c = `BT /F1 12 Tf 72 720 Td (${t}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
  });
  let out = '%PDF-1.4\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e9b-'));
const PDF = path.join(PASTA, 'catalogo.pdf'); fs.writeFileSync(PDF, pdfCom(['Catalogo de imoveis', 'Condicoes de pagamento']));
const PNG = path.join(PASTA, 'folder.png');
fs.writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  // IA simulada nas tarefas usadas aqui; limpa fichas e limites anteriores
  sql(`delete from "ConfigIA"`); sql(`delete from "UsoIA"`);
  sql(`insert into "ConfigIA"(tarefa,provedor,modelo,"urlBase","precoEntrada","precoSaida","atualizadoEm") values ('aprender','simulado','simulado','',0,0,now()),('gerar_mensagens','simulado','simulado','',0,0,now())`);
  sql(`delete from "FichaEmpresa" where "empresaId" in ('${EMP}','${IND}') or "superAdminId" is not null`);
  sql(`update "Empresa" set "treinarIA"=true, "limiteMateriais"=null, "limitePaginasMes"=null where id in ('${EMP}','${IND}')`);
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'], status='ATIVO' where id='${ANA}'`);

  const b = await chromium.launch();
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const adicionar = async (p, aba) => { await p.click(`button:has-text("+ ${aba}")`); await p.waitForSelector('[role=dialog]'); };
  const enviar = async (p) => { await p.click('[role=dialog] >> button:has-text("Ensinar a IA")'); await p.waitForSelector('[role=dialog]', { state: 'detached', timeout: 15000 }).catch(() => {}); };

  // ===== 1. Super Admin: chave única (#78) e o próprio Empresa | IA (#74) =====
  let [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Menu do Super Admin tem Empresa | IA', (await p.locator('aside nav >> text=Empresa | IA').count()) === 1);
  await p.goto(BASE + '/inteligencia-artificial');
  ok('Campo "Chave da Anthropic para todas as tarefas" no topo', (await p.locator('text=Chave da Anthropic para todas as tarefas').count()) === 1);
  await p.fill('#chave-global', 'chave-errada'); await p.click('button:has-text("Salvar chave")'); await espera(800);
  ok('Chave sem "sk-ant-" é recusada', sql(`select count(*) from "ConfigIA" where tarefa='_anthropic'`) === '0');
  await p.fill('#chave-global', 'sk-ant-teste-global-1'); await p.click('button:has-text("Salvar chave")');
  ok('Chave única guardada criptografada', await ate(() => /^v1:/.test(sql(`select coalesce(chave,'') from "ConfigIA" where tarefa='_anthropic'`))) && !sql(`select chave from "ConfigIA" where tarefa='_anthropic'`).includes('sk-ant'));
  await espera(800);
  ok('Tela mostra "Chave salva" sem revelar', (await p.locator('.chip:has-text("Chave salva")').count()) === 1 && (await p.inputValue('#chave-global')) === '');
  await p.screenshot({ path: OUT + '/ia-chave-unica.png', fullPage: true });
  await p.goto(BASE + '/empresa-ia');
  await p.fill('#ei-nome', 'FilaPro Leads'); await p.fill('#ei-atividade', 'Plataforma de prospecção por WhatsApp');
  await p.click('button:has-text("Salvar dados")');
  ok('Super Admin tem a própria ficha', await ate(() => sql(`select count(*) from "FichaEmpresa" where "superAdminId" is not null and nome='FilaPro Leads'`) === '1'));

  // Plano: campos de limite do treinamento (#77)
  await p.goto(BASE + '/planos'); await espera(500);
  await p.locator('button:has-text("Editar")').first().click(); await p.waitForSelector('[role=dialog]');
  ok('Plano tem os limites de treinamento da IA', (await p.locator('#f-limiteMateriais').count()) === 1 && (await p.locator('#f-limitePaginasMes').count()) === 1);
  const planoNome = await p.inputValue('#f-nome');
  await p.locator('[role=dialog] label:has-text("Ilimitado")').nth(1).click(); await p.fill('#f-limiteMateriais', '7');
  await p.click('button:has-text("Salvar plano")');
  ok('Limite de materiais salvo no plano', await ate(() => sql(`select "limiteMateriais" from "Plano" where nome='${planoNome}'`) === '7'));
  sql(`update "Plano" set "limiteMateriais"=null where nome='${planoNome}'`);
  await c.close();

  // ===== 2. Admin da Empresa treina a IA =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  await p.click('aside nav >> text=Empresa | IA'); await p.waitForURL('**/empresa-ia');
  ok('Ficha já vem com o nome da empresa', (await p.inputValue('#ei-nome')).length > 0);
  await p.fill('#ei-endereco', 'Rua das Flores, 100 — Campinas/SP'); await p.fill('#ei-telefone', '(19) 3333-4444');
  await p.fill('#ei-whatsapp', '(19) 99999-0000'); await p.fill('#ei-atividade', 'Limpeza de clínicas e consultórios');
  await p.click('button:has-text("Salvar dados")');
  ok('5 campos salvos', await ate(() => sql(`select atividade from "FichaEmpresa" where "empresaId"='${EMP}'`) === 'Limpeza de clínicas e consultórios'));
  ok('Salvar dados monta a ficha da IA', await ate(() => sql(`select length(resumo) from "FichaEmpresa" where "empresaId"='${EMP}'`) > '0'));

  // Texto
  await adicionar(p, 'Texto'); await p.fill('#mat-titulo', 'Preços'); await p.fill('#mat-texto', 'Limpeza mensal a partir de R$ 900, com produtos inclusos.'); await enviar(p);
  ok('Texto aprendido (status PRONTO e resumo)', await ate(() => sql(`select status||'|'||(length(resumo)>0) from "MaterialIA" where origem='Preços'`) === 'PRONTO|true'));
  // PDF
  await adicionar(p, 'PDF'); await p.setInputFiles('#mat-arquivo', PDF); await enviar(p);
  ok('PDF lido na VPS: 2 páginas', await ate(() => sql(`select status||'|'||paginas from "MaterialIA" where origem='catalogo.pdf'`) === 'PRONTO|2'));
  // Imagem
  await adicionar(p, 'Imagem'); await p.setInputFiles('#mat-arquivo', PNG); await enviar(p);
  ok('Imagem lida pela IA', await ate(() => sql(`select status from "MaterialIA" where origem='folder.png'`) === 'PRONTO'));
  // Tipo não aceito no PDF
  await adicionar(p, 'Imagem'); await p.setInputFiles('#mat-arquivo', PDF); await p.click('[role=dialog] >> button:has-text("Ensinar a IA")'); await espera(1200);
  ok('Imagem: recusa arquivo que não é JPG/PNG', sql(`select count(*) from "MaterialIA" where origem='catalogo.pdf'`) === '1' && (await p.locator('text=Escolha uma imagem JPG ou PNG').count()) >= 1);
  await p.click('[role=dialog] >> button:has-text("Cancelar")');
  // Link para a rede interna (proteção da VPS)
  await adicionar(p, 'Link / Site'); await p.fill('#mat-url', 'http://127.0.0.1:4000/saude'); await enviar(p);
  ok('Link para endereço interno é bloqueado (erro na lista)', await ate(() => sql(`select status from "MaterialIA" where origem='http://127.0.0.1:4000/saude'`) === 'ERRO'));
  await p.reload(); await espera(600);
  ok('Lista mostra o motivo do erro', (await p.locator('text=Endereço inválido ou não permitido').count()) === 1);
  ok('Uso do mês: páginas contadas', (await p.locator('text=Páginas lidas neste mês: 4').count()) === 1, await p.locator('p.help:has-text("Páginas lidas")').innerText());
  ok('Ficha atualizada com os materiais', await ate(() => sql(`select "resumoEm" > now() - interval '2 minutes' from "FichaEmpresa" where "empresaId"='${EMP}'`) === 't'));
  // Ver resumo
  await p.locator('tr:has-text("Preços") >> button:has-text("Ver resumo")').click();
  ok('"Ver resumo" abre o resumo do material', (await p.locator('[role=dialog][aria-label="Resumo do material"]').count()) === 1);
  await p.click('[role=dialog] >> button[aria-label=Fechar]');
  // Ler de novo
  const lidoAntes = sql(`select "lidoEm" from "MaterialIA" where origem='catalogo.pdf'`);
  await p.locator('tr:has-text("catalogo.pdf") >> button:has-text("Ler de novo")').click();
  ok('"Ler de novo" lê o material outra vez', await ate(() => { const d = sql(`select status||'|'||"lidoEm" from "MaterialIA" where origem='catalogo.pdf'`); return d.startsWith('PRONTO|') && d !== 'PRONTO|' + lidoAntes; }));
  await p.reload(); await espera(600);
  await p.screenshot({ path: OUT + '/empresa-ia-admin.png', fullPage: true });
  // Esquecer
  await p.locator('tr:has-text("folder.png") >> button:has-text("Esquecer")').click();
  ok('"Esquecer" apaga o material', await ate(() => sql(`select count(*) from "MaterialIA" where origem='folder.png'`) === '0'));
  await c.close();

  // ===== 3. Usuário da empresa: só vê (#74) =====
  [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
  await p.goto(BASE + '/empresa-ia'); await espera(600);
  ok('Usuário vê a mesma ficha da empresa', (await p.inputValue('#ei-atividade')) === 'Limpeza de clínicas e consultórios' && (await p.locator('[data-testid=ficha-ia]').innerText()).length > 20);
  ok('Usuário não edita nem envia materiais', (await p.locator('#ei-nome').isDisabled()) && (await p.locator('button:has-text("+ Texto")').count()) === 0 && (await p.locator('button:has-text("Esquecer")').count()) === 0);
  // "Atualizar prévia" usa a ficha (registro de uso com a conta)
  await p.goto(BASE + '/campanhas?aba=nova'); await espera(800);
  await p.fill('#assunto', 'Teste ficha'); await p.fill('#referencia', 'Quero apresentar nosso serviço de limpeza para clínicas');
  await p.click('button:has-text("Atualizar prévia")');
  ok('"Atualizar prévia" funciona com a ficha completa', await ate(() => sql(`select count(*) from "UsoIA" where tarefa='gerar_mensagens' and "usuarioId"='${ANA}' and ok`) === '1'));
  await c.close();
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos'] where id='${ANA}'`);
  [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
  await p.goto(BASE + '/empresa-ia'); await espera(600);
  ok('Sem a permissão, o usuário não abre a tela', !p.url().includes('/empresa-ia'));
  await c.close();
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'] where id='${ANA}'`);

  // ===== 4. Super Admin: liga/desliga e limites por conta (#77) =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await p.goto(BASE + '/empresas'); await espera(600);
  const cartao = p.locator('article.card', { has: p.locator('b:has-text("Empresa Exemplo")') }).first();
  await cartao.locator('button:has-text("IA: treino")').click(); await p.waitForSelector('[role=dialog][aria-label="Treinamento da IA"]');
  ok('Popup mostra o uso da conta', (await p.locator('[role=dialog] >> text=/3 \\/ ilimitado materiais/').count()) === 1, await p.locator('[role=dialog] p.help').innerText());
  await p.locator('[role=dialog] input[name=treinarIA]').uncheck();
  await p.locator('[role=dialog] label:has-text("Ilimitado")').first().click(); await p.fill('[role=dialog] input[name=limiteMateriais]', '2');
  await p.click('[role=dialog] >> button:has-text("Salvar")');
  ok('Desligar treino e limite de materiais salvos', await ate(() => sql(`select "treinarIA"||'|'||"limiteMateriais" from "Empresa" where id='${EMP}'`) === 'false|2'));
  await p.screenshot({ path: OUT + '/empresas-treino-ia.png', fullPage: true });
  await p.goto(BASE + '/usuarios-individuais'); await espera(600);
  ok('Controle também em Usuários Individuais', (await p.locator('button:has-text("IA: treino")').count()) > 0);
  await c.close();

  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  await p.goto(BASE + '/empresa-ia'); await espera(600);
  ok('Treino desligado: aviso e sem botões de material', (await p.locator('text=O treinamento da IA está desligado').count()) === 1 && (await p.locator('button:has-text("+ Texto")').count()) === 0);
  sql(`update "Empresa" set "treinarIA"=true where id='${EMP}'`);
  await p.reload(); await espera(600);
  await adicionar(p, 'Texto'); await p.fill('#mat-texto', 'Atendemos de segunda a sábado, das 8h às 18h.'); await p.click('[role=dialog] >> button:has-text("Ensinar a IA")'); await espera(1200);
  ok('Limite de materiais do plano bloqueia material novo', sql(`select count(*) from "MaterialIA" where "fichaId"='${ficha(EMP)}'`) === '3' && (await p.locator('text=/Limite de 2 materiais/').count()) >= 1);
  await c.close();
  sql(`update "Empresa" set "limiteMateriais"=null where id='${EMP}'`);

  // ===== 5. Individual treina a própria IA (#74) =====
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await p.goto(BASE + '/empresa-ia'); await espera(600);
  ok('Individual edita o próprio Empresa | IA', !(await p.locator('#ei-nome').isDisabled()) && (await p.locator('button:has-text("+ Texto")').count()) === 1);
  await p.screenshot({ path: OUT + '/empresa-ia-individual.png', fullPage: true });
  await c.close();

  // ===== 6. Login continua idêntico =====
  [c, p] = await novo();
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); await espera(1500);
  await p.screenshot({ path: OUT + '/login.png' });
  await c.close();

  await b.close();
  sql(`delete from "ConfigIA"`);
  console.log(res.join('\n'));
  const f = res.filter((r) => r.startsWith('FALHOU')).length;
  console.log(`\n${res.length - f}/${res.length} passaram`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
