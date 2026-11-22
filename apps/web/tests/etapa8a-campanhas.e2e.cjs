// Teste de ponta a ponta da etapa 8a (tela de Campanhas, sem o envio real — prompt seções 8 e 9, decisões #57, #62, #64–#68).
// Requer: app em http://localhost:3005, serviço 24/7 local em http://127.0.0.1:4000 (anexos) e Postgres com seed.
// Uso: node apps/web/tests/etapa8a-campanhas.e2e.cjs <pasta-prints>
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASSOU' : 'FALHOU'} — ${n}${x ? ' (' + x + ')' : ''}`);
const OUT = process.argv[2];
const ARQ = (n) => path.join(__dirname, 'arquivos', n);
const EMP = 'teste-empresa-exemplo';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (fn) => { for (let i = 0; i < 30; i++) { if (fn()) return true; await espera(200); } return false; };

(async () => {
  // ---- Estado inicial: Ana com leads conhecidos e WhatsApp "conectado" ----
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  const ANA_COD = sql(`select codigo from "Usuario" where id='${ANA}'`);
  const SA = sql(`select id from "Usuario" where email='superadmin@disparopro.com.br'`);
  sql(`delete from "Campanha" where "usuarioId" in ('${ANA}','${SA}')`);
  sql(`delete from "Arquivo" where "usuarioId"='${ANA}'`);
  sql(`delete from "Lead" where "usuarioId"='${ANA}'`);
  const ins = (cod, nome, tel, extra = '') => sql(`insert into "Lead"(id,codigo,nome,telefone,"usuarioId","empresaId","codigoUsuario","codigoEmpresa","atualizadoEm"${extra ? ',' + extra.split('=')[0] : ''}) values ('t8-${cod}','${cod}','${nome}','${tel}','${ANA}','${EMP}','${ANA_COD}','E00001',now()${extra ? ',' + extra.split('=').slice(1).join('=') : ''})`);
  ins('ELT8001', 'Carla Novo', '5511990000001');
  ins('ELT8002', 'Diego Novo', '5511990000002');
  ins('ELT8003', 'Inativo', '5511990000003', 'ativo=false');
  sql(`insert into "Lead"(id,codigo,nome,telefone,status,"pediuSairEm","usuarioId","empresaId","codigoUsuario","codigoEmpresa","atualizadoEm") values ('t8-ELT8004','ELT8004','Saiu Recente','5511990000004','PEDIU_SAIR',now()-interval '10 day','${ANA}','${EMP}','${ANA_COD}','E00001',now())`);
  sql(`insert into "Lead"(id,codigo,nome,telefone,status,"pediuSairEm","usuarioId","empresaId","codigoUsuario","codigoEmpresa","atualizadoEm") values ('t8-ELT8005','ELT8005','Saiu Antigo','5511990000005','PEDIU_SAIR',now()-interval '60 day','${ANA}','${EMP}','${ANA_COD}','E00001',now())`);
  sql(`insert into "WhatsappSessao"(id,"usuarioId",status,numero,"conectadoEm","atualizadoEm") values ('${ANA}','${ANA}','CONECTADO','5511900002222',now(),now()) on conflict (id) do update set status='CONECTADO'`);
  sql(`update "Empresa" set "janelaInicio"=480, "janelaFim"=1200, ativa=true, "expiraEm"=(current_date+40)::timestamp where id='${EMP}'`);
  sql(`update "Usuario" set permissoes=ARRAY['leads','campanhas','conversas','arquivos','empresa-ia'], status='ATIVO' where id='${ANA}'`);
  sql(`delete from "ConfigEnvio"`);

  const b = await chromium.launch();
  let motivoPrompt = 'Motivo do teste';
  const novo = async () => { const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await c.newPage(); p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? motivoPrompt : undefined)); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard');
  };
  const passo = (p, nome) => p.click(`[role=tablist][aria-label="Passos da nova campanha"] >> text="${nome}"`);
  const camp = (filtro) => sql(`select status||'|'||"totalLeads" from "Campanha" where "usuarioId"='${ANA}' and ${filtro} order by "criadoEm" desc limit 1`);

  // ===== 1. Usuário monta a campanha =====
  let [c, p] = await novo();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
  await p.click('aside nav >> text=Campanhas'); await p.waitForURL('**/campanhas'); await espera(600);
  const abas = await p.locator('nav[aria-label="Abas de campanhas"] a').allInnerTexts();
  ok('6 abas, e a aba Nova sem quantidade', abas.length === 6 && abas[0].trim() === 'Nova' && abas.slice(1).every((t) => /\(\d+\)/.test(t)), abas.join(' | '));
  ok('Passos Mensagem, Leads, Antibloqueio, Prévia|envio', (await p.locator('[aria-label="Passos da nova campanha"] [role=tab]').allInnerTexts()).join(',') === 'Mensagem,Leads,Antibloqueio,Prévia|envio');
  await p.fill('#assunto', 'Campanha Teste 8a');
  await p.fill('#msg', '{saudacao} {nome}, tudo bem? Veja www.exemplo.com.br');
  ok('Aba Mensagem sem os campos de Variação 1, 2 e 3 (#70)', (await p.locator('text=Variação 1').count()) === 0);
  ok('Aviso de link na mensagem (#64)', (await p.locator('[data-testid=aviso-link]').count()) === 1);
  ok('"Atualizar prévia" aguarda a IA (etapa 9 — #68)', await p.locator('button:has-text("Atualizar prévia")').isDisabled());
  await p.setInputFiles('input[aria-label="Escolher arquivo para anexar"]', ARQ('oferta.png'));
  ok('Anexo enviado para a VPS (#67)', await ate(() => sql(`select count(*) from "Arquivo" where "usuarioId"='${ANA}' and nome='oferta.png'`) === '1'));
  const arqId = sql(`select id from "Arquivo" where "usuarioId"='${ANA}' limit 1`);
  ok('Arquivo guardado no serviço 24/7', execSync(`test -f /var/tmp/filapro-arquivos/${arqId} && echo sim || echo nao`).toString().trim() === 'sim');
  await p.click('button:has-text("Salvar rascunho")');
  ok('Salvar rascunho na aba Mensagem', await ate(() => camp(`assunto='Campanha Teste 8a'`).startsWith('RASCUNHO')));
  ok('Mensagem do rascunho salva', (await p.locator('[data-testid=aviso-campanha]').innerText()).includes('Rascunho salvo'));

  // Leads
  await passo(p, 'Leads'); await espera(1200);
  const rl = await p.locator('[data-testid=resumo-leads]').innerText();
  ok('Só leads ativos; quem saiu há < 45 dias fica bloqueado (#57)', rl.includes('2 leads prontos') && rl.includes('1 pediram para sair há menos de 45 dias'), rl.replace(/\s+/g, ' '));
  ok('Quem saiu há > 45 dias: pergunta, com Retirar como padrão (#57)', (await p.locator('[data-testid=aviso-sair]').innerText()).includes('Saiu Antigo'));
  await p.click('[data-testid=aviso-sair] >> button:has-text("Manter")'); await espera(1200);
  ok('Manter inclui o lead', (await p.locator('[data-testid=resumo-leads]').innerText()).includes('3 leads prontos'));

  // Antibloqueio
  await passo(p, 'Antibloqueio'); await espera(300);
  await p.click('[role=radio]:has-text("Equilibrado")');
  const rr = await p.locator('[data-testid=resumo-regras]').innerText();
  ok('Resumo das regras atualiza com o modo (Equilibrado)', rr.includes('de 20 a 40 seg.') && rr.includes('350 por dia'), rr.replace(/\s+/g, ' ').slice(0, 120));
  ok('Janela do usuário de empresa vem do Admin', rr.includes('definida pelo administrador'));
  await p.click('button:has-text("(Editar)")');
  await p.fill('textarea[aria-label="Texto de cancelamento de subscrição"]', 'Texto mudado');
  await p.click('[aria-label="Texto de cancelamento"] >> button:has-text("Restaurar")');
  ok('Restaurar volta ao texto padrão (#66)', (await p.inputValue('textarea[aria-label="Texto de cancelamento de subscrição"]')).includes('responda *SAIR*'));
  await p.click('[aria-label="Texto de cancelamento"] >> button:has-text("Salvar")');
  await p.click('button:has-text("Salvar rascunho")'); await espera(1000);
  ok('Salvar rascunho na aba Antibloqueio guarda o modo', sql(`select modo from "Campanha" where assunto='Campanha Teste 8a'`) === 'EQUILIBRADO');
  await p.screenshot({ path: OUT + '/campanha-antibloqueio.png', fullPage: true });

  // Prévia|envio
  await passo(p, 'Prévia|envio'); await espera(1200);
  const bolha = await p.locator('[data-testid=bolha-previa]').innerText();
  ok('Prévia com nome de exemplo e descadastro', /(Oi|Olá|Bom dia|Boa tarde|Boa noite) Maria, tudo bem\?/.test(bolha) && bolha.includes('responda SAIR'), bolha.replace(/\s+/g, ' ').slice(0, 90));
  ok('Imagem anexada aparece na prévia', await p.locator('[data-testid=bolha-previa] img').evaluate((i) => i.complete && i.naturalWidth > 0));
  ok('Prévia sem os botões Var 1, 2, 3 quando não há variações (#70)', (await p.locator('[aria-label="Prévia da mensagem"]').count()) === 0);
  ok('Sem botão Salvar rascunho na Prévia|envio', (await p.locator('button:has-text("Salvar rascunho")').count()) === 0);
  const botoes = await p.locator('button').allInnerTexts();
  ok('Agendar antes de Iniciar (prompt seção 8)', botoes.findIndex((t) => t.includes('Agendar envio')) < botoes.findIndex((t) => t.includes('Iniciar disparo')));
  await p.screenshot({ path: OUT + '/campanha-previa.png', fullPage: true });
  await p.click('button:has-text("Iniciar disparo")');
  ok('Iniciar: campanha em andamento com a fila criada', await ate(() => camp(`assunto='Campanha Teste 8a'`) === 'EM_ANDAMENTO|3'));
  ok('Fila com 3 envios pendentes (sem o inativo e sem quem saiu há < 45 dias)', sql(`select count(*) from "Envio" e join "Campanha" c on c.id=e."campanhaId" where c.assunto='Campanha Teste 8a' and e.status='PENDENTE'`) === '3');
  await espera(800);
  ok('Formulário limpo depois de iniciar', (await p.inputValue('#assunto')) === '');

  // Em andamento: pausar, retomar, cancelar
  await p.goto(BASE + '/campanhas?aba=em-andamento'); await espera(800);
  ok('Em andamento lista a campanha', (await p.locator('tr:has-text("Campanha Teste 8a")').count()) === 1);
  await p.click('tr:has-text("Campanha Teste 8a") >> button:has-text("Pausar")');
  ok('Pausar', await ate(() => camp(`assunto='Campanha Teste 8a'`).startsWith('PAUSADA')));
  await p.goto(BASE + '/campanhas?aba=pausada'); await espera(800);
  await p.click('article:has-text("Campanha Teste 8a") >> button:has-text("Retomar")');
  ok('Retomar', await ate(() => camp(`assunto='Campanha Teste 8a'`).startsWith('EM_ANDAMENTO')));
  await p.goto(BASE + '/campanhas?aba=em-andamento'); await espera(800);
  await p.click('tr:has-text("Campanha Teste 8a") >> button:has-text("Cancelar")');
  ok('Cancelar com motivo', await ate(() => sql(`select status||'|'||motivo from "Campanha" where assunto='Campanha Teste 8a'`) === 'CANCELADA|Motivo do teste'));
  ok('Cancelar tira os envios da fila', sql(`select count(*) from "Envio" e join "Campanha" c on c.id=e."campanhaId" where c.assunto='Campanha Teste 8a' and e.status='PENDENTE'`) === '0');
  await p.goto(BASE + '/campanhas?aba=cancelada'); await espera(800);
  ok('Cancelada mostra o motivo e NÃO tem Duplicar', (await p.locator('article:has-text("Campanha Teste 8a") >> text=Motivo do teste').count()) === 1 && (await p.locator('button:has-text("Duplicar")').count()) === 0);

  // Concluída: duplicar vira rascunho
  sql(`update "Campanha" set status='CONCLUIDA' where assunto='Campanha Teste 8a'`);
  await p.goto(BASE + '/campanhas?aba=concluida'); await espera(800);
  await p.click('article:has-text("Campanha Teste 8a") >> button:has-text("Duplicar")'); await p.waitForURL('**editar=*'); await espera(800);
  ok('Duplicar concluída abre a cópia como rascunho', (await p.inputValue('#assunto')) === 'Campanha Teste 8a (cópia)' && camp(`assunto='Campanha Teste 8a (cópia)'`).startsWith('RASCUNHO'));
  await p.goto(BASE + '/campanhas?aba=rascunho'); await espera(800);
  ok('Rascunho sem botão de iniciar (prompt seção 8)', (await p.locator('article:has-text("(cópia)") >> button:has-text("Iniciar")').count()) === 0);
  await p.click('article:has-text("(cópia)") >> button:has-text("Excluir")');
  ok('Excluir rascunho', await ate(() => sql(`select count(*) from "Campanha" where assunto like '%(cópia)'`) === '0'));

  // Agendar
  await p.goto(BASE + '/campanhas?aba=nova'); await espera(800);
  await p.fill('#assunto', 'Agendada 8a'); await p.fill('#msg', 'Olá {nome}');
  await passo(p, 'Prévia|envio'); await espera(500);
  await p.click('button:has-text("Agendar envio")');
  const amanha = new Date(Date.now() + 86400000 + 3 * 3600000); // horário de Brasília (UTC-3) de amanhã
  const v = amanha.toISOString().slice(0, 10) + 'T10:00';
  await p.fill('#agendar-em', v); await p.click('button:has-text("Confirmar agendamento")');
  ok('Agendar cria campanha AGENDADA para a data escolhida', await ate(() => sql(`select status||'|'||to_char(("agendadaPara" at time zone 'UTC') at time zone 'America/Sao_Paulo','HH24:MI') from "Campanha" where assunto='Agendada 8a'`) === 'AGENDADA|10:00'));
  await p.goto(BASE + '/campanhas?aba=em-andamento'); await espera(800);
  ok('Agendada aparece em Em andamento', (await p.locator('tr:has-text("Agendada 8a") >> text=Agendada para').count()) === 1);

  // Iniciar sem WhatsApp
  sql(`update "WhatsappSessao" set status='DESCONECTADO' where id='${ANA}'`);
  await p.goto(BASE + '/campanhas?aba=nova'); await espera(800);
  ok('Aviso de WhatsApp desconectado', (await p.locator('text=Seu WhatsApp não está conectado').count()) === 1);
  await p.fill('#assunto', 'Sem WhatsApp'); await p.fill('#msg', 'Olá');
  await passo(p, 'Prévia|envio'); await p.click('button:has-text("Iniciar disparo")'); await espera(1200);
  ok('Não inicia sem WhatsApp conectado', (await p.locator('[data-testid=aviso-campanha]').innerText()).includes('Conecte o seu WhatsApp'));
  await p.click('aside nav >> text=Arquivos'); await p.waitForURL('**/arquivos'); await espera(500);
  ok('Arquivos lista o anexo e onde foi usado', (await p.locator('tr:has-text("oferta.png") >> text=Campanha Teste 8a').count()) === 1);
  await c.close();

  // ===== 2. Admin da Empresa =====
  [c, p] = await novo();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  ok('Admin não tem Campanhas no menu', (await p.locator('aside nav >> text=Campanhas').count()) === 0);
  await p.goto(BASE + '/campanhas'); await espera(600);
  ok('Admin que abre /campanhas volta ao dashboard', p.url().endsWith('/dashboard'));
  await p.click('aside nav a:has-text("Configurações")'); await p.waitForURL('**/configuracoes');
  await p.fill('#janela-inicio', '06:00'); await p.fill('#janela-fim', '18:00'); await p.click('button:has-text("Salvar janela")'); await espera(800);
  ok('Janela fora da faixa global é recusada (#65)', (await p.locator('text=precisa ficar entre 07:00 e 21:00').count()) === 1);
  await p.fill('#janela-inicio', '09:00'); await p.click('button:has-text("Salvar janela")');
  ok('Admin salva a janela da empresa', await ate(() => sql(`select "janelaInicio"||'-'||"janelaFim" from "Empresa" where id='${EMP}'`) === '540-1080'));
  await c.close();

  // ===== 3. Usuário Individual ajusta a própria janela =====
  [c, p] = await novo();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await p.goto(BASE + '/campanhas'); await espera(600);
  await passo(p, 'Antibloqueio'); await p.click('button:has-text("(Alterar)")');
  await p.fill('#janela-inicio', '08:30'); await p.click('[aria-label="Janela de envio"] >> button:has-text("Salvar janela")');
  ok('Individual ajusta a própria janela (#6)', await ate(() => sql(`select "janelaInicio" from "Empresa" where id='teste-conta-individual'`) === '510'));
  await c.close();

  // ===== 4. Super Admin =====
  [c, p] = await novo();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  ok('Super Admin tem Campanhas, Arquivos e Regras de envio (#62, #65)', (await p.locator('aside nav >> text=Arquivos').count()) === 1 && (await p.locator('aside nav >> text=Regras de envio').count()) === 1);
  await p.click('aside nav >> text=Regras de envio'); await p.waitForURL('**/regras-envio');
  const fer = await p.inputValue('textarea[aria-label=Feriados]');
  ok('Feriados nacionais padrão, com Sexta-feira Santa (#68)', fer.includes('Sexta-feira Santa') && fer.includes('20/11') && fer.includes('25/12') && !/carnaval/i.test(fer), fer.replace(/\n/g, ' '));
  await p.fill('textarea[aria-label=Feriados]', fer + '\n24/12\n31/12/2026');
  await p.fill('#horaMinima', '08:00');
  await p.click('button:has-text("Salvar regras")');
  ok('Super Admin salva faixa global e feriados extras', await ate(() => sql(`select "horaMinima"||'|'||array_to_string(feriados,',') from "ConfigEnvio"`).startsWith('480|') && sql(`select array_to_string(feriados,',') from "ConfigEnvio"`).includes('12-24') && sql(`select array_to_string(feriados,',') from "ConfigEnvio"`).includes('2026-12-31')));
  ok('Janelas abaixo da nova faixa são ajustadas', sql(`select "janelaInicio" from "Empresa" where id='teste-conta-individual'`) === '510' && sql(`select min("janelaInicio") from "Empresa"`) >= '480');
  await p.screenshot({ path: OUT + '/regras-envio.png', fullPage: true });
  await p.click('aside nav >> text=Campanhas'); await p.waitForURL('**/campanhas');
  ok('Super Admin abre Campanhas (próprias)', (await p.locator('h1:has-text("Campanhas")').count()) === 1);
  await c.close();

  // Limpeza
  sql(`delete from "ConfigEnvio"`);
  sql(`update "Empresa" set "janelaInicio"=480, "janelaFim"=1200 where id in ('${EMP}','teste-conta-individual')`);
  sql(`delete from "Campanha" where "usuarioId"='${ANA}'`);
  sql(`delete from "WhatsappSessao" where id='${ANA}'`);
  await b.close();
  console.log(res.join('\n'));
  console.log(`\n${res.filter((r) => r.startsWith('PASSOU')).length}/${res.length} passaram`);
})().catch((e) => { console.error(e); console.log(res.join('\n')); process.exit(1); });
