#!/usr/bin/env bash
# Atualiza o FilaPro Leads na VPS (site + serviço 24/7) — decisões #99 e #100.
# Faz backup do banco antes, guarda a versão anterior (para voltar) e mostra a versão nova no final.
# Uso: bash /opt/filapro/app/deploy/atualizar.sh
set -euo pipefail
# Tudo dentro de main(): o bash lê o script inteiro antes, então o "git pull" pode trocar este arquivo sem problema
main() {
cd /opt/filapro/app
versao() { node -p "require('./package.json').version"; }
ANTES=$(versao)
echo "==> Versão atual: v$ANTES"

echo "==> Backup do banco antes de atualizar"
bash deploy/backup-banco.sh
ls -t /opt/filapro/backups/filapro-*.sql.gz | head -1 > /opt/filapro/backup-antes-da-atualizacao
git rev-parse HEAD > /opt/filapro/versao-anterior

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
curl -fsS http://127.0.0.1:4000/saude >/dev/null && echo "Serviço 24/7: OK"
echo
echo "Atualizado para a versão v$(versao) (antes: v$ANTES)"
}
main "$@"
