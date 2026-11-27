#!/usr/bin/env bash
# Rotação dos segredos de BAIXO impacto, com conferência e desfazer automático (decisão #175 — Módulo 12, O6). Rode como root.
# Uso: rotacionar-segredo.sh cron          troca o CRON_SECRET (site; os crons da VPS leem o arquivo na hora)
#      rotacionar-segredo.sh monitor       troca o MONITOR_TOKEN (depois: rotacionar-segredo.sh monitor --mostrar-url, e atualize o UptimeRobot)
#      rotacionar-segredo.sh worker-token  troca o WORKER_TOKEN nos DOIS .env (site e serviço 24/7 reiniciam; o WhatsApp reconecta sozinho)
#      rotacionar-segredo.sh banco         troca a senha do banco no PostgreSQL e nos DOIS .env
#      rotacionar-segredo.sh monitor --mostrar-url   mostra o endereço do monitor (UMA vez; sem print, sem chat)
# NÃO automatiza CHAVE_CRIPTO nem VAPID (impacto muito alto: veja docs/publicacao-vps.md 6.2f). O valor novo NUNCA é mostrado.
# Fluxo: guarda cópia dos .env -> troca -> reinicia -> CONFERE (o valor novo vale e o antigo não) -> se algo falhar, DESFAZ tudo e reinicia de novo.
set -uo pipefail
umask 077
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
WEB_ENV="$RAIZ/app/apps/web/.env.production"
WORKER_ENV="$RAIZ/app/apps/worker/.env"
PM2="${FILAPRO_PM2:-pm2}"
PSQL="${FILAPRO_PSQL:-sudo -u postgres psql}"
SITE="${FILAPRO_SITE_URL:-http://127.0.0.1:3000}"
WORKER="${FILAPRO_WORKER_URL:-http://127.0.0.1:4000}"
DOMINIO="${FILAPRO_DOMINIO:-filaproleads.com.br}"
ESPERA="${FILAPRO_ROTACAO_ESPERA:-8}"
LOCK="${FILAPRO_ROTACAO_LOCK:-/var/lock/filapro-rotacao.lock}"
QUAL="${1:-}"; EXTRA="${2:-}"

valor() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
http() { curl -s -o /dev/null -w '%{http_code}' -m 10 "$@" 2>/dev/null; }
trocar_linha() { # trocar_linha ARQUIVO VAR VALOR — troca (ou acrescenta) VAR="VALOR" preservando dono e permissão
  local f="$1" v="$2" n="$3" tmp; tmp="$(mktemp "$f.XXXXXX")"
  if grep -qE "^$v=" "$f"; then awk -v v="$v" -v n="$n" 'BEGIN{FS=OFS="="} $1==v && !feito {print v"=\""n"\""; feito=1; next} {print}' "$f" > "$tmp"
  else { cat "$f"; echo "$v=\"$n\""; } > "$tmp"; fi
  chmod --reference="$f" "$tmp"; chown --reference="$f" "$tmp" 2>/dev/null; mv "$tmp" "$f"
}
reiniciar() { # reiniciar web|worker|ambos
  case "$1" in web) $PM2 restart filapro-web --update-env >/dev/null 2>&1 ;; worker) $PM2 restart filapro-worker --update-env >/dev/null 2>&1 ;; *) $PM2 restart filapro-web filapro-worker --update-env >/dev/null 2>&1 ;; esac
  sleep "$ESPERA"
}

if [ "$QUAL" = "monitor" ] && [ "$EXTRA" = "--mostrar-url" ]; then
  T="$(valor "$WEB_ENV" MONITOR_TOKEN)"; [ -n "$T" ] || { echo "MONITOR_TOKEN não está definido no .env do site."; exit 1; }
  echo "https://$DOMINIO/api/monitor?t=$T"; echo "(Cole no UptimeRobot. Não tire print e não cole no chat. Depois rode:  clear)"; exit 0
fi
case "$QUAL" in cron|monitor|worker-token|banco) ;; *) sed -n 2,10p "$0"; exit 2 ;; esac
[ "$(id -u)" = "0" ] || { echo "Rode como root (sudo bash $0 $QUAL)."; exit 1; }
[ -f "$WEB_ENV" ] || { echo "ERRO: $WEB_ENV não existe."; exit 1; }
if [ "$QUAL" = "worker-token" ] || [ "$QUAL" = "banco" ]; then [ -f "$WORKER_ENV" ] || { echo "ERRO: $WORKER_ENV não existe."; exit 1; }; fi
exec 9>"$LOCK" || exit 1; flock -n 9 || { echo "Já há uma rotação em andamento."; exit 1; }

BK="$(mktemp -d)"; chmod 700 "$BK"; trap 'rm -rf "$BK"' EXIT
cp -p "$WEB_ENV" "$BK/web.env"; [ -f "$WORKER_ENV" ] && cp -p "$WORKER_ENV" "$BK/worker.env"
desfazer() { # restaura os .env (e a senha do banco) e reinicia
  cp -p "$BK/web.env" "$WEB_ENV"; [ -f "$BK/worker.env" ] && cp -p "$BK/worker.env" "$WORKER_ENV"
  if [ "$QUAL" = "banco" ] && [ -n "${SENHA_ANTIGA:-}" ]; then echo "ALTER USER \"$USUARIO\" PASSWORD '$SENHA_ANTIGA';" | $PSQL -q -d postgres >/dev/null 2>&1; fi
  reiniciar ambos; echo "DESFEITO: os arquivos .env e a senha anteriores foram restaurados e o sistema reiniciado."
}
falhou() { echo "ERRO: $1"; desfazer; exit 1; }

case "$QUAL" in
  cron)
    ANT="$(valor "$WEB_ENV" CRON_SECRET)"; [ -n "$ANT" ] || falhou "CRON_SECRET não encontrado no .env do site."
    NOVO="$(openssl rand -hex 32)"; trocar_linha "$WEB_ENV" CRON_SECRET "$NOVO"; reiniciar web
    [ "$(http -H "Authorization: Bearer $NOVO" "$SITE/api/cron/servico")" = "200" ] || falhou "o site não aceitou o CRON_SECRET novo."
    [ "$(http -H "Authorization: Bearer $ANT" "$SITE/api/cron/servico")" = "401" ] || falhou "o site ainda aceita o CRON_SECRET antigo."
    echo "CRON_SECRET trocado e conferido: o novo vale, o antigo foi recusado. Os crons da VPS já usam o novo (leem o arquivo a cada execução)." ;;
  monitor)
    ANT="$(valor "$WEB_ENV" MONITOR_TOKEN)"
    NOVO="$(openssl rand -hex 24)"; trocar_linha "$WEB_ENV" MONITOR_TOKEN "$NOVO"; reiniciar web
    CN="$(http "$SITE/api/monitor?t=$NOVO")"; { [ "$CN" = "200" ] || [ "$CN" = "503" ]; } || falhou "o site não reconheceu o MONITOR_TOKEN novo (respondeu $CN)."
    if [ -n "$ANT" ]; then [ "$(http "$SITE/api/monitor?t=$ANT")" = "404" ] || falhou "o site ainda aceita o MONITOR_TOKEN antigo."; fi
    echo "MONITOR_TOKEN trocado e conferido. AGORA atualize o endereço no UptimeRobot: rode  bash $0 monitor --mostrar-url  (o monitor antigo vai ficar vermelho até lá)." ;;
  worker-token)
    ANT="$(valor "$WORKER_ENV" WORKER_TOKEN)"; [ -n "$ANT" ] || falhou "WORKER_TOKEN não encontrado no .env do serviço."
    NOVO="$(openssl rand -hex 32)"; trocar_linha "$WEB_ENV" WORKER_TOKEN "$NOVO"; trocar_linha "$WORKER_ENV" WORKER_TOKEN "$NOVO"; reiniciar ambos
    [ "$(http -H "Authorization: Bearer $NOVO" "$WORKER/arquivos/rotacao-teste")" = "404" ] || falhou "o serviço 24/7 não aceitou o WORKER_TOKEN novo."
    [ "$(http -H "Authorization: Bearer $ANT" "$WORKER/arquivos/rotacao-teste")" = "401" ] || falhou "o serviço 24/7 ainda aceita o WORKER_TOKEN antigo."
    [ "$(http "$WORKER/saude")" = "200" ] || falhou "o serviço 24/7 não respondeu em /saude."
    echo "WORKER_TOKEN trocado nos dois .env e conferido. O WhatsApp reconecta sozinho em alguns minutos (confira na tela WhatsApp)." ;;
  banco)
    URL_ANT="$(valor "$WORKER_ENV" DATABASE_URL)"; [ -n "$URL_ANT" ] || falhou "DATABASE_URL não encontrada no .env do serviço."
    USUARIO="$(echo "$URL_ANT" | sed -E 's#^[a-z]+://([^:@/]+):.*#\1#')"; SENHA_ANTIGA="$(echo "$URL_ANT" | sed -E 's#^[a-z]+://[^:@/]+:([^@/]*)@.*#\1#')"
    [[ "$USUARIO" =~ ^[A-Za-z0-9_]+$ ]] || falhou "usuário do banco com formato inesperado."
    NOVO="$(openssl rand -hex 24)"
    echo "ALTER USER \"$USUARIO\" PASSWORD '$NOVO';" | $PSQL -q -v ON_ERROR_STOP=1 -d postgres >/dev/null 2>&1 || falhou "o PostgreSQL recusou a troca da senha (nada foi alterado nos .env)."
    for f in "$WEB_ENV" "$WORKER_ENV"; do
      U="$(valor "$f" DATABASE_URL)"; [ -n "$U" ] || falhou "DATABASE_URL não encontrada em $f."
      trocar_linha "$f" DATABASE_URL "$(echo "$U" | sed -E "s#^([a-z]+://[^:@/]+:)[^@/]*(@.*)#\\1$NOVO\\2#")"
    done
    reiniciar ambos
    [ "$(http "$SITE/login")" = "200" ] || falhou "o site não voltou com a senha nova do banco."
    [ "$(http "$WORKER/saude")" = "200" ] || falhou "o serviço 24/7 não voltou com a senha nova do banco."
    echo "Senha do banco trocada no PostgreSQL e nos dois .env, e o site e o serviço 24/7 voltaram. (Os backups do banco não dependem dessa senha.)" ;;
esac
