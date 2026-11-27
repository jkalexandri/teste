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
# Restauração segura (decisão #170): o backup é CONFERIDO (restaurado num banco temporário) ANTES de mexer no código e no banco.
# O script é copiado para fora do repositório porque o código antigo (git checkout) pode não ter esse arquivo.
RESTAURADOR=""
if [ "${BANCO,,}" = "s" ]; then
  ARQ=$(cat /opt/filapro/backup-antes-da-atualizacao)
  RESTAURADOR=$(mktemp /opt/filapro/restaurar-backup.XXXXXX.sh)
  cp deploy/restaurar-backup.sh "$RESTAURADOR"
  echo "==> Conferindo o backup $ARQ antes de qualquer mudança"
  bash "$RESTAURADOR" --so-testar "$ARQ" || { rm -f "$RESTAURADOR"; echo "O backup não passou na conferência: NADA foi alterado (código e banco continuam como estavam)."; exit 1; }
fi
# Clientes bloqueados enquanto volta (decisão #103)
bash deploy/manutencao.sh ligar || true
git checkout --detach "$ALVO"
pnpm install --frozen-lockfile
if [ "${BANCO,,}" = "s" ]; then
  echo "==> Restaurando $ARQ (o banco atual fica guardado, nada é apagado)"
  bash "$RESTAURADOR" --confirmado --sem-reiniciar --sem-migrar "$ARQ" || { rm -f "$RESTAURADOR"; echo "A restauração falhou. O banco atual foi preservado. Veja a mensagem acima."; exit 1; }
  rm -f "$RESTAURADOR"
fi
# Tipos gerados de versões mais novas apontam para rotas que o código antigo não tem: apagar antes do build (como no atualizar.sh)
rm -rf apps/web/.next/types apps/web/.next-novo apps/web/.next-antigo/types
pnpm --filter web build
pm2 restart filapro-web filapro-worker --update-env
pm2 save
sleep 5
# A versão antiga pode não ter o modo manutenção: desliga direto no banco
sudo -u postgres psql -qtA filaproleads -c "update \"Manutencao\" set ligada=false, desde=null" >/dev/null 2>&1 || true
# A atualização que parou foi desfeita: a próxima começa do zero (novo ponto de volta e novo backup)
rm -f /opt/filapro/atualizacao-em-andamento
echo "Sistema liberado."
echo "Voltou para a versão v$(node -p "require('./package.json').version"). Para voltar a atualizar depois: git checkout main && bash deploy/atualizar.sh"
