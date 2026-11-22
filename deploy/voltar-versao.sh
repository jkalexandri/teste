#!/usr/bin/env bash
# Volta o FilaPro Leads para a versão anterior à última atualização (decisão #100).
# Se a atualização mudou o banco, restaura o backup feito antes dela (os dados gravados depois se perdem — confirma antes).
set -euo pipefail
cd /opt/filapro/app
[ -f /opt/filapro/versao-anterior ] || { echo "Não há versão anterior registrada."; exit 1; }
ALVO=$(cat /opt/filapro/versao-anterior)
ATUAL=$(node -p "require('./package.json').version")
echo "Versão atual: v$ATUAL. Voltar para o código de $(git log -1 --format='%cd' --date=short "$ALVO")."
read -r -p "Restaurar também o banco do backup de antes da atualização? (s/N) " BANCO
# Clientes bloqueados enquanto volta (decisão #103)
bash deploy/manutencao.sh ligar || true
git checkout --detach "$ALVO"
pnpm install --frozen-lockfile
if [ "${BANCO,,}" = "s" ]; then
  ARQ=$(cat /opt/filapro/backup-antes-da-atualizacao)
  echo "==> Restaurando $ARQ"
  pm2 stop filapro-web filapro-worker
  sudo -u postgres dropdb filaproleads
  sudo -u postgres createdb -O filaproleads filaproleads
  gunzip -c "$ARQ" | sudo -u postgres psql -q filaproleads
  sudo -u postgres psql -q filaproleads -c "REASSIGN OWNED BY postgres TO filaproleads;"
fi
pnpm --filter web build
pm2 restart filapro-web filapro-worker --update-env
pm2 save
sleep 5
# A versão antiga pode não ter o modo manutenção: desliga direto no banco
sudo -u postgres psql -qtA filaproleads -c "update \"Manutencao\" set ligada=false, desde=null" >/dev/null 2>&1 || true
echo "Sistema liberado."
echo "Voltou para a versão v$(node -p "require('./package.json').version"). Para voltar a atualizar depois: git checkout main && bash deploy/atualizar.sh"
