# Publicação do FilaPro Leads na VPS (etapa 12 — decisão #99)

Tudo fica na VPS da Hostinger: o **site** (filaproleads.com.br), o **serviço 24/7** (api.filaproleads.com.br)
e o **banco PostgreSQL**, com HTTPS automático (Caddy), pm2 e **backup diário**.

> Faça um passo de cada vez e confira o resultado antes de seguir. Em caso de dúvida, pare e pergunte.
> Nunca cole senhas ou chaves no chat. Elas vão só nos arquivos `.env` da VPS.

---

## 1. DNS (painel da Hostinger → Domínios → filaproleads.com.br → DNS)

| Tipo | Nome | Aponta para |
|---|---|---|
| A | `@` | IP da VPS |
| A | `www` | IP da VPS |
| A | `api` | IP da VPS (já existe) |

Apague registros antigos de `@` e `www` que apontem para outro lugar (ex.: página padrão da Hostinger).
A propagação leva de minutos a algumas horas.

## 2. E-mails (Resend)

1. Crie a conta em **resend.com** (plano grátis: 3.000 e-mails por mês).
2. **Domains → Add Domain** → `filaproleads.com.br`.
3. O Resend mostra 3 registros (MX, TXT/SPF e TXT/DKIM): crie cada um no DNS da Hostinger, igual ao que aparece lá.
4. Espere ficar **Verified**.
5. **API Keys → Create API Key** (permissão "Sending access"). Guarde a chave: ela vai no `.env.production` do passo 5.

## 3. Banco de produção (novo e limpo)

Na VPS:

```bash
bash /opt/filapro/app/deploy/gerar-segredos.sh
```

Anote os valores que aparecem (CRON_SECRET, SENHA_BANCO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).

```bash
sudo -u postgres psql -c "CREATE USER filaproleads WITH PASSWORD 'COLE-A-SENHA_BANCO';"
sudo -u postgres psql -c "CREATE DATABASE filaproleads OWNER filaproleads;"
```

O banco de teste antigo (`filapro`) continua lá, sem uso. Pode ser apagado depois que tudo estiver funcionando.

## 4. Código atualizado

```bash
cd /opt/filapro/app
git pull
pnpm install
```

## 5. Configuração do site: `apps/web/.env.production`

```bash
nano /opt/filapro/app/apps/web/.env.production
```

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_SITE_URL="https://filaproleads.com.br"
DATABASE_URL="postgresql://filaproleads:SENHA_BANCO@127.0.0.1:5432/filaproleads"
SUPERADMIN_EMAIL="seu-email-de-acesso"
SUPERADMIN_NOME="Seu nome"
RESEND_API_KEY="chave-do-resend"
EMAIL_FROM="FilaPro Leads <nao-responda@filaproleads.com.br>"
CRON_SECRET="valor-do-passo-3"
WORKER_URL="http://127.0.0.1:4000"
WORKER_TOKEN="O MESMO de apps/worker/.env"
CHAVE_CRIPTO="A MESMA de apps/worker/.env"
VAPID_PUBLIC_KEY="valor-do-passo-3"
```

> `WORKER_TOKEN` e `CHAVE_CRIPTO`: copie de `apps/worker/.env` (não gere novos).

## 6. Serviço 24/7: `apps/worker/.env`

```bash
nano /opt/filapro/app/apps/worker/.env
```

Troque o `DATABASE_URL` pelo do banco novo e acrescente as chaves das notificações:

```
DATABASE_URL="postgresql://filaproleads:SENHA_BANCO@127.0.0.1:5432/filaproleads"
VAPID_PUBLIC_KEY="valor-do-passo-3"
VAPID_PRIVATE_KEY="valor-do-passo-3"
```

## 7. Criar as tabelas, os planos e o seu acesso de Super Admin

```bash
cd /opt/filapro/app
set -a; . apps/web/.env.production; set +a
pnpm --filter @filapro/db migrate:deploy
pnpm --filter @filapro/db seed
```

O último comando mostra **"Senha temporária…"**: anote. É o seu primeiro acesso (vale 7 dias; você troca a senha
ao entrar). Em produção **não** são criadas contas de demonstração.

## 8. Montar e ligar o site

```bash
cd /opt/filapro/app
pnpm --filter web build
pm2 start "pnpm start -p 3000 -H 127.0.0.1" --name filapro-web --cwd /opt/filapro/app/apps/web
pm2 restart filapro-worker --update-env
pm2 save
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login   # 200
```

> Se a VPS tiver pouca memória (menos de 4 GB) e o `build` parar com "out of memory", crie 2 GB de swap:
> `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab`

## 9. HTTPS (Caddy)

```bash
cp /opt/filapro/app/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

Abra **https://filaproleads.com.br** no navegador: deve aparecer a tela de login (sem os botões "Entrar como…").

## 10. Backup diário e rotinas automáticas

```bash
crontab -e
```

Acrescente as duas linhas (horários de Brasília = UTC−3):

```
30 6 * * * /opt/filapro/app/deploy/backup-banco.sh >> /var/log/filapro-backup.log 2>&1
0 12 * * * /opt/filapro/app/deploy/rotinas.sh >> /var/log/filapro-rotinas.log 2>&1
```

- 03:30 (Brasília): backup do banco em `/opt/filapro/backups` (guarda 14 dias).
- 09:00 (Brasília): avisos de renovação (10 e 3 dias antes do vencimento).

Teste o backup agora: `bash /opt/filapro/app/deploy/backup-banco.sh`

## 11. Primeiro uso (no site publicado)

1. Entre com o seu e-mail e a senha temporária → crie a sua senha (pode usar **Gerar senha forte**).
2. **Dados legais**: preencha (aparecem na Política de Privacidade e nos Termos).
3. **Inteligência Artificial**: cole a chave da Anthropic → **Testar** → **Salvar chave**.
4. **Pagamento**: chave PIX e dados do recebedor.
5. **Planos**: preços, limites, WhatsApps extras, Leads de anúncios.
6. **Número da plataforma**: conecte o WhatsApp que envia os avisos → **Enviar mensagem de teste**.
7. **Meu WhatsApp**: conecte o seu número.
8. **Avisos**: ative as notificações no celular (veja o passo 12).

## 12. App no celular

- **Android (Chrome):** abra filaproleads.com.br → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
- **iPhone (Safari):** abra filaproleads.com.br → **Compartilhar** → **Adicionar à Tela de Início**.
  Abra pelo ícone. Para notificações, o iPhone precisa do iOS 16.4 ou mais novo.
- Depois, no app: **Avisos → Ativar notificações neste aparelho** → **Enviar aviso de teste**.

## Atualizações futuras (um comando)

```bash
bash /opt/filapro/app/deploy/atualizar.sh
```

Faz **backup do banco antes**, baixa a versão nova, aplica as mudanças do banco, monta o site e reinicia tudo, sem desconectar
o WhatsApp. No final mostra **"Atualizado para a versão vX.Y.Z"**.

Se algo der errado, volte para a versão anterior (pergunta se deve restaurar também o banco de antes da atualização):

```bash
bash /opt/filapro/app/deploy/voltar-versao.sh
```

Para **mudar de servidor**, veja o Manual do Desenvolvedor (menu Ajuda), seção *Mudar de servidor*.

## Restaurar um backup (só em emergência)

```bash
pm2 stop filapro-web filapro-worker
sudo -u postgres dropdb filaproleads
sudo -u postgres createdb -O filaproleads filaproleads
gunzip -c /opt/filapro/backups/ARQUIVO.sql.gz | sudo -u postgres psql filaproleads
sudo -u postgres psql filaproleads -c "REASSIGN OWNED BY postgres TO filaproleads;"
pm2 start filapro-web filapro-worker
```
