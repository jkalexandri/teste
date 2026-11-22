#!/usr/bin/env bash
# Atualiza o FilaPro Leads na VPS (site + serviço 24/7) — decisão #99.
# Uso: bash /opt/filapro/app/deploy/atualizar.sh
set -euo pipefail
cd /opt/filapro/app
echo "==> Baixando a versão nova"
git pull --ff-only
echo "==> Instalando dependências"
pnpm install --frozen-lockfile
echo "==> Atualizando o banco (migrações)"
set -a; . apps/web/.env.production; set +a
pnpm --filter @filapro/db migrate:deploy
echo "==> Montando o site"
pnpm --filter web build
echo "==> Reiniciando site e serviço"
pm2 restart filapro-web filapro-worker --update-env
pm2 save
sleep 5
curl -fsS http://127.0.0.1:3000/login -o /dev/null && echo "Site: OK"
curl -fsS http://127.0.0.1:4000/saude && echo " Serviço 24/7: OK"
