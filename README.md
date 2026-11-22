# FilaPro Leads

Envio de WhatsApp para leads, com IA, antibloqueio e fila na nuvem 24/7.

- Especificação: `docs/prompt_claude_code_filapro.md`
- Decisões: `docs/decisoes.md`
- Referência do login: `docs/login-referencia.md`
- Pacotes, planos e pagamento: decisões #22 a #36

## Rodar localmente
Requisitos: Node 22 e pnpm 10.

```bash
pnpm install
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
pnpm dev
```

Abra http://localhost:3000 (redireciona para `/login`).

## Ambientes
`NEXT_PUBLIC_APP_ENV` = `development` | `staging` | `production`.
Em `production` os botões de acesso demo do login ficam ocultos.

## Estrutura
- `apps/web` — Next.js 15 (telas) — deploy na Vercel
- `apps/worker` — serviço 24/7: API, fila e WhatsApp (etapas futuras)
- `packages/*` — código compartilhado (etapas futuras)

## Andamento
- [x] Etapa 1 — estrutura do projeto e tela de login idêntica à prévia
- [x] Etapa 2 — usuários, banco de dados e entrada no sistema
- [x] Etapa 3 — layout do app (menu lateral) e dashboards por perfil
- [x] Etapa 4a — planos configuráveis, pagamento e botão Planos no login
- [x] Etapa 4b — compra por PIX, Pedidos e teste grátis
- [x] Etapa 4c — Super Admin: empresas e usuários individuais
- [x] Etapa 4d — renovação (link 10 e 3 dias antes, troca de plano, compra com e-mail existente)
- [x] Etapa 5 — usuários das empresas (vagas, permissões, desativar, excluir com transferência)
- [x] Etapa 6a — serviço 24/7 do WhatsApp (apps/worker), telas de conexão por QR e avisos pela plataforma
- [x] Etapa 6b — instalação na VPS (pm2 + HTTPS em api.filaproleads.com.br) e teste real do QR Code. Ligar o site ao serviço (WORKER_URL/WORKER_TOKEN na Vercel) fica para a publicação (etapa 12).
- [x] Etapa 7 — leads (manual, colar e planilha .xlsx/.csv), códigos legíveis, limites e permissões por perfil
- [x] Etapa 8a — tela de Campanhas (Nova em 4 passos, rascunho, agendar/iniciar, pausar/retomar/cancelar, duplicar), anexos na VPS, Arquivos, janela de envio e regras globais
- [x] Etapa 8b — envio de verdade no serviço 24/7 (fila, antibloqueio, respostas e SAIR) — testado de verdade na VPS (envio, "digitando…", resposta SAIR)
- [x] Etapa 8c — painéis (Todos os disparos, Disparos por usuários, dashboards com números reais, saúde do número)
- [x] Etapa 9a — IA trocável pelo Super Admin (Claude e padrão compatível), despesas com IA (gráfico e ranking) e "Atualizar prévia" gerando principal + variações
- [ ] Etapa 9b — Empresa | IA (ficha, materiais, Esquecer, Ler de novo, limites e liga/desliga de treinamento)

## Banco de dados (desenvolvimento)
```bash
cp packages/db/.env.example packages/db/.env
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

O seed cria o Super Admin (e-mail em `SUPERADMIN_EMAIL`, senha temporária mostrada no terminal) e, fora de produção, as contas de teste.

## Agendador diário (renovação)
`apps/web/vercel.json` agenda `GET /api/cron/renovacao` todo dia às 12:00 UTC (9h de Brasília).
Na Vercel, defina a variável `CRON_SECRET`; a Vercel a envia automaticamente nas chamadas do agendador.
