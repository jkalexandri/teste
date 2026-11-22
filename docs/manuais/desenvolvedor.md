# Manual do Desenvolvedor — FilaPro Leads

Para quem vai manter ou evoluir o sistema. Antes de mexer no código, leia o `CLAUDE.md` da raiz (regras de trabalho) e
`docs/decisoes.md` (todas as regras de negócio aprovadas pelo dono, numeradas). **Em conflito, vale `decisoes.md`.**

## Regras do projeto

- **Não inventar regra de negócio:** se algo não estiver em `docs/decisoes.md`, pergunte ao dono antes.
- **Tela de login idêntica à prévia** (`docs/login-referencia.md`): qualquer mudança só com autorização registrada.
- Corrigir só o item pedido, código comentado em português, mostrar o plano de arquivos antes de algo grande.
- A cada entrega: testes da etapa + **regressão completa** + print do login.
- Segredos (chaves, senhas, `.env`) **nunca** vão para o GitHub. O repositório é público.

## Visão geral

```
Navegador / app no celular
        │ HTTPS (Caddy)
        ▼
filaproleads.com.br ──► Site (Next.js 15, porta 3000) ──┐
                                                        ├──► PostgreSQL (mesma VPS)
api.filaproleads.com.br ► Serviço 24/7 (Node, porta 4000) ┘
                              │
                              ├── WhatsApp (Baileys, QR Code — sem API oficial da Meta)
                              ├── IA (Anthropic Claude ou provedor compatível)
                              └── Notificações no celular (Web Push)
```

- **Site** (`apps/web`): telas, login, regras de acesso, relatórios, endereço de leads de anúncios. Fala com o serviço 24/7 por HTTP
  com um token (`WORKER_TOKEN`).
- **Serviço 24/7** (`apps/worker`): mantém os WhatsApps conectados, envia as campanhas (fila no banco), recebe as respostas,
  a IA conversa, lê os materiais do Empresa | IA, manda os avisos.
- **Banco** (PostgreSQL + Prisma): uma fonte de verdade para os dois. A fila de envio fica no banco, então reiniciar o serviço não
  perde nem repete envios.

## Tecnologias

TypeScript, Next.js 15 (App Router, Server Actions), React, Tailwind CSS 3.4, PostgreSQL 16, Prisma 6, pnpm (monorepo),
Baileys 7 (WhatsApp), `@anthropic-ai/sdk`, unpdf (PDF), web-push, write-excel-file, marked, Playwright (testes), pm2 e Caddy (servidor).

## Pastas

| Pasta | O que tem |
|---|---|
| `apps/web/app/(app)/` | As telas internas (uma pasta por menu) com `page.tsx` e `actions.ts` (ações do servidor) |
| `apps/web/app/api/` | Rotas HTTP: login, pedidos, renovação, anúncios, relatórios (Excel), logos, push, cron |
| `apps/web/lib/` | Regras do site: `menu.ts` (menu por perfil), `auth/`, `leads.ts`, `campanhas.ts`, `relatorios.ts`, `logs.ts`, `ajuda.ts`… |
| `apps/web/components/` | Componentes (login, app, planos, relatórios, pwa) |
| `apps/web/tests/` | Testes de ponta a ponta (`etapaN-*.e2e.cjs`) e `manual-prints.cjs` |
| `apps/worker/src/` | `sessoes.ts` (WhatsApp), `queda.ts` (reconexão), `disparos.ts` (motor), `conversas.ts` (IA), `avisos.ts`, `push.ts`, `aprender.ts`, `numeros.ts`, `api.ts` |
| `apps/worker/tests/` | Testes do serviço (`*.test.ts`) com WhatsApp falso e IA simulada |
| `packages/db/` | `prisma/schema.prisma`, migrações, `seed.ts`, regras puras compartilhadas (`src/envio.ts`, `src/codigos.ts`) |
| `packages/ia/` | Camada de IA: conectores, preços, custo, gerar mensagens, conversar, ler materiais |
| `deploy/` | Scripts da VPS: `atualizar.sh`, `voltar-versao.sh`, `backup-banco.sh`, `rotinas.sh`, `Caddyfile`, `gerar-segredos.sh` |
| `docs/` | Decisões, especificação, guias de instalação e publicação, manuais e referências |

## Variáveis de ambiente

### Site — `apps/web/.env.production` (na VPS) ou `.env.local` (no computador)

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_APP_ENV` | `production` esconde contas e botões de demonstração |
| `NEXT_PUBLIC_SITE_URL` | Endereço público (links nos e-mails) |
| `DATABASE_URL` | Banco PostgreSQL |
| `SUPERADMIN_EMAIL` / `SUPERADMIN_NOME` | Super Admin criado pelo seed |
| `RESEND_API_KEY` / `EMAIL_FROM` | Envio de e-mails |
| `CRON_SECRET` | Protege `/api/cron/renovacao` |
| `WORKER_URL` / `WORKER_TOKEN` | Endereço e token do serviço 24/7 |
| `CHAVE_CRIPTO` | Criptografa as chaves de IA (o mesmo valor do serviço) |
| `VAPID_PUBLIC_KEY` | Notificações no celular (chave pública) |

### Serviço 24/7 — `apps/worker/.env`

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | O mesmo banco do site |
| `WORKER_TOKEN` | O mesmo do site |
| `CHAVE_CRIPTO` | Criptografa as sessões do WhatsApp (trocar obriga a ler o QR Code de novo) |
| `PORTA`, `HOST`, `NIVEL_LOG` | 4000, 127.0.0.1, info |
| `PASTA_ARQUIVOS` | Anexos e materiais (padrão `/opt/filapro/arquivos`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Notificações no celular |
| `DISPAROS=desligado` | Só em testes: não envia campanhas |

## Banco de dados

- O modelo fica em `packages/db/prisma/schema.prisma`.
- **Mudança no banco:** edite o `schema.prisma` e gere a migração com
  `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<data>_<nome>/migration.sql`,
  revise o SQL (dados existentes!) e aplique com `pnpm --filter @filapro/db migrate:deploy`. Depois `npx prisma generate`.
- **Nunca** edite uma migração que já foi para produção: crie outra.
- Códigos legíveis (S/E/EU/L/EL + número) vêm do contador atômico em `src/codigos.ts`.

## Serviço 24/7 — pontos importantes

- **Sessões:** o login de cada WhatsApp fica no banco, criptografado (AES-256-GCM). O número principal tem o id do usuário;
  números extras têm id próprio (`<usuário>-n<k>`).
- **Reconexão:** `queda.ts` decide o que fazer em cada código de queda (515 → reconecta; "pareado" = `creds.me`).
- **Motor de envio** (`disparos.ts`): um "corredor" por usuário, relendo tudo do banco a cada envio; rodízio entre números,
  limites por número e por modo (Conservador/Equilibrado/Rápido), aquecimento, janela, feriados e regras de pular lead.
- **Conversas** (`conversas.ts`): a IA responde depois de 20–60 s; ficha da empresa em cache + resumo + últimas 12 mensagens.
- **Saldo de disparos** (`packages/db/src/saldo.ts`, decisão #102): conta os `Envio` ENVIADO desde `Empresa.inicioPeriodo`;
  limite = `Empresa.limiteDisparos` + `disparosExtras`. Sem saldo, o motor pausa com o motivo `MOTIVO_SEM_SALDO`; a confirmação do pacote
  em Pedidos chama `retomarSemSaldo`.
- **ESM/CJS:** no serviço, importe módulos puros pelo caminho do arquivo (ex.: `@filapro/db/src/envio.ts`,
  `@filapro/ia/src/conversa.ts`) para evitar erro de exportação.

## IA e custo

- Configuração por tarefa na tela Inteligência Artificial (tabela `ConfigIA`), com a chave única em `tarefa = "_anthropic"`.
- Todo uso é registrado em `UsoIA` com o custo em dólar (cache conta 10% na leitura e 125% na escrita).
- O provedor **simulado** só funciona fora de produção (usado nos testes).

## Online, suporte e mensagens (decisão #102)

- `components/app/Presenca.tsx` (montado no layout interno) manda `POST /api/presenca` a cada 45 s, ao trocar de tela e ao voltar
  para a aba: grava `vistoEm`, `telaAtual` e `aparelho`, e devolve a mensagem pendente (`Comunicado`) e o estado do suporte.
- Online = `vistoEm` nos últimos 2 minutos (`ONLINE_MS` em `lib/suporte.ts`).
- Suporte: `SuporteConversa`/`SuporteMensagem`; rotas `/api/suporte` (cliente), `/api/suporte/<usuário>` e `/chamar` (Super Admin),
  `/api/suporte/arquivo/<id>`. Anexos ficam no serviço 24/7 como `sup-<id>`. O chat (`ChatSuporte.tsx`) busca novidades a cada 3 s.
  Limpeza diária: mensagens com mais de 365 dias.
- Mensagens aos usuários: `Comunicado` + `ComunicadoDestino` (um por destinatário; `lidoEm` ao clicar OK).

## Modo manutenção (decisão #103)

- Tabela `Manutencao` (linha "geral"). `deploy/manutencao.sh ligar|desligar|estado|avisar N`.
- `atualizar.sh`: liga antes do backup, monta o site em `.next-novo` (o site atual continua no ar mostrando a tela de atualização),
  troca as pastas, reinicia, confere e desliga. Em erro, fica ligada (trap). Restaura `next-env.d.ts` depois do build.
- Site: `middleware.ts` (runtime Node.js) recusa com 503 ações e rotas da API de quem não é Super Admin (exceto `/api/manutencao`,
  `/api/presenca`, login/sair e `/api/anuncios/`). O layout não renderiza a página do cliente; `Presenca.tsx` mostra `TelaManutencao`.
- Serviço 24/7: `src/manutencao.ts` (cache 5 s) — o motor não envia, as respostas da IA são reagendadas e os leads de anúncios ficam
  `RECEBIDO` até a varredura.
- Caddy: `handle_errors` 502/503/504 mostra `deploy/pagina-manutencao/index.html` nos segundos do reinício.

## Chat para interessados (decisão #104)

- `Interessado` + `InteressadoMensagem`; código do aparelho em cookie httpOnly de 30 dias (`lib/interessados.ts`).
- Rotas públicas: `/api/interessados` (GET/POST) e `/api/interessados/mensagens` (limites em memória por conversa e por IP);
  Super Admin: `/api/interessados/<id>`, `/<id>/ia`, `/arquivo/<id>`.
- IA: `apps/worker/src/interessados.ts` (`responderConversa` com `visitanteSite`, ficha do Super Admin + planos visíveis).
- Compra confirmada (Pedidos ou teste grátis): `ligarInteressadoAoCliente` copia a conversa para o suporte do cliente.
- Limpeza diária: interessados com mais de 180 dias.

## Testes

Pré-requisitos locais: Postgres na porta 5433, site em `http://localhost:3005`, serviço 24/7 em `127.0.0.1:4000`.

```bash
# Serviço 24/7 (unidade, banco real, WhatsApp falso)
cd apps/worker && set -a && . ./.env && set +a && npx tsx --test --test-concurrency=1 tests/*.test.ts
# IA
cd packages/ia && npx tsx --test tests/*.test.ts
# Telas (ponta a ponta), uma etapa
node apps/web/tests/etapa10-conversas.e2e.cjs /tmp/prints
```

- A etapa 6 precisa da porta 4000 **livre**; a 8b precisa do serviço com o motor **ligado**.
- `login-regras` troca a senha da conta de demonstração "usuario@…": restaure depois (o roteiro de regressão faz isso).
- Rode a **regressão completa** (todas as etapas) antes de cada entrega.

## Versões e Novidades

1. Atualize `"version"` no `package.json` da raiz (ex.: 1.26.0 → 1.27.0).
2. Escreva o que mudou no topo de `docs/manuais/novidades.md`.
3. A versão aparece sozinha no menu, no login (ambiente de teste), na Ajuda e na impressão dos manuais.
4. Atualize os manuais e rode `node apps/web/tests/manual-prints.cjs` para refazer os prints das telas.

## Publicar e atualizar

- Primeira publicação: `docs/publicacao-vps.md` (passo a passo).
- Atualizar: `bash /opt/filapro/app/deploy/atualizar.sh` — faz backup do banco, baixa a versão nova, aplica as migrações, monta o
  site, reinicia e mostra **"Atualizado para a versão vX.Y.Z"**. O WhatsApp não desconecta.
- Voltar: `bash /opt/filapro/app/deploy/voltar-versao.sh` — volta o código para a versão anterior e, se for preciso,
  restaura o backup feito antes da atualização.

## Mudar de servidor

Tudo o que define o sistema está em 4 lugares: **código** (GitHub), **configuração** (os dois `.env`), **dados** (banco) e
**arquivos** (`/opt/filapro/arquivos`).

No servidor **antigo**:

```bash
bash /opt/filapro/app/deploy/empacotar-servidor.sh
```

Gera `/opt/filapro/mudanca-<data>.tar.gz` com o backup do banco, os dois `.env` e a pasta de arquivos. Copie esse arquivo para o
servidor novo (ex.: `scp`).

No servidor **novo** (Ubuntu): instale Node 20, pnpm, PostgreSQL, Caddy e pm2 (como em `docs/instalacao-vps.md`), clone o
repositório em `/opt/filapro/app` e rode:

```bash
bash /opt/filapro/app/deploy/restaurar-servidor.sh /caminho/mudanca-<data>.tar.gz
```

Depois aponte o DNS (`@`, `www`, `api`) para o IP novo. Com a mesma `CHAVE_CRIPTO`, os WhatsApps continuam conectados
(sem ler o QR Code de novo).

**Separar partes no futuro:** banco gerenciado (Neon, Supabase) → troque `DATABASE_URL` nos dois `.env`. Site em outra hospedagem →
`WORKER_URL` passa a ser `https://api.filaproleads.com.br` e o serviço 24/7 continua na VPS. Não é preciso mudar o código.

## Segurança — o que não pode quebrar

- Cada usuário vê só os próprios dados; o Admin vê a empresa; o Super Admin vê tudo. As regras ficam no servidor
  (`lib/leads.ts`, `lib/conversas.ts`, `lib/campanhas.ts`, `lib/menu.ts`) — nunca confie só na tela.
- Todas as rotas do serviço 24/7 exigem o `WORKER_TOKEN`; ele escuta só em `127.0.0.1`.
- O leitor de sites do Empresa | IA bloqueia endereços internos (proteção contra SSRF).
- Senhas com scrypt (sal aleatório por senha), bloqueio de 15 min após 5 erros, sessão em cookie `httpOnly`.
- Dados pessoais seguem a LGPD (Política de Privacidade): conversas 365 dias, logs 90 dias, "Esquecer" apaga materiais.
