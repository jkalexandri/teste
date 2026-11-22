# Instalação do serviço 24/7 na VPS (etapa 6b)

Guia para a **sessão do Claude Code na VPS da Hostinger** (pasta `/opt/filapro`).
O serviço mantém as conexões do WhatsApp ligadas 24 h (API própria, por QR Code, sem API oficial da Meta).

> **Para o Claude Code na VPS:** siga os passos na ordem, confira cada um antes de seguir para o próximo e
> **pergunte ao dono do projeto** antes de qualquer coisa que não esteja aqui. Nunca envie arquivos `.env`
> para o GitHub (o repositório é público). Comandos para Ubuntu 24.04, rodando como `root`.

## Visão geral

```
Navegador ──> filaproleads.com.br (Vercel, telas)
                    │  HTTPS + WORKER_TOKEN
                    ▼
            api.filaproleads.com.br (esta VPS)
            Caddy (HTTPS automático) ──> 127.0.0.1:4000 (apps/worker, pm2)
                    │
                    ▼
            PostgreSQL (o mesmo banco do site)
```

## 1. DNS (painel da Hostinger)

No painel da Hostinger → Domínios → `filaproleads.com.br` → DNS:

| Tipo | Nome | Aponta para | TTL |
|---|---|---|---|
| A | `api` | IP da VPS (painel da VPS → visão geral) | 3600 |

Conferir (pode levar alguns minutos): `dig +short api.filaproleads.com.br` deve mostrar o IP da VPS.

## 2. Programas

```bash
apt update && apt upgrade -y
apt install -y git curl ufw debian-keyring debian-archive-keyring apt-transport-https
```

Node 22 + pnpm + pm2:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
corepack enable && corepack prepare pnpm@10.28.0 --activate
npm install -g pm2
node -v && pnpm -v && pm2 -v
```

Caddy (servidor HTTPS com certificado automático):

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Firewall (só SSH e HTTPS ficam abertos; a porta 4000 fica fechada para fora):

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable && ufw status
```

## 3. Banco de dados

O serviço usa **o mesmo banco do site**.

- **Se o banco de produção já existe** (Vercel Postgres/Neon): use a mesma `DATABASE_URL` da Vercel.
- **Se ainda não existe** (teste da 6b antes de publicar o site): crie um Postgres só para teste nesta VPS:

```bash
apt install -y postgresql
sudo -u postgres psql -c "CREATE USER filapro WITH PASSWORD 'TROQUE-ESTA-SENHA';"
sudo -u postgres psql -c "CREATE DATABASE filapro OWNER filapro;"
# DATABASE_URL="postgresql://filapro:TROQUE-ESTA-SENHA@127.0.0.1:5432/filapro"
```

## 4. Código

```bash
cd /opt/filapro
git clone https://github.com/jkalexandri/teste.git app
cd app
pnpm install
```

Arquivo `packages/db/.env` (só a linha do banco):

```bash
echo 'DATABASE_URL="COLE-A-URL-DO-BANCO"' > packages/db/.env
pnpm --filter @filapro/db migrate:deploy
```

> Banco de teste novo: rode também `pnpm db:seed` (cria planos e o Super Admin).
> **Não** rode o seed no banco de produção sem combinar com o dono do projeto.

## 5. Configuração do serviço

```bash
cd /opt/filapro/app/apps/worker
cp .env.example .env
echo "WORKER_TOKEN=$(openssl rand -hex 32)"
echo "CHAVE_CRIPTO=$(openssl rand -hex 32)"
nano .env   # cole DATABASE_URL, WORKER_TOKEN e CHAVE_CRIPTO (e confira PASTA_ARQUIVOS)
mkdir -p /opt/filapro/arquivos   # anexos das campanhas (etapa 8)
chmod 600 .env
```

- **WORKER_TOKEN**: o mesmo valor vai na Vercel (variável `WORKER_TOKEN`). Passe ao dono do projeto por um canal seguro.
- **CHAVE_CRIPTO**: fica **só na VPS**. Guarde uma cópia em local seguro — se perder, todos precisam ler o QR de novo.

Conferir: `pnpm typecheck && pnpm test` (com `DATABASE_URL` carregada: `set -a && . ./.env && set +a`).

## 6. Teste real do QR Code (sem o site)

```bash
cd /opt/filapro/app/apps/worker
set -a && . ./.env && set +a
pnpm teste-qr 55DDDNUMERO   # número que vai RECEBER a mensagem de teste
```

1. O QR Code aparece no terminal. No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo.
2. Deve aparecer `✅ Conectado como ...` e `{ ok: true, mensagem: 'Mensagem enviada.' }`.
3. A mensagem chega no número informado. O script desconecta e apaga a sessão de teste sozinho.

Se der erro, copie a saída completa para o dono do projeto (ela não mostra senhas).
Se a conexão falhar repetidamente, teste a versão estável antiga do Baileys:
`pnpm add @whiskeysockets/baileys@6.7.24` — e avise antes de enviar a mudança ao GitHub.

## 7. Deixar ligado 24/7 (pm2)

O pm2 religa o serviço se ele cair e quando a VPS reiniciar. O `.env` é carregado antes de iniciar:

```bash
cd /opt/filapro/app/apps/worker
pm2 start "bash -c 'set -a && . ./.env && set +a && exec pnpm start'" --name filapro-worker --cwd /opt/filapro/app/apps/worker
pm2 save
pm2 startup systemd   # rode o comando que ele imprimir
curl -s http://127.0.0.1:4000/saude   # {"ok":true}
pm2 logs filapro-worker --lines 30
```

## 8. HTTPS com Caddy

`/etc/caddy/Caddyfile`:

```
api.filaproleads.com.br {
    reverse_proxy 127.0.0.1:4000
}
```

```bash
systemctl reload caddy
curl -s https://api.filaproleads.com.br/saude   # {"ok":true}
```

## 9. Ligar o site ao serviço (Vercel)

Variáveis do projeto na Vercel:

| Variável | Valor |
|---|---|
| `WORKER_URL` | `https://api.filaproleads.com.br` |
| `WORKER_TOKEN` | o mesmo da VPS |
| `CHAVE_CRIPTO` | o mesmo da VPS (criptografa as chaves da IA) |

Depois: Super Admin → **Número da plataforma** → Conectar WhatsApp → ler o QR → salvar o seu WhatsApp
para os avisos → **Enviar mensagem de teste**.

## Etapa 8b — atualizar a VPS e testar uma campanha de verdade

Na VPS (pode ser pelo Claude da VPS ou à mão), um comando de cada vez:

```bash
cd /opt/filapro/app
git pull
pnpm install
pnpm --filter @filapro/db migrate:deploy
mkdir -p /opt/filapro/arquivos
grep -q PASTA_ARQUIVOS apps/worker/.env || echo 'PASTA_ARQUIVOS=/opt/filapro/arquivos' >> apps/worker/.env
pm2 restart filapro-worker
pm2 logs filapro-worker --lines 20
```

Teste real (precisa de **dois celulares**: um que ENVIA e outro que RECEBE):

```bash
cd /opt/filapro/app/apps/worker
set -a && . ./.env && set +a
pnpm teste-campanha 55DDDNUMERO
```

`55DDDNUMERO` = número que vai **receber** (ex.: 5511999999999). Para testar com imagem, coloque uma foto
na VPS e rode `pnpm teste-campanha 55DDDNUMERO /caminho/foto.jpg`.

1. Leia o QR com o celular que vai **enviar** (pode ser o mesmo número do teste do item 6).
2. Deve aparecer `✅ Mensagem enviada.` e a mensagem chega no outro celular (com "digitando…" antes e o texto de descadastro no fim).
3. No celular que recebeu, responda **SAIR** → deve aparecer `✅ Resposta "SAIR" recebida`.
4. O script desconecta e apaga tudo o que criou.

## Etapa 9b — Empresa | IA (leitura de sites, PDFs e imagens na VPS)

A leitura dos materiais do Empresa | IA roda no serviço 24/7. Para atualizar, use os comandos de
"Atualizar o serviço" abaixo (o `pnpm install` instala o leitor de PDF). Não há variável nova.

- Os PDFs e imagens ficam na mesma pasta dos anexos (`PASTA_ARQUIVOS`), com nome `mat-<id>`.
- Por segurança, o leitor de sites **não acessa endereços internos** (127.0.0.1, 10.x, 192.168.x etc.).
- A IA usada é a chave salva no menu **Inteligência Artificial** (a chave nunca fica na VPS em texto puro).

## Etapa 10 — Conversas IA

A IA responde os leads pelo serviço 24/7, a qualquer hora (20 a 60 s depois da mensagem, com "digitando…").
Para atualizar, use os comandos de "Atualizar o serviço" abaixo (há migração nova do banco). Não há variável nova.

- Os avisos ao usuário (IA não soube responder, áudio recebido, limite de 30 respostas por dia) saem pelo **Número da plataforma**.
- As mensagens com mais de 365 dias são apagadas sozinhas, uma vez por dia.

## Etapa 10b — Avisos e leads de anúncios

O endereço de leads de anúncios fica no **site** (`filaproleads.com.br/api/anuncios/...`); o serviço 24/7 cadastra o lead
e a IA escreve a primeira mensagem. Use os comandos de "Atualizar o serviço" abaixo (há migração nova). Não há variável nova.

- Os avisos (Quente, anúncio, lead respondeu) saem pelo **Número da plataforma**: ele precisa estar conectado.
- Leads de anúncio que chegam com o WhatsApp do usuário desconectado são atendidos quando ele reconectar.

## Atualizar o serviço (novas versões)

```bash
cd /opt/filapro/app
git pull
pnpm install
pnpm --filter @filapro/db migrate:deploy
pm2 restart filapro-worker
```

Reiniciar **não** desconecta o WhatsApp: as sessões ficam salvas (criptografadas) no banco e voltam sozinhas.

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Site mostra "serviço do WhatsApp fora do ar" | `pm2 status`, `pm2 logs filapro-worker`, `curl https://api.filaproleads.com.br/saude` |
| `Não autorizado` (401) | `WORKER_TOKEN` diferente entre VPS e Vercel |
| Certificado HTTPS não sai | DNS do `api` ainda não aponta para a VPS, ou portas 80/443 fechadas |
| "QR Code expirou" | Ninguém leu a tempo: clique em Conectar de novo |
| "Desconectado pelo celular" | O usuário removeu o aparelho no celular: ler o QR de novo |
