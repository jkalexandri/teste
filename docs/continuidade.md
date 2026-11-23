# Continuidade — como seguir o projeto em outra sessão ou outro login do Claude

Tudo o que define o FilaPro Leads está **neste repositório** (GitHub `jkalexandri/teste`). Uma sessão nova do Claude Code,
em qualquer login, continua do mesmo ponto lendo estes arquivos:

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Regras de trabalho do dono (lido automaticamente pelo Claude Code) |
| `docs/decisoes.md` | **Todas as regras de negócio aprovadas** (#1 em diante). Em conflito, vale este |
| `docs/prompt_claude_code_filapro.md` | Especificação principal |
| `docs/login-referencia.md` | Tela de login (regra máxima: idêntica; mudanças só com decisão registrada) |
| `docs/manuais/*.md` | Manuais (usuário, admin, Super Admin, desenvolvedor) e **Novidades** (histórico das versões) |
| `docs/publicacao-vps.md` | Instalação e operação da VPS (produção) |
| `docs/continuidade.md` | Este arquivo: estado atual e pendências |

## Como começar a nova sessão

1. No login novo do Claude, conecte o GitHub com acesso ao repositório `jkalexandri/teste`
   (claude.ai → Configurações → Conectores/GitHub) e abra o Claude Code nesse repositório.
2. Primeira mensagem sugerida:
   > "Leia CLAUDE.md, docs/decisoes.md, docs/continuidade.md e docs/manuais/desenvolvedor.md e continue o projeto
   > FilaPro Leads de onde parou. Responda em português."
3. **Segredos não estão no GitHub** (de propósito — o repositório é público). Eles ficam só na VPS
   (`/opt/filapro/app/apps/web/.env.production` e `/opt/filapro/app/apps/worker/.env`) e no seu bloco de notas.
   Nunca cole senhas, chaves ou tokens no chat.

## Ambiente de teste (para a sessão nova conseguir testar)

Os testes **nunca** rodam na VPS de produção (criam e apagam dados). A sessão nova monta um ambiente de teste próprio:

- PostgreSQL de teste na porta 5433 (socket em `/var/tmp`), banco `filapro`, com `pnpm --filter @filapro/db migrate:deploy`
  e `pnpm --filter @filapro/db seed` **sem** `NEXT_PUBLIC_APP_ENV=production` (cria as contas de demonstração).
- `apps/web/.env.local`: `NEXT_PUBLIC_APP_ENV` (não "production"), `DATABASE_URL`, `WORKER_URL=http://127.0.0.1:4000`,
  `WORKER_TOKEN`, `CHAVE_CRIPTO`, `VAPID_PUBLIC_KEY` — valores **de teste**, gerados na hora (nunca os da produção).
- `apps/worker/.env`: o mesmo banco de teste, o mesmo `WORKER_TOKEN`/`CHAVE_CRIPTO` de teste e as chaves VAPID de teste.
- Site: `pnpm --filter web build` e `ASAAS_URL=http://127.0.0.1:4010 CRON_SECRET=segredo-teste pnpm --filter web start -p 3005` (o ASAAS_URL aponta para o Asaas de mentira dos testes, `apps/web/tests/asaas-falso.cjs`).
- Serviço 24/7: `cd apps/worker && set -a && . ./.env && set +a && DISPAROS=desligado npx tsx src/index.ts`.
- Regressão completa: `bash scripts/regressao.sh` (~40 min). Testes de uma etapa: `node apps/web/tests/<etapa>.e2e.cjs /tmp/prints`.

## Como uma mudança chega na produção

1. A sessão do Claude faz a mudança, testa (regressão + print do login) e envia ao GitHub (`main`), subindo a versão no
   `package.json` da raiz e escrevendo em `docs/manuais/novidades.md`.
2. Você, no terminal da VPS: `bash /opt/filapro/app/deploy/atualizar.sh`
   (backup, modo manutenção, atualiza, libera e mostra "Atualizado para a versão vX.Y.Z").
3. Se der problema: `bash /opt/filapro/app/deploy/voltar-versao.sh`.

## Estado atual (23/11/2026)

- **Versão no GitHub:** veja `"version"` no `package.json` da raiz e o topo de `docs/manuais/novidades.md`.
- **Produção:** VPS Hostinger KVM 1 (Ubuntu 26.04, Campinas) com site, serviço 24/7 e banco `filaproleads`; HTTPS pelo Caddy;
  DNS `@`, `www`, `api` apontando para a VPS; e-mails pelo Resend (domínio verificado).

### Pendências da publicação (`docs/publicacao-vps.md`)
- Parte 6.1 — backup diário e rotinas (crontab).
- Parte 6.2 — proteção da VPS (`deploy/seguranca-vps.sh`, depois de cadastrar a chave SSH).
- Parte 7 — primeiro acesso do Super Admin (trocar a senha temporária, ativar a verificação em duas etapas, dados legais,
  chave da IA, pagamento, planos, número da plataforma, avisos).
- Parte 8 — app no celular.
- O banco de teste antigo `filapro` na VPS pode ser apagado depois que tudo estiver funcionando.

### Pendências que dependem do dono
- Cloudflare na frente do domínio e proteção contra robôs (decisão #105, itens 5 e 6).
- Backup diário fora da VPS (decisão #105, item 7): escolher onde guardar.

### Próximas funcionalidades combinadas
- Integração direta com Facebook/Instagram Lead Ads (hoje entra pelo Make/Zapier).
- Fase 2: cobrança automática (ver `docs/decisoes.md`, seção "Fase 2").
