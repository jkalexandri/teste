# FilaPro Leads — regras de trabalho

## Antes de qualquer código
- Ler `docs/prompt_claude_code_filapro.md` (especificação principal), `docs/decisoes.md` e `docs/login-referencia.md`.
- Em conflito entre documentos, vale: `decisoes.md` > `prompt_claude_code_filapro.md` > `especificacao-api-whatsapp.md`.

## Regras do dono do projeto
- **Se alguma regra de funcionamento não estiver clara, PERGUNTAR antes de implementar.** Nunca inventar regra, dado ou função.
- **Revisar o funcionamento de cada etapa antes de avançar** (testar, conferir telas, listar o que foi feito e o que ficou pendente).
- Mostrar o plano de arquivos antes de criar algo grande.
- Corrigir só o item pedido, sem mudar o resto.
- Código comentado em português.

## Login (regra máxima)
- A tela de login deve ficar **idêntica** à prévia (`docs/login-referencia.md`): fundo, cores, circuitos, feixes, animações, fontes, tamanhos e posições.
- Não redesenhar, não simplificar, não remover animação. A cada entrega, conferir o login com prints antes de avançar.

## Stack (não mudar)
TypeScript, Next.js 15 (App Router), React + Tailwind CSS, PostgreSQL + Prisma, deploy Vercel (`imobfile.com.br`).
Serviço 24/7 separado em `api.imobfile.com.br` (API, fila, sessões WhatsApp por QR Code). Sem API oficial da Meta.

## Estrutura
- `apps/web` — Next.js (telas)
- `apps/worker` — serviço 24/7 (etapas futuras)
- `packages/*` — código compartilhado (banco, tipos, regras)
