// Prints das telas para os manuais (decisão #101). Rode a cada versão para os manuais ficarem atualizados:
//   node apps/web/tests/manual-prints.cjs
// Requer: app em http://localhost:3005 (ambiente de teste, com as contas de demonstração) e Postgres com seed.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const sql = (q) => execSync(`psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const BASE = 'http://localhost:3005';
const DEST = path.join(__dirname, '../../../docs/manuais/prints');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const EMP = 'teste-empresa-exemplo';

(async () => {
  const ANA = sql(`select id from "Usuario" where email='ana@empresaexemplo.com.br'`);
  // Dados de exemplo (apagados no fim)
  sql(`delete from "Campanha" where assunto like 'Manual:%'`);
  sql(`delete from "Lead" where codigo like 'MAN-%'`);
  const nomes = ['Mariana Costa', 'João Pereira', 'Fernanda Lima', 'Ricardo Alves', 'Patrícia Gomes', 'Bruno Martins', 'Camila Rocha', 'Diego Souza'];
  const status = ['QUALIFICADO', 'EM_CONVERSA', 'NOVO', 'OBJECAO', 'VENDA_CONCLUIDA', 'NOVO', 'EM_CONVERSA', 'PEDIU_SAIR'];
  const temp = ['QUENTE', 'MORNO', null, 'MORNO', 'QUENTE', null, 'FRIO', null];
  nomes.forEach((n, i) => sql(`insert into "Lead"(id,codigo,nome,telefone,status,"usuarioId","empresaId","codigoUsuario","codigoEmpresa","atualizadoEm",qualificacao,"ultimaMensagemEm","naoLidas") values ('man-${i}','MAN-${i + 1}','${n}','551198800${String(i).padStart(4, '0')}','${status[i]}','${ANA}','${EMP}','EU00002','E00001',now(),${temp[i] ? `'${temp[i]}'` : 'null'},now() - interval '${i * 7} minutes',${i === 0 ? 2 : 0})`));
  sql(`insert into "Mensagem"(id,"leadId",autor,texto,"criadoEm") values
    ('man-m1','man-0','CAMPANHA','Bom dia Mariana, tudo bem? Temos uma condição especial de limpeza para clínicas este mês.',now()-interval '30 minutes'),
    ('man-m2','man-0','LEAD','Oi! Tenho interesse sim, quanto fica para 3 salas?',now()-interval '20 minutes'),
    ('man-m3','man-0','IA','Ótimo! Para 3 salas temos o plano mensal. Qual o melhor dia para uma visita de avaliação sem custo?',now()-interval '19 minutes'),
    ('man-m4','man-0','LEAD','Pode ser na quinta de manhã',now()-interval '2 minutes')`);
  sql(`insert into "Campanha"(id,"usuarioId","empresaId",assunto,mensagem,status,"totalLeads","criadoEm","iniciadaEm","concluidaEm","atualizadoEm") values ('man-c1','${ANA}','${EMP}','Manual: Promoção de dezembro','Oi {nome}, tudo bem?','CONCLUIDA',8,now()-interval '1 day',now()-interval '1 day',now()-interval '20 hours',now())`);
  nomes.forEach((n, i) => sql(`insert into "Envio"(id,"campanhaId","leadId",telefone,nome,ordem,status,"enviadoEm","sessaoId") values ('man-e${i}','man-c1','man-${i}','551198800${String(i).padStart(4, '0')}','${n}',${i},'${i === 7 ? 'PULADO' : 'ENVIADO'}',${i === 7 ? 'null' : "now()-interval '1 day'"},'${ANA}')`));

  // Suporte e mensagem aos usuários (decisão #102)
  sql(`delete from "SuporteConversa" where id='man-sup'`);
  sql(`delete from "Comunicado" where id='man-com'`);
  sql(`insert into "SuporteConversa"(id,"usuarioId","ultimaMensagemEm") values ('man-sup','${ANA}',now())`);
  sql(`insert into "SuporteMensagem"(id,"conversaId",autor,"autorId",texto,"criadoEm") values
    ('man-s1','man-sup','CLIENTE','${ANA}','Olá! Como coloco mais um número na campanha?',now()-interval '6 minutes'),
    ('man-s2','man-sup','SUPORTE','sa','Oi, Ana! No passo 3 (Antibloqueio) da campanha você escolhe os números. Quer que eu te mostre?',now()-interval '4 minutes')`);
  const b = await chromium.launch();
  const ctx = async () => { const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage(); p.on('dialog', (d) => d.dismiss()); return [c, p]; };
  const entrar = async (p, email, senha, modulo) => {
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' }); if (modulo) await p.click(`text=${modulo}`);
    await p.fill('#email', email); await p.fill('#senha', senha); await p.click('button[type=submit]'); await p.waitForURL('**/dashboard'); await espera(800);
  };
  const foto = async (p, nome, url, antes) => {
    if (url) { await p.goto(BASE + url, { waitUntil: 'networkidle' }); await espera(900); }
    if (antes) { await antes(p); await espera(600); }
    await p.screenshot({ path: path.join(DEST, nome + '.png') });
    console.log('ok', nome);
  };

  // Login
  let [c, p] = await ctx();
  await foto(p, 'login', '/login');
  await c.close();

  // Usuário de empresa (Ana)
  [c, p] = await ctx();
  await entrar(p, 'ana@empresaexemplo.com.br', 'User@12345678', 'Módulo Empresarial');
  await foto(p, 'u-dashboard', '/dashboard');
  await foto(p, 'u-leads', '/leads');
  await foto(p, 'u-campanhas', '/campanhas');
  await foto(p, 'u-campanha-nova', '/campanhas?aba=nova');
  await foto(p, 'u-campanha-antibloqueio', null, async (q) => { await q.fill('#assunto', 'Promoção de dezembro'); await q.fill('#msg', 'Oi {nome}, tudo bem?'); await q.click('button:has-text("Próximo")'); await espera(400); await q.click('button:has-text("Próximo")'); });
  await foto(p, 'u-conversas', '/conversas?lead=man-0');
  await foto(p, 'u-arquivos', '/arquivos');
  await foto(p, 'u-whatsapp', '/whatsapp');
  await foto(p, 'u-avisos', '/avisos');
  await foto(p, 'u-empresa-ia', '/empresa-ia');
  await foto(p, 'u-suporte', '/dashboard', async (q) => { await q.click('[data-testid=botao-suporte]'); await espera(1500); });
  await c.close();

  // Usuário individual (anúncios e vários WhatsApps)
  [c, p] = await ctx();
  await entrar(p, 'usuario@disparopro.com.br', 'User@12345678');
  await foto(p, 'u-leads-anuncios', '/leads-anuncios');
  await foto(p, 'u-empresa-ia-individual', '/empresa-ia');
  await c.close();

  // Admin da Empresa
  [c, p] = await ctx();
  await entrar(p, 'admin-empresa@empresaexemplo.com.br', 'Admin@12345678', 'Módulo Empresarial');
  await foto(p, 'a-dashboard', '/dashboard');
  await foto(p, 'a-usuarios', '/usuarios');
  await foto(p, 'a-leads', '/leads');
  await foto(p, 'a-todos-disparos', '/todos-os-disparos');
  await foto(p, 'a-conversas', '/conversas?lead=man-0');
  await foto(p, 'a-empresa-ia', '/empresa-ia');
  await foto(p, 'a-configuracoes', '/configuracoes');
  await foto(p, 'a-logs', '/logs');
  await c.close();

  // Super Admin
  [c, p] = await ctx();
  await entrar(p, 'superadmin@disparopro.com.br', 'Super@12345678');
  await foto(p, 's-dashboard', '/dashboard');
  await foto(p, 's-pedidos', '/pedidos');
  await foto(p, 's-empresas', '/empresas');
  await foto(p, 's-individuais', '/usuarios-individuais');
  await foto(p, 's-planos', '/planos');
  await foto(p, 's-pagamento', '/pagamento');
  await foto(p, 's-ia', '/inteligencia-artificial');
  await foto(p, 's-despesas-ia', '/despesas-ia');
  await foto(p, 's-regras-envio', '/regras-envio');
  await foto(p, 's-numero-plataforma', '/numero-plataforma');
  await foto(p, 's-relatorio-leads', `/relatorios/leads-empresarial?conta=${EMP}`);
  await foto(p, 's-relatorio-campanhas', `/relatorios/campanhas?conta=e:${EMP}`);
  await foto(p, 's-logs', '/logs');
  await foto(p, 's-logos', '/logos');
  await foto(p, 's-dados-legais', '/dados-legais');
  await foto(p, 's-ajuda', '/ajuda');
  await foto(p, 's-seguranca', '/seguranca');
  await foto(p, 's-online', '/online?aba=empresarial');
  await foto(p, 's-atendimento', `/atendimento?cliente=${ANA}`);
  const SA = sql(`select id from "Usuario" where email='superadmin@disparopro.com.br'`);
  sql(`insert into "Comunicado"(id,titulo,texto,publico,"autorId","criadoEm") values ('man-com','Novidade: suporte em tempo real','Agora você fala com o suporte pelo botão Suporte, no canto da tela.','Todos os clientes','${SA}',now())`);
  sql(`insert into "ComunicadoDestino"(id,"comunicadoId","usuarioId","lidoEm") values ('man-cd1','man-com','${ANA}',now())`);
  await foto(p, 's-comunicados', '/comunicados', async (p) => { await p.locator('[data-testid=comunicado] summary').first().click(); });
  // Interessados (decisão #104)
  sql(`delete from "Interessado" where id='man-int'`);
  sql(`insert into "Interessado"(id,"tokenHash",nome,whatsapp,email,"aceitouEm",temperatura,"ultimaMensagemEm") values ('man-int','man-int','Rafael Moreira','5511977776666','rafael@exemplo.com.br',now(),'QUENTE',now())`);
  sql(`insert into "InteressadoMensagem"(id,"interessadoId",autor,texto,"criadoEm") values
    ('man-i1','man-int','VISITANTE','Olá! Tenho uma corretora com 3 vendedores. Qual plano vocês indicam?',now()-interval '5 minutes'),
    ('man-i2','man-int','IA','Olá, Rafael! Para uma equipe de 3 vendedores o plano Básico atende bem: 3 usuários, Antibloqueio e a IA atendendo quem responde. Quer que eu explique como funciona o teste?',now()-interval '4 minutes')`);
  await foto(p, 's-atendimento-interessados', '/atendimento?aba=interessados&interessado=man-int');
  // Modo manutenção (decisão #103): faixa do Super Admin
  sql(`insert into "Manutencao"(id,ligada,desde) values ('geral',true,now()) on conflict (id) do update set ligada=true, desde=now()`);
  await espera(3500);
  await foto(p, 's-manutencao', '/dashboard');
  sql(`update "Manutencao" set ligada=false, desde=null where id='geral'`);
  sql(`delete from "Interessado" where id='man-int'`);
  await c.close();
  await b.close();

  sql(`delete from "Campanha" where assunto like 'Manual:%'`);
  sql(`delete from "Lead" where codigo like 'MAN-%'`);
  sql(`delete from "SuporteConversa" where id='man-sup'`);
  sql(`delete from "Comunicado" where id='man-com'`);
  console.log('Prints salvos em docs/manuais/prints');
})().catch((e) => { console.error(e); process.exit(1); });
