#!/usr/bin/env bash
# Mudar de servidor: restaura no servidor NOVO o pacote gerado por empacotar-servidor.sh.
# Antes: Node 20, pnpm, PostgreSQL, Caddy e pm2 instalados e o repositório clonado em /opt/filapro/app.
# Uso: bash /opt/filapro/app/deploy/restaurar-servidor.sh /caminho/mudanca-AAAA-MM-DD_HHMM.tar.gz
set -euo pipefail
PACOTE="$1"
TMP=$(mktemp -d)
tar -xzf "$PACOTE" -C "$TMP"
cp "$TMP/web.env.production" /opt/filapro/app/apps/web/.env.production
cp "$TMP/worker.env" /opt/filapro/app/apps/worker/.env
SENHA=$(grep '^DATABASE_URL=' /opt/filapro/app/apps/worker/.env | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
sudo -u postgres psql -c "CREATE USER filaproleads WITH PASSWORD '$SENHA';" || true
sudo -u postgres createdb -O filaproleads filaproleads
gunzip -c "$TMP/banco.sql.gz" | sudo -u postgres psql -q filaproleads
sudo -u postgres psql -q filaproleads -c "REASSIGN OWNED BY postgres TO filaproleads;"
mkdir -p /opt/filapro && tar -xzf "$TMP/arquivos.tar.gz" -C /opt/filapro 2>/dev/null || mkdir -p /opt/filapro/arquivos
rm -rf "$TMP"
cd /opt/filapro/app
pnpm install --frozen-lockfile
set -a; . apps/web/.env.production; set +a
pnpm --filter @filapro/db migrate:deploy
pnpm --filter web build
pm2 start "pnpm start -p 3000 -H 127.0.0.1" --name filapro-web --cwd /opt/filapro/app/apps/web
pm2 start "bash -c 'set -a && . ./.env && set +a && exec pnpm start'" --name filapro-worker --cwd /opt/filapro/app/apps/worker
pm2 save
cp deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
echo "Restaurado. Agora aponte o DNS (@, www, api) para o IP deste servidor e agende o backup e as rotinas (docs/publicacao-vps.md, passo 10)."
