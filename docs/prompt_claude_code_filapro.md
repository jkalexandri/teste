# PROMPT COMPLETO PARA O CLAUDE CODE — FILAPRO / DISPAROPRO WHATSAPP

## OBSERVAÇÃO MUITO IMPORTANTE — LEIA PRIMEIRO E NÃO MUDE
A tela de LOGIN tem que ser EXATAMENTE neste formato, incluindo TODA a parte de fundo, cores e animação visual.
NÃO redesenhe, NÃO simplifique, NÃO troque cores, NÃO remova animação, NÃO mude posição, NÃO mude fonte, NÃO mude tamanho sem ordem expressa.
Se qualquer detalhe do login divergir do que está descrito abaixo, CORRIJA até ficar idêntico.
O login é a referência visual do projeto. O resto do app deve seguir o mesmo padrão visual, mas NUNCA descaracterizar o login.

## 1. O QUE É O PROJETO
FilaPro / DisparoPro WhatsApp: ferramenta web para envio de WhatsApp para leads, com IA, antibloqueio, fila de envio, cadência, qualificação e tratamento de objeções.
Funciona na web, online 24/7, e o envio continua rodando mesmo se o usuário sair da ferramenta / fechar a página.

## 2. STACK DEFINITIVA — NÃO MUDE
- Linguagem: TypeScript
- Framework Fullstack: Next.js 15 (App Router)
- Frontend: React + Tailwind CSS
- Banco: PostgreSQL + Prisma
- Deploy: Vercel
- Domínio principal: filaproleads.com.br
- API: https://api.filaproleads.com.br
- Domínio comprado na Hostinger; DNS gerenciado na Hostinger (decisão #52).

## 3. TELA DE LOGIN — FORMATO EXATO, OBRIGATÓRIO

### 3.1. Estrutura geral
- Tela de login cabe na tela SEM rolagem para cima ou para baixo. Sem scroll vertical.
- Layout em duas áreas: lado esquerdo com marca + título + subtítulo + blocos de benefício, lado direito com o card de login.
- Logo fixa, não se move com scroll.
- Tema claro (light) como padrão. Botão lua/sol troca o tema da tela inteira e salva a preferência do usuário.

### 3.2. Marca e textos do login — textos exatos
- Nome: FilaPro Leads
- Selo acima: IA • AUTOMAÇÃO • WHATSAPP
- Headline (futurista): manter exatamente o headline atual da prévia
- Subtítulo exato: "Envios com ritmo, contexto e proteção sua operação de" + continuação atual da prévia
- Blocos de benefício, textos exatos:
  1. Antibloqueio Inteligente
  2. IA Qualifica e Trata Objeções
  3. Online na Nuvem 24/7
- NÃO voltar para "Fila na Nuvem 24/7". É "Online na Nuvem 24/7".
- Tamanhos: FilaPro Leads com +2 pontos em relação à versão anterior, textos dos 3 blocos com +2 pontos, ícones dos 3 blocos com o tamanho final ajustado na prévia.

### 3.3. Fundo, cores e circuitos — EXATAMENTE como na prévia
- Fundo com traços de circuito tecnológico usando SOMENTE as cores já usadas na tela, harmonizado.
- Circuitos com mais destaque, com nós interativos que expandem e reduzem ao normal.
- Animação dos circuitos ativa.
- 5 feixes de luz correndo pelos circuitos de forma aleatória, em loop infinito, com intervalo de 4 segundos.
- Ícones dos 3 blocos interativos, expandem e reduzem.
- Animação em loop aleatório infinito, com intervalo de 4 segundos.
- NUNCA remover o fundo, os circuitos, os feixes de luz ou a animação para "simplificar".

### 3.4. Card de login
- Campos: e-mail e senha.
- NÃO tem cadastro de novo usuário na tela de login.
- Recuperação de senha: envia senha temporária para o e-mail cadastrado pelo administrador.
- Senha mínima: 12 caracteres, com pelo menos 1 maiúscula, 1 minúscula, 1 número e 1 caractere especial.
- Contas demo:
  - Admin: admin@disparopro.com.br / Admin@12345678
  - Usuário: usuario@disparopro.com.br / User@12345678
- Mostrar acesso como admin e como usuário.

## 4. DOIS MÓDULOS — SEM COMUNICAÇÃO ENTRE ELES
1. Individual: um usuário só, vê só a sua informação, usa o próprio WhatsApp.
2. Empresarial: empresa com pacotes definidos pelo Super Admin. Cada empresa tem um Admin que cadastra seus usuários até o máximo do pacote.
- Individual NÃO tem acesso a conteúdo de empresa. Empresa NÃO tem acesso a conteúdo de individual.
- Uma empresa NÃO vê, NÃO fala e NÃO acessa outra empresa.
- Cada usuário vê só a sua informação e usa o próprio WhatsApp para envio via API.
- Admin da empresa NÃO envia mensagem e NÃO usa API / WhatsApp.
- Admin da empresa tem acesso total aos seus usuários.
- Dias restantes dos usuários da mesma empresa são IGUAIS, porque o pacote expira junto com todos os usuários.

## 5. SUPER ADMIN
- Acesso total a todas as informações de todas as empresas E de usuários individuais.
- SEMPRE agrupado por empresa e por usuário individual, nunca misturado.
- Grupo Empresas: cada empresa expandível, com usuários, dias restantes, disparos, leads, campanhas, qualificação da IA.
- Grupo Usuários Individuais: cada um com disparos, leads, campanhas, dias restantes.
- Pode entrar no detalhe de qualquer empresa / usuário, sem enviar mensagem por eles.

## 6. GRUPO RELATÓRIO — SUPER ADMIN
### Relatório > Empresarial
- Select para escolher a empresa.
- Ao escolher, mostrar: nome da empresa, pacote adquirido, data de expiração, nome dos usuários, quantidade de leads por usuário e total da empresa.
- Total da empresa = soma dos leads de todos os seus usuários.
### Relatório > Individual
- Mesma lógica do Empresarial.
- Select para escolher o usuário individual. Mostrar nome, pacote, expiração, quantidade de leads e total. Sem misturar com empresas.
### Relatório > Leads Empresarial
- Select para escolher a empresa. Mostrar nome da empresa.
- Tabela: data do lead, nome do lead, telefone do lead e status.
- Filtro por usuário e por status.
### Relatório > Lead Individual
- Mesmas regras do Leads Empresarial.
- Select para escolher o usuário individual. Mostrar nome e tabela com data, nome, telefone e status.

## 7. USUÁRIOS, EXPIRAÇÃO E AVISOS
- Ao criar usuário, senha temporária é criada automaticamente e enviada por e-mail.
- Usuário é desativado automaticamente a cada 31 dias ou no prazo indicado pelo admin.
- 10 dias antes de expirar, notificar o usuário com popup de 10 segundos mostrando o tempo restante.
- Popups do canto inferior somem após 2 segundos, exceto o aviso de expiração que dura 10 segundos.
- No menu Usuários da conta, a informação aparece em uma linha.

## 8. CAMPANHAS
- Menu Campanhas com abas: Nova, Em andamento, Pausada, Rascunho, Concluída, Cancelada.
- Nova é aba dentro do menu Campanhas, com sub-abas: Mensagem, Leads, Antibloqueio, Prévia|envio.
- NÃO permitir iniciar quando salvo como rascunho. NÃO permitir duplicar quando cancelada. NÃO mostrar quantidade na aba Nova. Em andamento, só permitir pausar ou cancelar.
- Campo Mensagem de Referência.
- Ao clicar em Atualizar prévia, a IA gera aleatoriamente a mensagem principal a partir da Mensagem de Referência e as variações 1, 2, 3 a partir da mensagem principal.
- Botão Agendar envio: campanha começa no dia/hora configurado pelo usuário.
- Botões Agendar e Iniciar ficam na aba Prévia|envio, nessa ordem.
- Botão Salvar rascunho fica nas abas Mensagem, Leads e Antibloqueio e salva o rascunho com as alterações da página no momento em que foi salvo.
- Após Iniciar ou Agendar, a tela é limpa para nova campanha.
- Reduzir em 50% o espaço entre os nomes das 4 abas: Mensagem, Leads, Antibloqueio, Prévia|envio.

## 9. ANTIBLOQUEIO
- Sem campo de cadência solto. O Antibloqueio define as regras de envio.
- 3 blocos separados: Bloqueio 24h, Antibloqueio, Resumo das regras ativas.
- Resumo das regras ativas fica dentro do Antibloqueio.
- Bloqueio de 24h para contatos repetidos.
- Escudo: verde = Conservador, amarelo = Equilibrado, vermelho = Rápido.
- Texto de cancelamento de subscrição, editável em popup (Editar), só mostrando o texto dentro do popup, com botão Restaurar para voltar ao padrão.
- Texto padrão exato: _Caso não queira mais receber nossos conteúdos sobre investimentos, basta responder *STOP* e removeremos você imediatamente, sem mais mensagens_

## 10. EMPRESA | IA — 3 FUNÇÕES DA IA
1. IA aprende sobre a empresa.
2. IA qualifica leads.
3. IA trata objeções pelo perfil do lead.
- Menu Empresa | IA com campos: Nome da Empresa, Endereço, Telefone, Whatsapp, Atividade. Ocultar os outros campos.
- IA aprende por: links, sites, imagens, PDF e texto.
- Ao inserir material, limpar o campo para permitir inserir mais material. Armazenar por tempo indeterminado.
- IA deve esquecer o que o usuário pedir para esquecer.
- Ao clicar em Imagens ou PDF, abrir popup para upload de arquivo local.
- No pacote empresarial, SÓ o admin treina a IA.
- IA mantém histórico de conversa até 365 dias. Permite envio de arquivo.
- IA qualifica e trata objeções por perfil do lead.

## 11. DASHBOARD E TOTAIS
- Dashboard NÃO mostra linha TOTAL no final do Resumo por usuário/empresa.
- Fila do admin mostra total de leads na fila somando todas as empresas/usuários. Mesma regra para Enviados hoje, Bloqueados 24h, Leads qualificados pela IA.
- No menu Todos os disparos, mostrar informação dos usuários da sua empresa, não de todas as empresas.
- No login do Admin da Empresa, campo Disparos por usuários mostra só os usuários da empresa, SEM o Administrador.
- No login do Super Admin, Disparos por usuários mostra todos, agrupados por empresa.
- Textos "Total" e "Visão geral" SEM "— só a sua empresa". Esconder esse trecho.

## 12. MENU E LAYOUT
- Ordem do menu: Principal, Vendas, Administrativo, Configurações, Sistema.
- Barra lateral do menu fixa.
- Logo FilaPro fixa, não se move com scroll.
- Tema claro como padrão, salvar preferência, botão lua/sol aplica na tela inteira.
- Telas sem scroll travado no projeto final, exceto o login que deve caber na tela sem scroll.

## 13. INTEGRAÇÃO E BACKEND
- WhatsApp autenticado por QR Code no início, sem API oficial inicialmente.
- Depois, envio por API, cada usuário com o próprio WhatsApp.
- Criar rota POST /api/upload para upload local de imagem/PDF, com armazenamento, extração de texto e aprendizado persistente por empresa.
- IA real: instalar e configurar modelo, chave de API, coleção de aprendizado por empresa, qualificação e objeções.
- NÃO inventar dados. Se faltar chave, variável ou decisão, parar e perguntar antes de inventar.

## 14. O QUE NÃO FAZER
- NÃO descaracterizar o app.
- NÃO mudar a stack definitiva.
- NÃO redesenhar o login.
- NÃO remover fundo, circuitos, feixes de luz ou animação do login.
- NÃO misturar dados entre empresas, entre individual e empresarial, ou entre usuários.
- NÃO permitir cadastro público de novo usuário.
- NÃO inventar funções que não foram pedidas, nem omitir funções pedidas.

## 15. ENTREGA ESPERADA
- Código completo, organizado, comentado em português, sem dados inventados.
- Login idêntico à prévia, com fundo, cores e animação.
- Todas as telas funcionando com dados reais do banco, com isolamento por usuário/empresa.
- Passo a passo de como rodar, como configurar .env, como fazer deploy na Vercel e como apontar o domínio filaproleads.com.br e a API api.filaproleads.com.br.
