#!/usr/bin/env bash
# Backup completo (decisão #169 — Passo 0): banco + arquivos enviados + chaves do sistema (criptografadas), em camadas.
# Uso: backup-completo.sh [completo|banco]
#   completo (padrão, cron das 3h30): banco, arquivos e chaves em /opt/filapro/backups/diarios, mais cópias semanais (domingo) e mensais (dia 1).
#   banco    (cron das 9h30, 15h30 e 21h30): só o banco, em /opt/filapro/backups/6h — a perda máxima cai de 24 h para 6 h.
# Retenção: 14 diários, 8 semanais, 6 mensais e 12 dumps de 6 h. Pasta 700, arquivos 600. Nada é apagado se a etapa correspondente falhou.
# Cada peça é CONFERIDA e o resultado fica em estado-completo.json / estado-banco.json (para os avisos de backup parado).
# A senha das chaves vem de /root/.filapro-backup-senha (crie com backup-senha.sh) e nunca é impressa.
set -uo pipefail
umask 077
MODO="${1:-completo}"
case "$MODO" in completo|banco) ;; *) echo "Uso: $0 [completo|banco]"; exit 2 ;; esac
DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
BANCO="${FILAPRO_BANCO:-filaproleads}"
PASTA="${FILAPRO_BACKUPS:-$RAIZ/backups}"
ENV_WEB="$RAIZ/app/apps/web/.env.production"
ENV_WORKER="$RAIZ/app/apps/worker/.env"
SENHA_ARQ="${FILAPRO_SENHA_ARQ:-/root/.filapro-backup-senha}"
RET_D="${FILAPRO_RET_DIARIOS:-14}"; RET_S="${FILAPRO_RET_SEMANAIS:-8}"; RET_M="${FILAPRO_RET_MENSAIS:-6}"; RET_6H="${FILAPRO_RET_6H:-12}"
LOCK="${FILAPRO_LOCK:-/var/lock/filapro-backup.lock}"
AGORA="${FILAPRO_AGORA:-$(date '+%Y-%m-%d %H:%M')}"
DATA="$(date -d "$AGORA" +%Y-%m-%d_%H%M)"
DOW="$(date -d "$AGORA" +%u)"   # 7 = domingo
DOM="$(date -d "$AGORA" +%d)"
INICIO="$(date +%s)"

# Só uma execução por vez
exec 9>"$LOCK" || { echo "Não foi possível criar o bloqueio $LOCK"; exit 1; }
flock -n 9 || { echo "Já há um backup rodando: esta execução foi ignorada."; exit 0; }

mkdir -p "$PASTA"/{diarios,semanais,mensais,6h}
chmod 700 "$PASTA" "$PASTA"/{diarios,semanais,mensais,6h}

ERROS=()
erro() { ERROS+=("$1"); echo "ERRO: $1"; }
OK_BANCO=false; OK_ARQ=false; OK_CHAVES=false
BANCO_ARQ=""; ARQ_ARQ=""; CHAVES_ARQ=""; TABELAS=0; QTD_ARQ=0
ESTADO="$PASTA/estado-$MODO.json"
sem_aspas() { echo "$1" | tr -d '"\\' | tr '\n' ' '; }

# ---------------------------------------------------------------- Espaço livre
ARQUIVOS_DIR="$(grep -E '^PASTA_ARQUIVOS=' "$ENV_WORKER" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
ARQUIVOS_DIR="${ARQUIVOS_DIR:-$RAIZ/arquivos}"
LIVRE_KB="$(df -Pk "$PASTA" | awk 'NR==2{print $4}')"
ULT="$(ls -1 "$PASTA"/diarios/banco-*.sql.gz 2>/dev/null | sort -r | head -1)"
BASE_KB=0; [ -n "$ULT" ] && BASE_KB=$(( $(stat -c %s "$ULT") / 1024 ))
ARQ_KB=0; [ -d "$ARQUIVOS_DIR" ] && ARQ_KB="$(du -sk "$ARQUIVOS_DIR" 2>/dev/null | cut -f1)"
NEC_KB=$(( 3 * (BASE_KB + ARQ_KB) )); MIN_KB="${FILAPRO_LIVRE_MIN_KB:-102400}"; [ "$NEC_KB" -lt "$MIN_KB" ] && NEC_KB="$MIN_KB"
ESPACO_OK=true
if [ "$LIVRE_KB" -lt "$NEC_KB" ]; then
  ESPACO_OK=false
  erro "espaço livre insuficiente: ${LIVRE_KB} KB livres, necessário ${NEC_KB} KB. Nenhum backup foi feito."
fi

podar() { # podar PASTA PADRÃO MANTER — apaga os mais antigos, mantendo os N mais recentes
  ls -1 "$1"/$2 2>/dev/null | sort -r | tail -n +$(( $3 + 1 )) | xargs -r rm -f
}
copiar_para() { # copiar_para DESTINO ARQUIVO... — link (sem gastar espaço) ou cópia
  local d="$1"; shift
  for f in "$@"; do [ -n "$f" ] && { ln "$f" "$d/" 2>/dev/null || cp -p "$f" "$d/"; }; done
}

# ---------------------------------------------------------------- Banco
if $ESPACO_OK; then
  if [ "$MODO" = "banco" ]; then DEST="$PASTA/6h"; else DEST="$PASTA/diarios"; fi
  SAIDA="$("$DIR/backup-banco.sh" "$DEST" banco 2>&1)"; RC=$?
  if [ "$RC" -eq 0 ]; then
    BANCO_ARQ="$(echo "$SAIDA" | sed -n 's/^Backup salvo: \(.*\.sql\.gz\) (.*/\1/p' | tail -1)"
    TABELAS="$(echo "$SAIDA" | sed -n 's/.*, \([0-9]*\) tabelas)$/\1/p' | tail -1)"
    OK_BANCO=true; echo "$SAIDA" | tail -1
  else
    erro "banco: $(echo "$SAIDA" | tail -1)"
  fi
fi

# ---------------------------------------------------------------- Arquivos enviados (só no completo)
if [ "$MODO" = "completo" ] && $ESPACO_OK; then
  if [ -d "$ARQUIVOS_DIR" ]; then
    ARQ_ARQ="$PASTA/diarios/arquivos-$DATA.tar.gz"; TMP="$ARQ_ARQ.tmp"
    if tar -czf "$TMP" -C "$(dirname "$ARQUIVOS_DIR")" "$(basename "$ARQUIVOS_DIR")" 2>/dev/null && tar -tzf "$TMP" >/dev/null 2>&1; then
      mv "$TMP" "$ARQ_ARQ"; OK_ARQ=true
      QTD_ARQ="$(tar -tzf "$ARQ_ARQ" | grep -vc '/$')"
      echo "Arquivos salvos: $ARQ_ARQ ($(du -h "$ARQ_ARQ" | cut -f1), $QTD_ARQ arquivo(s))"
      [ "$(stat -c %s "$ARQ_ARQ")" -gt $((2*1024*1024*1024)) ] && echo "ATENÇÃO: o pacote de arquivos passou de 2 GB: está na hora de rever a estratégia de cópia dos arquivos."
    else
      rm -f "$TMP"; ARQ_ARQ=""; erro "arquivos: não foi possível empacotar $ARQUIVOS_DIR"
    fi
  else
    erro "arquivos: a pasta $ARQUIVOS_DIR não existe"
  fi
fi

# ---------------------------------------------------------------- Chaves (só no completo): criptografadas com a senha do backup
if [ "$MODO" = "completo" ] && $ESPACO_OK; then
  if [ ! -r "$SENHA_ARQ" ]; then
    erro "chaves: a senha do backup não está configurada (rode: bash $DIR/backup-senha.sh)"
  elif [ ! -f "$ENV_WEB" ] || [ ! -f "$ENV_WORKER" ]; then
    erro "chaves: faltam os arquivos .env"
  else
    CHAVES_ARQ="$PASTA/diarios/chaves-$DATA.tar.gz.enc"; TMP="$CHAVES_ARQ.tmp"
    if tar -czf - -C "$RAIZ/app/apps" web/.env.production worker/.env 2>/dev/null \
        | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:$SENHA_ARQ" -out "$TMP" 2>/dev/null \
        && [ "$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$SENHA_ARQ" -in "$TMP" 2>/dev/null | tar -tz 2>/dev/null | grep -c 'env')" -eq 2 ]; then
      mv "$TMP" "$CHAVES_ARQ"; OK_CHAVES=true
      echo "Chaves salvas (criptografadas): $CHAVES_ARQ ($(du -h "$CHAVES_ARQ" | cut -f1))"
    else
      rm -f "$TMP"; CHAVES_ARQ=""; erro "chaves: não foi possível criptografar e conferir o pacote"
    fi
  fi
fi

# ---------------------------------------------------------------- Camadas e retenção (só podam o tipo que deu certo agora)
if [ "$MODO" = "banco" ]; then
  $OK_BANCO && podar "$PASTA/6h" 'banco-*.sql.gz' "$RET_6H"
else
  if [ "$DOW" = "7" ]; then copiar_para "$PASTA/semanais" "$BANCO_ARQ" "$ARQ_ARQ" "$CHAVES_ARQ"; fi
  if [ "$DOM" = "01" ]; then copiar_para "$PASTA/mensais" "$BANCO_ARQ" "$ARQ_ARQ" "$CHAVES_ARQ"; fi
  if $OK_BANCO; then podar "$PASTA/diarios" 'banco-*.sql.gz' "$RET_D"; podar "$PASTA/semanais" 'banco-*.sql.gz' "$RET_S"; podar "$PASTA/mensais" 'banco-*.sql.gz' "$RET_M"; fi
  if $OK_ARQ; then podar "$PASTA/diarios" 'arquivos-*.tar.gz' "$RET_D"; podar "$PASTA/semanais" 'arquivos-*.tar.gz' "$RET_S"; podar "$PASTA/mensais" 'arquivos-*.tar.gz' "$RET_M"; fi
  if $OK_CHAVES; then podar "$PASTA/diarios" 'chaves-*.tar.gz.enc' "$RET_D"; podar "$PASTA/semanais" 'chaves-*.tar.gz.enc' "$RET_S"; podar "$PASTA/mensais" 'chaves-*.tar.gz.enc' "$RET_M"; fi
fi

# ---------------------------------------------------------------- Estado (lido pelos avisos de backup parado)
if [ "$MODO" = "banco" ]; then TUDO_OK=$OK_BANCO; else TUDO_OK=false; $OK_BANCO && $OK_ARQ && $OK_CHAVES && TUDO_OK=true; fi
FIM="$(date +%s)"
TMPE="$ESTADO.tmp"
{
  printf '{"modo":"%s","quando":"%s","duracao_s":%s,"ok":%s,' "$MODO" "$(date -d "$AGORA" '+%Y-%m-%dT%H:%M:00%z')" "$(( FIM - INICIO ))" "$TUDO_OK"
  printf '"banco":{"ok":%s,"arquivo":"%s","tabelas":%s},' "$OK_BANCO" "$(basename "${BANCO_ARQ:-}")" "${TABELAS:-0}"
  printf '"arquivos":{"ok":%s,"arquivo":"%s","qtd":%s},' "$OK_ARQ" "$(basename "${ARQ_ARQ:-}")" "${QTD_ARQ:-0}"
  printf '"chaves":{"ok":%s,"arquivo":"%s"},' "$OK_CHAVES" "$(basename "${CHAVES_ARQ:-}")"
  printf '"erros":"%s"}\n' "$(sem_aspas "${ERROS[*]:-}")"
} > "$TMPE" && mv "$TMPE" "$ESTADO"

if $TUDO_OK; then echo "Backup $MODO concluído com sucesso em $(( FIM - INICIO ))s."; exit 0; fi
echo "Backup $MODO terminou COM PROBLEMAS (${#ERROS[@]}): veja as linhas ERRO acima."
exit 1
