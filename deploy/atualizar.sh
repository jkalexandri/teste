#!/usr/bin/env bash
# Atualiza o FilaPro Leads na VPS (site + serviço 24/7) — decisões #99, #100 e #103.
# Faz backup do banco antes, guarda a versão anterior (para voltar), liga o modo manutenção durante a atualização
# e mostra a versão nova no final.
# Uso: bash /opt/filapro/app/deploy/atualizar.sh              (atualiza agora)
#      bash /opt/filapro/app/deploy/atualizar.sh --aviso 10   (avisa os usuários e espera 10 minutos antes)
set -euo pipefail
# Tudo dentro de main(): o bash lê o script inteiro antes, então o "git pull" pode trocar este arquivo sem problema
main() {
cd /opt/filapro/app
versao() { node -p "require('./package.json').version"; }
# Usa a cópia lida agora (o git pull pode trocar o arquivo)
manut() { bash -c "$MANUT" _ "$@"; }
MANUT=$(cat deploy/manutencao.sh 2>/dev/null || echo 'echo "(manutencao.sh ausente)"')
AVISO=0
if [ "${1:-}" = "--aviso" ]; then AVISO=${2:?informe os minutos}; fi
ANTES=$(versao)
echo "==> Versão atual: v$ANTES"

if [ "$AVISO" -gt 0 ]; then
  echo "==> Avisando os usuários ($AVISO min antes)"
  manut avisar "$AVISO" || echo "(não foi possível avisar; seguindo)"
fi

echo "==> Ligando o modo manutenção"
# Na primeira vez a tabela ainda não existe (vem nesta atualização): segue sem manutenção
manut ligar || echo "(modo manutenção ainda não disponível nesta versão)"
# Se algo falhar daqui para frente, o sistema continua em manutenção (seguro) até você resolver
trap 'echo; echo "ERRO na atualização. O sistema continua em MANUTENÇÃO (clientes bloqueados)."; echo "Volte a versão: bash deploy/voltar-versao.sh   ou libere: bash deploy/manutencao.sh desligar"' ERR

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
# Liga de novo (caso a tabela tenha acabado de ser criada pela migração)
bash deploy/manutencao.sh ligar
echo "==> Montando o site (em pasta separada: o site atual continua mostrando a tela de atualização)"
rm -rf apps/web/.next-novo
NEXT_DIST_DIR=.next-novo pnpm --filter web build
# O build reescreve este arquivo gerado com o nome da pasta: volta ao original para o próximo "git pull" não travar
git checkout -- apps/web/next-env.d.ts
echo "==> Trocando a versão e reiniciando site e serviço"
rm -rf apps/web/.next-antigo
[ -d apps/web/.next ] && mv apps/web/.next apps/web/.next-antigo
mv apps/web/.next-novo apps/web/.next
pm2 restart filapro-web filapro-worker --update-env
pm2 save
# Caddyfile mudou nesta versão? Aplica (HTTPS continua no ar)
# Trava (decisão #134): o Caddyfile fecha a API do serviço 24/7 para a internet; só aplica se o site já fala
# com o serviço por dentro da VPS. E só troca a configuração se a nova estiver válida.
if ! cmp -s deploy/Caddyfile /etc/caddy/Caddyfile; then
  case "${WORKER_URL:-}" in
    http://127.0.0.1:*|http://localhost:*)
      if caddy validate --config deploy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
        cp deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy && echo "Caddy: configuração atualizada"
      else
        echo "ATENÇÃO: o novo Caddyfile não passou na conferência; a configuração antiga continua. Avise o desenvolvedor."
      fi ;;
    *)
      echo "ATENÇÃO: Caddy NÃO atualizado — o site ainda usa WORKER_URL=${WORKER_URL:-(vazio)}."
      echo "  Troque para o endereço interno e rode a atualização de novo:"
      echo "  sed -i 's#^WORKER_URL=.*#WORKER_URL=\"http://127.0.0.1:4000\"#' /opt/filapro/app/apps/web/.env.production" ;;
  esac
fi
sleep 5
curl -fsS http://127.0.0.1:3000/login -o /dev/null && echo "Site: OK"
curl -fsS http://127.0.0.1:4000/saude >/dev/null && echo "Serviço 24/7: OK"
echo "==> Liberando o sistema"
bash deploy/manutencao.sh desligar
trap - ERR
echo
echo "Atualizado para a versão v$(versao) (antes: v$ANTES)"
}
main "$@"
