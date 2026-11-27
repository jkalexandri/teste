# Publicação do FilaPro Leads na VPS (decisões #99 e #105)

Tudo fica na VPS da Hostinger (KVM 1 ou maior, Ubuntu 24.04 ou 26.04): o **site** (filaproleads.com.br), o **serviço 24/7**
(api.filaproleads.com.br) e o **banco PostgreSQL**, com HTTPS automático (Caddy), pm2 e **backup diário**.

> Faça **uma parte de cada vez** e confira o resultado ("deve mostrar…") antes de seguir. Se algo der diferente, pare e pergunte.
> **Nunca cole senhas ou chaves no chat.** Elas vão só nos arquivos `.env` da VPS.
> Os comandos são para rodar **na VPS, como root** (painel da Hostinger → VPS → Terminal do navegador, ou `ssh root@IP_DA_VPS`).

---

## Parte 1 — DNS e e-mail (no painel da Hostinger e no Resend; nada na VPS)

### 1.1 DNS (Hostinger → Domínios → filaproleads.com.br → DNS / Nameservers → Gerenciar registros DNS)

O IP da VPS está em: Hostinger → VPS → **Visão geral** (IPv4).

| Tipo | Nome | Aponta para | TTL |
|---|---|---|---|
| A | `@` | IP da VPS | 3600 |
| A | `www` | IP da VPS | 3600 |
| A | `api` | IP da VPS | 3600 |

Apague os registros **A** e **CNAME** antigos de `@` e `www` que apontem para outro lugar (ex.: página padrão da Hostinger).
**Não** apague registros MX/TXT de e-mail que você já use.

### 1.2 E-mails do sistema (Resend — grátis até 3.000 e-mails/mês)

1. Crie a conta em **resend.com**.
2. **Domains → Add Domain** → `filaproleads.com.br` (região: São Paulo, se aparecer).
3. O Resend mostra alguns registros (MX, TXT/SPF e TXT/DKIM). Crie **cada um** no DNS da Hostinger, com o mesmo Tipo, Nome e
   Valor que aparecem lá.
4. Clique em **Verify** e espere ficar **Verified** (minutos a algumas horas).
5. **API Keys → Create API Key** → permissão **Sending access** → guarde a chave (começa com `re_`). Ela vai no passo 4.3.

---

## Parte 2 — Preparar a VPS (programas)

### 2.1 Atualizar e instalar o básico

```bash
apt update && apt upgrade -y
apt install -y git curl ufw gnupg debian-keyring debian-archive-keyring apt-transport-https postgresql
```

### 2.2 Memória extra (swap de 2 GB — a montagem do site precisa)

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

Deve mostrar uma linha **Swap: 2.0Gi**.

### 2.3 Node.js 22, pnpm e pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
# pnpm pelo npm (o "corepack enable" falha no Ubuntu 26.04 por causa de um atalho do yarn)
rm -f /usr/bin/pnpm /usr/bin/pnpx
npm install -g pnpm@10.28.0 pm2
node -v && pnpm -v && pm2 -v
```

Deve mostrar `v22…`, `10.28.0` e um número do pm2. (Se o primeiro comando disser que o Ubuntu não é suportado, avise antes de seguir.)

### 2.4 Caddy (HTTPS automático)

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
caddy version
```

### 2.5 Firewall (só SSH, 80 e 443 abertos)

```bash
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable && ufw status
```

Deve mostrar **Status: active** com OpenSSH, 80 e 443.

---

## Parte 3 — Código e banco

> **VPS que já tinha o serviço 24/7 instalado** (pasta `/opt/filapro/app` e `filapro-worker` no `pm2 list`): em vez do `git clone`,
> rode `cd /opt/filapro/app && git status --short && git pull && pnpm install`; **reaproveite** o `WORKER_TOKEN` e a `CHAVE_CRIPTO`
> do `apps/worker/.env` (`grep -E '^(WORKER_TOKEN|CHAVE_CRIPTO)=' apps/worker/.env`) e, no 5.2, rode antes `pm2 delete filapro-worker`.
> **Não rode `apt autoremove`** (ele pode apagar o Node).

### 3.1 Baixar o sistema

```bash
mkdir -p /opt/filapro/arquivos /opt/filapro/backups
cd /opt/filapro
git clone https://github.com/jkalexandri/teste.git app
cd app
pnpm install
```

### 3.2 Gerar os segredos

```bash
bash /opt/filapro/app/deploy/gerar-segredos.sh
echo "WORKER_TOKEN=$(openssl rand -hex 32)"
echo "CHAVE_CRIPTO=$(openssl rand -hex 32)"
```

Aparecem 6 valores: **CRON_SECRET, SENHA_BANCO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, WORKER_TOKEN e CHAVE_CRIPTO**.
Copie para um bloco de notas **no seu computador** (não no chat). Guarde a **CHAVE_CRIPTO** num lugar seguro: se ela se perder,
todos os WhatsApps precisam ler o QR Code de novo e a chave da IA precisa ser salva de novo.

### 3.3 Criar o banco

Troque `COLE-A-SENHA_BANCO` pelo valor de SENHA_BANCO:

```bash
sudo -u postgres psql -c "CREATE USER filaproleads WITH PASSWORD 'COLE-A-SENHA_BANCO';"
sudo -u postgres psql -c "CREATE DATABASE filaproleads OWNER filaproleads;"
```

Deve mostrar `CREATE ROLE` e `CREATE DATABASE`.

---

## Parte 4 — Configuração

### 4.1 Serviço 24/7: `apps/worker/.env`

```bash
cd /opt/filapro/app/apps/worker && cp .env.example .env && nano .env
```

Preencha (troque os valores em MAIÚSCULAS pelos do passo 3.2):

```
DATABASE_URL="postgresql://filaproleads:SENHA_BANCO@127.0.0.1:5432/filaproleads"
WORKER_TOKEN="WORKER_TOKEN"
CHAVE_CRIPTO="CHAVE_CRIPTO"
VAPID_PUBLIC_KEY="VAPID_PUBLIC_KEY"
VAPID_PRIVATE_KEY="VAPID_PRIVATE_KEY"
RESEND_API_KEY="O MESMO do apps/web/.env.production"
EMAIL_FROM="FilaPro Leads <nao-responda@filaproleads.com.br>"
```

(`RESEND_API_KEY` é para o alerta por e-mail quando o número da plataforma cair — decisão #143; sem ela, só a notificação no celular sai.) (As outras linhas — PORTA, HOST, NIVEL_LOG, PASTA_ARQUIVOS — ficam como estão.) Salve: **Ctrl+O, Enter, Ctrl+X**.

### 4.2 Site: `apps/web/.env.production`

```bash
nano /opt/filapro/app/apps/web/.env.production
```

```
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_SITE_URL="https://filaproleads.com.br"
DATABASE_URL="postgresql://filaproleads:SENHA_BANCO@127.0.0.1:5432/filaproleads"
SUPERADMIN_EMAIL="SEU-EMAIL-DE-ACESSO"
SUPERADMIN_NOME="SEU NOME"
RESEND_API_KEY="CHAVE-DO-RESEND"
EMAIL_FROM="FilaPro Leads <nao-responda@filaproleads.com.br>"
CRON_SECRET="CRON_SECRET"
WORKER_URL="http://127.0.0.1:4000"
WORKER_TOKEN="O MESMO do apps/worker/.env"
CHAVE_CRIPTO="A MESMA do apps/worker/.env"
VAPID_PUBLIC_KEY="VAPID_PUBLIC_KEY"
```

> **Chaves das notificações sem erro de cópia** (pede as duas e grava nos dois arquivos; não aparecem na tela):
> ```bash
> read -rsp "VAPID_PUBLIC_KEY (comprida, começa com B): " PUB; echo; read -rsp "VAPID_PRIVATE_KEY (curta): " PRIV; echo; W=/opt/filapro/app/apps/worker/.env; S=/opt/filapro/app/apps/web/.env.production; sed -i '/^VAPID_/d' "$W" "$S"; sed -i -e '$a\' "$W" "$S"; printf 'VAPID_PUBLIC_KEY="%s"\nVAPID_PRIVATE_KEY="%s"\n' "$PUB" "$PRIV" >> "$W"; printf 'VAPID_PUBLIC_KEY="%s"\n' "$PUB" >> "$S"; unset PUB PRIV
> ```
> Se o banco recusar a senha ("Authentication failed"), cadastre no banco a senha que está no arquivo:
> `P=$(grep '^DATABASE_URL=' /opt/filapro/app/apps/web/.env.production | sed -E 's#.*://filaproleads:([^@]*)@.*#\1#'); sudo -u postgres psql -c "ALTER USER filaproleads WITH PASSWORD '$P';"; unset P`

### 4.3 Proteger os dois arquivos

```bash
chmod 600 /opt/filapro/app/apps/worker/.env /opt/filapro/app/apps/web/.env.production
```

---

## Parte 5 — Criar as tabelas e ligar tudo

### 5.1 Tabelas, planos e o seu acesso de Super Admin

```bash
cd /opt/filapro/app
set -a; . apps/web/.env.production; set +a
pnpm --filter @filapro/db migrate:deploy
pnpm --filter @filapro/db seed
```

O último comando mostra **"Senha temporária…"**: anote (vale 7 dias; você troca ao entrar). Em produção **não** são criadas
contas de demonstração.

### 5.2 Serviço 24/7

```bash
cd /opt/filapro/app/apps/worker
pm2 start "bash -c 'set -a && . ./.env && set +a && exec pnpm start'" --name filapro-worker --cwd /opt/filapro/app/apps/worker
sleep 5 && curl -s http://127.0.0.1:4000/saude
```

Deve mostrar `{"ok":true}`.

### 5.3 Site (a montagem leva alguns minutos no KVM 1)

```bash
cd /opt/filapro/app
pnpm --filter web build
pm2 start "pnpm start -p 3000 -H 127.0.0.1" --name filapro-web --cwd /opt/filapro/app/apps/web
sleep 5 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/login
```

Deve mostrar `200`.

### 5.4 Religar sozinho quando a VPS reiniciar

```bash
pm2 save
pm2 startup systemd
```

O último comando pode imprimir uma linha começando com `sudo env PATH=…`: copie e rode essa linha.

### 5.5 HTTPS

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes 2>/dev/null; cp /opt/filapro/app/deploy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile   # deve terminar com "Valid configuration"
systemctl reload caddy
```

O certificado HTTPS leva até 1–2 minutos na primeira vez (`journalctl -u caddy -n 20` mostra "certificate obtained successfully").
Abra **https://filaproleads.com.br**: deve aparecer a tela de login (sem os botões "Entrar como…", com o selo da versão).
Confira também **https://api.filaproleads.com.br/saude** → `{"ok":true}`.
(Se o HTTPS não abrir, o DNS da Parte 1 ainda está propagando: espere e rode `systemctl reload caddy` de novo.)

---

## Parte 6 — Rotinas, backup e proteção

### 6.1 Backup diário e rotinas

```bash
chmod +x /opt/filapro/app/deploy/*.sh
crontab -e
```

(Se perguntar o editor, escolha **1** — nano.) A VPS usa o fuso de Brasília (America/Sao_Paulo; confira com `date`), então os horários abaixo já são os de Brasília. Acrescente no final:

```
30 3 * * * /opt/filapro/app/deploy/backup-completo.sh completo >> /var/log/filapro-backup.log 2>&1
30 9,15,21 * * * /opt/filapro/app/deploy/backup-completo.sh banco >> /var/log/filapro-backup.log 2>&1
30 4 * * 0 /opt/filapro/app/deploy/restaurar-backup.sh --so-testar >> /var/log/filapro-restauracao.log 2>&1
0 9 * * * /opt/filapro/app/deploy/rotinas.sh >> /var/log/filapro-rotinas.log 2>&1
```

- A cada 5 minutos: vigia do serviço 24/7 (decisão #151) — avisa os Super Admins por e-mail se ele ficar mais de 3 minutos sem sinal (e quando voltar).
  Para ligar (uma vez; pode rodar de novo sem duplicar):

```bash
( crontab -l 2>/dev/null | grep -v vigia-servico.sh; echo '*/5 * * * * /opt/filapro/app/deploy/vigia-servico.sh >> /var/log/filapro-vigia.log 2>&1' ) | crontab -
```

- A cada 15 minutos: **vigia da VPS** (decisão #171) — confere backup, teste de restauração, disco, memória, reinício pendente, relógio e certificado, e o site avisa os Super Admins por e-mail (um aviso por problema, lembretes e \"resolvido\"). Para ligar (uma vez; pode rodar de novo sem duplicar):

```bash
( crontab -l 2>/dev/null | grep -v vigia-vps.sh; echo '*/15 * * * * /opt/filapro/app/deploy/vigia-vps.sh >> /var/log/filapro-vigia-vps.log 2>&1' ) | crontab -
```

- 03:30 (Brasília): **backup completo** (banco, arquivos enviados e chaves criptografadas) em `/opt/filapro/backups/diarios`, com cópias semanais (domingo) e mensais (dia 1): 14 diários, 8 semanais, 6 mensais.
- Domingo 04:30: **teste de restauração** (restaura o último backup diário num banco temporário, confere e apaga o temporário; não toca no banco real; resultado em `/var/log/filapro-restauracao.log` e no diagnóstico).
- 09:30, 15:30 e 21:30: dump só do banco em `/opt/filapro/backups/6h` (perda máxima de 6 horas).
- **Antes do primeiro backup completo**, crie a senha que protege as chaves (uma vez; **guarde a mesma senha fora da VPS**): `bash /opt/filapro/app/deploy/backup-senha.sh --gerar` (gera uma senha aleatória, mostra uma vez para você anotar — **sem print e sem colar no chat** — e depois `bash /opt/filapro/app/deploy/backup-senha.sh --verificar` prova que você anotou certo)
- 09:00 (Brasília): avisos de renovação, despesas fixas do mês e contas vencendo.

Teste o backup agora: `bash /opt/filapro/app/deploy/backup-completo.sh completo && ls -lhR /opt/filapro/backups | head -40`

### 6.1b Cópia do backup fora da VPS — Backblaze B2 (decisão #173)

O backup só protege de verdade se houver uma cópia **fora** da VPS. O sistema envia, todo dia às 03:50, os backups **criptografados na própria VPS** para um bucket privado do Backblaze B2: nem o B2 nem um invasor leem nada.

**1. No site do B2 (uma vez):**
- **Bucket** privado, com **Object Lock habilitado** (retenção padrão de 30 dias, modo Governance) e criptografia ativada.
- **Lifecycle Settings → regras personalizadas** (prefixo / dias até ocultar / dias até eliminar): `diarios/` 31 e 1; `semanais/` 90 e 1; `mensais/` 365 e 1.
- **Application Keys → Add a New Application Key:** nome `filapro-vps`, acesso **só a esse bucket**, tipo **Read and Write**. **Nunca use a chave mestra.** O B2 mostra a chave **uma única vez**: **não tire print e não cole no chat**; deixe a página aberta até o passo 2. (Se o cadastro disser "unauthorized", marque também "Allow List All Bucket Names" ao criar a chave.)

**2. Na VPS, cadastro (uma vez).** O script pede o nome do bucket, o keyID e a applicationKey (**você cola uma vez, ela não aparece**), **testa no B2 na hora** (ACEITO / NÃO ACEITO) e só então grava. No final mostra **duas senhas de criptografia, uma única vez**: **anote as duas no gerenciador de senhas, fora da VPS** (sem elas os backups do B2 não abrem), sem print e sem colar no chat:

```bash
bash /opt/filapro/app/deploy/backup-externo-config.sh
```

Confira que anotou certo (digite as duas; ele diz CONFEREM ou NÃO CONFEREM) e limpe a tela:

```bash
bash /opt/filapro/app/deploy/backup-externo-config.sh --verificar-senhas
```

```bash
clear
```

**3. Primeiro envio e conferência:**

```bash
bash /opt/filapro/app/deploy/backup-externo.sh
```

```bash
bash /opt/filapro/app/deploy/backup-externo.sh --listar
```

**4. Cron (uma vez; pode repetir sem duplicar):**

```bash
( crontab -l 2>/dev/null | grep -v backup-externo.sh; echo '50 3 * * * /opt/filapro/app/deploy/backup-externo.sh >> /var/log/filapro-backup-externo.log 2>&1' ) | crontab -
```

O vigia da VPS avisa por e-mail se o envio atrasar mais de 30 horas ou falhar (e o monitor externo fica vermelho se passar de 74 horas). Para trocar só a chave do B2 (sem mexer nas senhas): `bash /opt/filapro/app/deploy/backup-externo-config.sh --trocar-chave`.

**Ensaio de desastre (faça uma vez, é seguro):** baixa o backup mais recente para uma pasta à parte e confere que abre; não altera nada no banco:

```bash
bash /opt/filapro/app/deploy/backup-externo.sh --baixar --destino /root/ensaio-backup
```

```bash
rm -rf /root/ensaio-backup
```

### 6.2 Proteção da VPS (decisão #105)

1. No **seu computador** (não na VPS), crie uma chave SSH se ainda não tiver: `ssh-keygen -t ed25519`
   e cadastre na VPS: `ssh-copy-id root@IP_DA_VPS`. Confira que `ssh root@IP_DA_VPS` entra **sem pedir senha**.
2. Na VPS: `bash /opt/filapro/app/deploy/seguranca-vps.sh`

Liga: SSH só com chave (senha desligada), **fail2ban** e **atualizações de segurança automáticas**. Se não houver chave cadastrada,
o script **não** desliga a senha. Sem a chave, o acesso continua pelo **Terminal do navegador** no painel da Hostinger.

### 6.2b Diagnóstico da VPS (somente leitura — decisão #168)

Mostra o estado real da VPS (sistema, relógio, serviços, site, backup, arquivos, chaves — só os **nomes** —, banco, aplicação e logs) com [OK], [ATENCAO] e [FALHA].
**Não altera nada** e **não mostra senhas, chaves nem valores dos `.env`**. Rode como root e mande a tela inteira para o desenvolvedor:

```bash
bash /opt/filapro/app/deploy/diagnostico-vps.sh
```

Se a VPS ainda não tem o arquivo (versão antiga), baixe só ele, sem atualizar o sistema:

```bash
cd /opt/filapro/app && git fetch origin main && git show origin/main:deploy/diagnostico-vps.sh > /root/diagnostico-vps.sh
```

```bash
bash /root/diagnostico-vps.sh
```

### 6.2c Monitor externo e avisos da VPS (decisão #171)

O aviso por e-mail sai da própria VPS: se ela cair inteira, ele não sai. Por isso há também um **monitor externo**, um serviço gratuito de fora (por exemplo, o UptimeRobot) que verifica o site a cada 5 minutos e avisa você por e-mail e pelo celular.

1. Gere o código secreto do monitor (aparece na tela; **não tire print nem cole no chat**) e coloque no `.env` do site, na linha `MONITOR_TOKEN="..."` (`nano /opt/filapro/app/apps/web/.env.production`):

```bash
echo "MONITOR_TOKEN=$(openssl rand -hex 24)"
```

2. Reinicie o site para ler o `.env`:

```bash
pm2 restart filapro-web --update-env
```

3. Rode o vigia uma vez (cria o primeiro relatório; sem ele o monitor responde 503 "sem relatorio"):

```bash
bash /opt/filapro/app/deploy/vigia-vps.sh
```

4. Crie uma conta grátis no UptimeRobot, escolha **Add New Monitor → HTTP(s)** e use o endereço `https://filaproleads.com.br/api/monitor?t=SEU_CODIGO` (com o código do passo 1), intervalo de **5 minutos**, e cadastre seu e-mail (e o app no celular) para receber os alertas. Em "Keyword", se pedir, use `ok`.
5. O monitor fica **verde** (200 "ok") quando o site está no ar, a VPS reportou na última hora e não há problema **crítico**. Fica **vermelho** (503) se há problema crítico (backup parado há mais de 50 horas, disco em 90% ou mais, certificado perto de vencer) ou se a VPS parou de reportar. Sem o código certo o endereço responde 404. Durante a atualização do sistema ele responde 200 "manutencao" e não alarma.

Para ver o que o vigia está enxergando agora (não envia nada):

```bash
bash /opt/filapro/app/deploy/vigia-vps.sh --mostrar
```

### 6.2d Rotação de logs (decisão #172)

Sem isso os logs crescem até encher o disco. Rode **uma vez** como root (pode repetir sem problema):

```bash
bash /opt/filapro/app/deploy/rotacao-logs.sh
```

Ele usa o `logrotate` do Ubuntu: os logs do FilaPro (`/var/log/filapro-*.log`) giram toda semana (ou ao passar de 20 MB) e guardam 8 cópias; os do pm2 giram todo dia (ou ao passar de 50 MB) e guardam 14 cópias; tudo compactado e só o root lê. O journal do sistema fica limitado a 200 MB e 1 mês. Para conferir (não altera nada):

```bash
bash /opt/filapro/app/deploy/rotacao-logs.sh --conferir
```

### Reinício controlado da VPS (quando chegar o aviso "a VPS precisa ser reiniciada")

As correções de segurança do sistema só valem depois de reiniciar. Faça em horário de pouco movimento, sem pressa (o aviso só se repete a cada 7 dias).

1. Avise os usuários (opcional) e ligue a manutenção (os clientes veem "Sistema em atualização"; campanhas e respostas da IA ficam em espera e continuam sozinhas):

```bash
bash /opt/filapro/app/deploy/manutencao.sh avisar 10
```

```bash
bash /opt/filapro/app/deploy/manutencao.sh ligar
```

2. Salve a lista de processos e reinicie a VPS (a conexão do terminal cai; é normal):

```bash
pm2 save && reboot
```

3. Espere uns 2 minutos, entre de novo por SSH e confira que o site e o serviço 24/7 subiram sozinhos:

```bash
pm2 status
```

4. Libere o sistema e rode o diagnóstico (deve estar sem falhas e sem o aviso de reinício pendente):

```bash
bash /opt/filapro/app/deploy/manutencao.sh desligar
```

```bash
bash /opt/filapro/app/deploy/diagnostico-vps.sh | grep -E "ATENCAO|FALHA|RESUMO"
```

5. Na tela WhatsApp, confira que os números voltam a "Conectado" (reconectam sozinhos em alguns minutos; se algum pedir novo QR Code, conecte de novo).

## Parte 6.3 — Sugestão de planos (opcional, decisão #111)

Preenche 12 planos (7 "Sem limite" + 5 "Start" por quantidade), todos **visíveis como "Em breve"** (preço **R$ 0,00**, sem compra).
Sobrescreve o
conteúdo dos 7 planos da instalação (não mexe em contas, pedidos nem em planos criados por você):

```bash
cd /opt/filapro/app && set -a && . apps/web/.env.production && set +a && pnpm --filter @filapro/db planos:sugeridos
```

Depois: Super Admin → **Planos** → **Editar** cada um e coloque o preço — o plano passa a vender na hora.

## Parte 7 — Primeiro uso (no site publicado)

1. Entre com o seu e-mail e a senha temporária → crie a sua senha (pode usar **Gerar senha forte**).
   Depois, no menu **Segurança**, ative a **verificação em duas etapas** e guarde os códigos de recuperação.
2. **Dados legais**: preencha (aparecem na Política de Privacidade e nos Termos).
3. **Inteligência Artificial**: cole a chave da Anthropic → **Testar** → **Salvar chave**.
4. **Pagamento**: chave PIX e dados do recebedor.
5. **Planos**: preços, limites, WhatsApps extras, Leads de anúncios.
6. **Número da plataforma**: conecte o WhatsApp que envia os avisos → **Enviar mensagem de teste**.
7. **Meu WhatsApp**: conecte o seu número.
8. **Avisos**: ative as notificações no celular (veja a Parte 8).

## Parte 8 — App no celular

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

Use sempre o script seguro. Ele **não apaga nada antes de provar que o backup restaura**: restaura num banco temporário, confere, mostra a comparação com o banco atual e só então pede para você digitar `RESTAURAR`. O banco atual não é apagado: fica guardado com outro nome (e um dump de segurança é salvo antes).

Primeiro, **teste sem risco** (só confere; não altera nada no banco real):

```bash
bash /opt/filapro/app/deploy/restaurar-backup.sh --so-testar
```

Para restaurar de verdade (lista os backups e você escolhe o número):

```bash
bash /opt/filapro/app/deploy/restaurar-backup.sh
```

Para restaurar também os arquivos enviados do mesmo backup:

```bash
bash /opt/filapro/app/deploy/restaurar-backup.sh --arquivos
```

Para abrir o pacote de chaves do backup (só se perdeu os `.env`; usa a senha guardada em `/root/.filapro-backup-senha`, ou copie a senha de volta para esse arquivo antes) numa pasta à parte, sem sobrescrever nada:

```bash
bash /opt/filapro/app/deploy/restaurar-backup.sh --chaves
```

Depois de conferir que está tudo certo, apague o banco antigo que ficou guardado (o nome aparece no final do script):

```bash
sudo -u postgres dropdb NOME_MOSTRADO_NO_FINAL
```

### Roteiro de desastre (servidor perdido ou banco destruído)
1. Servidor novo com o sistema instalado (seção de instalação acima) e o repositório em `/opt/filapro/app`.
2. Instale o rclone e recrie a ligação com o B2 usando as **duas senhas de criptografia que você anotou** e uma chave nova do B2 (Read and Write, restrita ao bucket): `bash /opt/filapro/app/deploy/backup-externo-config.sh --recuperar`. Depois baixe o backup mais recente: `bash /opt/filapro/app/deploy/backup-externo.sh --baixar` (vai para `/opt/filapro/backups/recuperado`).
3. Recupere os `.env`: abra o pacote `chaves-*.tar.gz.enc` com a senha do backup (guardada no seu gerenciador de senhas): `bash restaurar-backup.sh --chaves` e copie os dois `.env` para os lugares certos.
4. `bash /opt/filapro/app/deploy/restaurar-backup.sh --arquivos` e escolha o backup mais recente.
5. `bash /opt/filapro/app/deploy/atualizar.sh` e `bash /opt/filapro/app/deploy/diagnostico-vps.sh`.
6. Reconecte os números de WhatsApp se algum pedir novo QR Code (o login fica no banco, mas confira).
