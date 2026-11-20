# FilaPro Leads

Envio de WhatsApp para leads, com IA, antibloqueio e fila na nuvem 24/7.

- Especificação: `docs/prompt_claude_code_filapro.md`
- Decisões: `docs/decisoes.md`
- Referência do login: `docs/login-referencia.md`

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
- [ ] Etapa 2 — usuários, banco de dados e entrada no sistema
