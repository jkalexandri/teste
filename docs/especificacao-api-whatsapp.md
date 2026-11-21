> **Nota:** especificação técnica montada na conversa inicial. Em caso de conflito, valem `prompt_claude_code_filapro.md` e `decisoes.md`.

# Prompt: Plataforma SaaS de disparo de WhatsApp (filaproleads.com.br)

## Contexto
Sou desenvolvedor e vou construir uma **plataforma SaaS de disparo e atendimento
via WhatsApp** com **API própria de conexão ao WhatsApp** (sem a API oficial da Meta).
O produto será vendido para dois públicos:

- **Usuário final (pessoa física / autônomo):** plano individual, 1 usuário.
- **Empresas:** pacotes com quantidade de usuários (seats) conforme a necessidade
  da empresa, com possibilidade de adicionar usuários avulsos.

O produto tem uma **API pública** (para integração com CRMs e sistemas dos clientes)
e um **painel web** (para quem não é técnico).

## Conexão com o WhatsApp (API própria)
- A conexão é feita pelo protocolo do **WhatsApp Web / multi-device**, usando a
  biblioteca **Baileys** (WebSocket, sem navegador) como motor de baixo nível.
- Toda a lógica de negócio fica na **minha API**. O Baileys fica isolado atrás da
  interface `WhatsAppProvider` (connect, disconnect, sendText, sendMedia, onMessage,
  onStatus, onConnectionUpdate), para eu poder trocar o motor no futuro
  (outra biblioteca ou a API oficial) sem reescrever o sistema.
- O cliente conecta o próprio número pelo painel, por **QR Code** ou **código de pareamento**.
- **Sessões persistentes:** as credenciais de cada sessão ficam salvas no banco,
  criptografadas (AES-256, chave em variável de ambiente). Depois de reiniciar o
  servidor, a sessão reconecta sozinha, sem novo QR Code.
- Reconexão automática com backoff. Detectar e diferenciar: desconectado,
  deslogado pelo celular, número banido/restrito. Atualizar o status no painel e
  **notificar o cliente** (e-mail + painel) quando a sessão cair.
- Tipos de mensagem: texto, imagem, vídeo, áudio, documento (PDF) e localização.
- Recebimento de mensagens e de status (enviada, entregue, lida) por eventos da sessão.
- Riscos assumidos (documentar nos Termos de Uso):
  - Por não ser a API oficial, a Meta pode restringir ou banir números.
  - A plataforma não garante a disponibilidade do número.
  - O cliente é responsável pelo conteúdo e pelo consentimento dos contatos.

## Stack
- Backend: Node.js + TypeScript, Fastify, PostgreSQL + Prisma, Redis + BullMQ, Baileys
- Frontend: Next.js (React) + Tailwind
- Pagamentos: **Asaas** (PIX, boleto e cartão; assinatura recorrente)
- Docker + docker-compose; testes com Vitest; OpenAPI/Swagger automático
- Monorepo (pnpm workspaces): `apps/api`, `apps/worker`, `apps/sessions`, `apps/web`, `packages/*`

## Hospedagem e execução contínua (24/7)
A plataforma roda na web, no domínio **filaproleads.com.br**. **Todo o processamento
acontece no servidor**: sessões do WhatsApp, campanhas, agendamentos, fila e retries
continuam rodando mesmo sem nenhum usuário logado, com o navegador fechado ou o
computador desligado.

### Domínio e subdomínios
- Domínio `filaproleads.com.br`, comprado e com DNS gerenciado na **Hostinger** (decisão #52).
- `filaproleads.com.br`: o app (Next.js na Vercel) — ver decisão #52.
- `app.filaproleads.com.br`: painel web (Next.js).
- `api.filaproleads.com.br`: API pública, webhooks do Asaas e WebSocket do painel.
- Subdomínios criados como registros **A** apontando para o IP da VPS.
- HTTPS obrigatório com certificado automático (Let's Encrypt via Caddy).

### Infraestrutura
- VPS Linux com 4 GB de RAM ou mais e Docker Compose no MVP. Arquitetura pronta
  para escalar horizontalmente.
- Proxy reverso Caddy (HTTPS automático e roteamento dos subdomínios).
- Serviços separados (containers independentes):
  - `api`: requisições HTTP. Só **enfileira**, nunca dispara direto.
  - `sessions`: **gerenciador de sessões**. Mantém as conexões WebSocket com o
    WhatsApp abertas 24/7, uma por número conectado. Projetar para *sharding*
    (cada instância cuida de um conjunto de sessões, com lock distribuído no Redis
    para nunca abrir a mesma sessão em duas instâncias).
  - `worker`: processa a fila de envios (BullMQ) e entrega cada mensagem à
    instância de `sessions` dona do número.
  - `scheduler`: campanhas agendadas e tarefas recorrentes (assinaturas,
    limpeza, health check das sessões).
  - `web`: painel Next.js.
  - `postgres` e `redis`.
- Todos os containers com `restart: unless-stopped` e healthcheck.
- Atualizações em tempo real no painel (QR Code, status da sessão, progresso da
  campanha, novas mensagens) via WebSocket.

### Confiabilidade dos disparos
- O **estado da campanha fica no PostgreSQL** (fonte da verdade). O Redis é só a
  fila, com persistência AOF habilitada.
- Se o servidor ou o worker reiniciar no meio de uma campanha, ela **retoma de onde
  parou** sem reenviar para quem já recebeu (idempotência por mensagem/contato).
- Se a sessão de um número cair, as campanhas daquele número são **pausadas
  automaticamente** e retomadas quando a sessão voltar.
- Desligamento gracioso: worker e sessions terminam o que está em andamento antes de parar.
- Fuso horário por organização (padrão America/Sao_Paulo).
- **Janela de horário de envio** (padrão: 8h às 20h, segunda a sábado [?]):
  - Ajustável pelo **próprio usuário** no plano Individual e pelo **Owner/Admin da
    organização** nos planos empresariais. Agentes e Somente leitura apenas visualizam.
  - Configurável por dia da semana: hora de início, hora de fim e se o dia está ativo.
  - Vale para a organização inteira, no fuso horário da organização.
  - Aplica-se a **campanhas e envios agendados**. Respostas na inbox e mensagens
    individuais enviadas manualmente não são bloqueadas [?].
  - Se a campanha chegar ao fim da janela, ela **pausa sozinha e retoma no início da
    próxima janela**, sem reenviar para quem já recebeu. O painel mostra
    "aguardando janela de envio".
  - Ao agendar uma campanha fora da janela, o painel avisa e mostra quando o envio
    vai começar de fato.
  - Alterações na janela valem imediatamente para campanhas em andamento.
  - Toda alteração fica registrada no log de auditoria (quem, quando, valor anterior e novo).
  - Limites globais definidos pelo super admin [?] (ex.: nunca antes de 7h nem depois
    de 22h). O cliente ajusta só dentro dessa faixa.
- Notificar o cliente quando a campanha terminar, falhar ou for pausada.

### Operação
- Deploy automatizado via GitHub Actions (build das imagens + deploy na VPS).
- Migrations aplicadas automaticamente no deploy.
- Backup diário do PostgreSQL para armazenamento externo (S3/Backblaze), retenção de 30 dias.
  Atenção: o backup contém as sessões do WhatsApp e precisa ser criptografado.
- Monitoramento: Sentry, monitor de uptime externo, Bull Board restrito ao super admin.
- Ambientes separados: `staging` e `produção`.

## Modelo de negócio (multi-tenant)
- **Organização (tenant):** toda informação pertence a uma organização. Usuário
  individual = organização com 1 seat. Isolamento total de dados entre tenants
  (toda query filtrada por `organizationId`, com testes garantindo isso).
- **Planos** configuráveis no banco (não hardcoded), cada um com:
  - quantidade de usuários (seats) incluídos
  - quantidade de números de WhatsApp conectados
  - limite de contatos e de mensagens/mês
  - recursos liberados (feature flags: API, campanhas, inbox, relatórios…)
  - preço mensal/anual
- Exemplos iniciais (valores a definir):
  | Plano | Seats | Números | Público |
  |---|---|---|---|
  | Individual | 1 | 1 | Autônomo |
  | Equipe | até 5 | 2 | Pequena empresa |
  | Empresa | até 20 | 5 | Média empresa |
  | Enterprise | sob medida | sob medida | Grande empresa |
- Seats e números adicionais avulsos. Upgrade/downgrade com cobrança proporcional.
- **Teste grátis:** termina em **7 dias corridos OU 20 disparos, o que acontecer primeiro**.
  - Conta como disparo cada mensagem enviada a um contato (individual ou de campanha);
    mensagens recebidas e respostas na inbox não contam [?].
  - O contador é verificado **antes de enfileirar**. Uma campanha que ultrapassaria o
    saldo restante é bloqueada com aviso, e não enviada parcialmente.
  - Sem cartão no cadastro. Ao terminar o teste, os envios são bloqueados e o painel
    mostra a tela de escolha de plano; dados e sessão conectada são preservados.
  - Painel mostra o saldo em destaque ("restam X dias / Y disparos").
  - Avisos por e-mail: ao chegar em 15 disparos ou faltando 2 dias, e no fim do teste.
  - Antiabuso: 1 teste por e-mail verificado e por número de WhatsApp conectado
    (o mesmo número não ganha novo teste em outra conta).
  - Limites do teste (7 dias, 20 disparos) configuráveis no banco pelo super admin.
- Inadimplência: aviso, depois período de carência, depois bloqueio de envios.
  Os dados são preservados.

## Usuários e permissões
- Cadastro, login (e-mail + senha, com verificação de e-mail), recuperação de senha, 2FA opcional.
- Convite de usuários para a organização (consome seat).
- Papéis: **Owner** (cobrança e plano), **Admin** (usuários, números, configurações),
  **Agente** (contatos, envios, inbox), **Somente leitura**.
- **Super admin** da plataforma (eu): ver organizações, planos, uso e sessões;
  bloquear/desbloquear; impersonar com log de auditoria.

## Funcionalidades (MVP)
### Números de WhatsApp
- Conectar via QR Code ou código de pareamento; listar, desconectar, reconectar.
- Status em tempo real (conectado, conectando, desconectado, banido).

### Contatos
- CRUD (nome, telefone E.164, tags, campos personalizados).
- Importação CSV com validação/normalização (+55, nono dígito).
- Verificar se o número tem WhatsApp antes de incluir em campanha.
- Registro de opt-in (data, origem) e opt-out automático ("SAIR", "PARAR", "STOP").
  Contatos com opt-out **nunca** recebem campanhas.

### Modelos de mensagem
- Modelos internos (texto + mídia) com variáveis (`{{nome}}`, `{{campo}}`)
  preenchidas a partir dos dados do contato.

### Envio
- Mensagem individual (API e painel).
- Campanhas para listas/tags com agendamento; pausar/retomar/cancelar.
- Fila com **limite de envio por número**: intervalo mínimo entre mensagens e
  limite diário, configuráveis dentro de faixas definidas pelo plano.
- Retry com backoff e idempotência.
- Consumo contabilizado contra o limite do plano.

### Inbox (atendimento básico)
- Conversas recebidas, responder, atribuir conversa a um agente, marcar como resolvida.

### Webhooks de saída
- Webhook configurável por organização (mensagem recebida, status, sessão
  conectada/desconectada, campanha concluída), com assinatura HMAC e retry.

### API pública
- API Keys por organização (hash no banco, escopos, revogáveis).
- Rate limit por API key conforme o plano.
- Documentação pública (Swagger) em `api.filaproleads.com.br/docs`, com exemplos.

### Relatórios
- Por campanha e por período: enviadas, entregues, lidas, falhas, respostas, opt-outs.
- Uso do plano (mensagens, contatos, seats, números) visível para o cliente.

### Cobrança (Asaas)
- Checkout de assinatura, troca de plano, compra de seats/números, faturas, webhooks do Asaas.

## Requisitos não funcionais
- **LGPD:** termos de uso e política de privacidade aceitos no cadastro,
  consentimento registrado, exportação e exclusão de dados, criptografia das
  sessões e dados sensíveis em repouso.
- **Uso responsável / antiabuso:**
  - campanhas só para contatos com opt-in
  - opt-out sempre respeitado
  - Termos de Uso proibindo spam
  - super admin pode suspender organizações com alto índice de bloqueios/denúncias
- Logs estruturados (pino) sem segredos e sem conteúdo de mensagens. Log de
  auditoria de ações administrativas.
- Segredos em variáveis de ambiente (`.env.example`).
- Respostas de erro padronizadas.
- Módulos: auth, organizations, users, plans, billing, sessions, contacts,
  templates, messages, campaigns, inbox, webhooks, providers, admin.

## Forma de trabalho
1. Antes de codar, apresente: arquitetura, modelo de dados (tabelas e relações),
   lista de endpoints e telas do painel. Espere minha aprovação.
2. Implemente por etapas:
   1. Setup do monorepo, docker-compose, separação dos serviços e deploy inicial
      em staging com HTTPS em `app.` e `api.filaproleads.com.br`
   2. Auth, organizações, usuários, papéis e convites
   3. Planos, limites e feature flags (sem cobrança ainda)
   4. **Gerenciador de sessões:** conexão por QR/pareamento, persistência
      criptografada, reconexão automática, envio individual e recebimento
   5. Contatos, importação, verificação de número e opt-in/opt-out
   6. Modelos de mensagem
   7. Fila e campanhas (limites por número, pausa/retomada automática)
   8. Inbox
   9. API pública, API keys e webhooks de saída
   10. Cobrança (Asaas)
   11. Relatórios e painel super admin
3. Ao fim de cada etapa: testes passando, instruções de teste e resumo do que mudou.
4. Pergunte sempre que surgir uma decisão de negócio não coberta aqui.

## Fora do escopo do MVP
- Chatbot / respostas automáticas com IA
- Grupos do WhatsApp
- App mobile
- White-label (marca do cliente)
- Integração com a API oficial da Meta (prevista via `WhatsAppProvider`)
