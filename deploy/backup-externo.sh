#!/usr/bin/env bash
# Cópia do backup FORA da VPS, no Backblaze B2 (decisão #173 — Módulo 12, P0-3).
# Uso: backup-externo.sh                  (cron 03:50) envia diarios/, semanais/ e mensais/ — criptografado na VPS, SEM apagar nada no B2
#      backup-externo.sh --conferir       confere a configuração e o destino (não envia)
#      backup-externo.sh --listar         lista o que há no B2 (nomes já decifrados)
#      backup-externo.sh --baixar [--pasta diarios|semanais|mensais] [--destino DIR]
#                                         baixa o backup MAIS RECENTE (banco, arquivos e chaves da mesma data) e confere. Padrão: backups/recuperado
# Como funciona: rclone copy (nunca sync) com --immutable (recusa sobrescrever um arquivo já enviado); depois cryptcheck compara o que ficou no B2
# com o que está na VPS (hash), sem baixar tudo. A retenção no B2 é das regras de ciclo de vida do bucket (a VPS não apaga nada lá).
# Resultado em backups/estado-externo.json (base do aviso do vigia). Nenhuma saída traz chave ou senha.
set -uo pipefail
umask 077
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
PASTA="${FILAPRO_BACKUPS:-$RAIZ/backups}"
CONF="${FILAPRO_RCLONE_CONF:-/root/.config/rclone/filapro-b2.conf}"
LOCK="${FILAPRO_LOCK:-/var/lock/filapro-backup.lock}"
ESPERA="${FILAPRO_LOCK_ESPERA:-300}"
AGORA="${FILAPRO_AGORA:-$(date '+%Y-%m-%d %H:%M')}"
ESTADO="$PASTA/estado-externo.json"
REMOTO="filapro-cripto"
FLAGS=(--retries 3 --low-level-retries 5 --transfers 2 --checkers 4)
R() { nice -n 10 rclone --config "$CONF" "$@"; }
sem_aspas() { echo "$1" | tr -d '"\\' | tr '\n' ' '; }

MODO="enviar"; PASTA_BAIXAR="diarios"; DESTINO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --conferir) MODO="conferir" ;; --listar) MODO="listar" ;; --baixar) MODO="baixar" ;;
    --pasta) PASTA_BAIXAR="${2:-}"; shift ;; --destino) DESTINO="${2:-}"; shift ;;
    --ajuda|-h) sed -n 2,11p "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $1 (use --ajuda)"; exit 2 ;;
  esac; shift
done

command -v rclone >/dev/null 2>&1 || { echo "ERRO: o rclone não está instalado (rode: bash deploy/backup-externo-config.sh)."; exit 1; }
[ -f "$CONF" ] || { echo "ERRO: a cópia externa não está configurada (rode: bash deploy/backup-externo-config.sh)."; exit 1; }
case "$PASTA_BAIXAR" in diarios|semanais|mensais) ;; *) echo "ERRO: --pasta deve ser diarios, semanais ou mensais."; exit 2 ;; esac

# ---------------------------------------------------------------- Conferir / listar
if [ "$MODO" = "conferir" ]; then
  [ "$(stat -c %a "$CONF")" = 600 ] && echo "OK: configuração com permissão 600." || { echo "ATENÇÃO: configuração com permissão diferente de 600 (chmod 600 $CONF)."; exit 1; }
  if R lsf "$REMOTO:" "${FLAGS[@]}" >/dev/null 2>&1; then echo "OK: o destino responde."; else echo "FALHA: o destino não respondeu (chave recusada, sem internet ou bucket removido)."; exit 1; fi
  [ -f "$ESTADO" ] && echo "Último envio: $(grep -o '"quando":"[^"]*"' "$ESTADO" | cut -d'"' -f4) — $(grep -q '"ok":true' "$ESTADO" && echo sucesso || echo COM PROBLEMAS)" || echo "Ainda não houve envio."
  exit 0
fi
if [ "$MODO" = "listar" ]; then
  for p in diarios semanais mensais; do echo "== $p =="; R lsl "$REMOTO:$p" "${FLAGS[@]}" 2>&1 | sort -k2,3 | tail -n 15 | awk '{print $1, $2, $3, $4}'; done
  exit 0
fi

# ---------------------------------------------------------------- Baixar o mais recente (desastre / ensaio)
if [ "$MODO" = "baixar" ]; then
  DESTINO="${DESTINO:-$PASTA/recuperado}"; mkdir -p "$DESTINO"; chmod 700 "$DESTINO"
  ULT="$(R lsf "$REMOTO:$PASTA_BAIXAR" --include 'banco-*.sql.gz' "${FLAGS[@]}" 2>/dev/null | sort -r | head -1)"
  [ -n "$ULT" ] || { echo "ERRO: não encontrei nenhum backup do banco em $PASTA_BAIXAR no B2 (senhas de criptografia erradas, chave sem leitura ou ainda sem envio)."; exit 1; }
  DATA="$(echo "$ULT" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}' | head -1)"
  echo "Backup mais recente em $PASTA_BAIXAR: $DATA"
  R copy "$REMOTO:$PASTA_BAIXAR" "$DESTINO" --include "*-$DATA.*" "${FLAGS[@]}" 2>&1 | tail -3
  BANCO="$DESTINO/banco-$DATA.sql.gz"
  [ -f "$BANCO" ] || { echo "ERRO: o download não trouxe o banco."; exit 1; }
  gunzip -t "$BANCO" 2>/dev/null || { echo "ERRO: o banco baixado está corrompido (não abre)."; exit 1; }
  echo "Banco baixado e conferido (abre): $BANCO ($(du -h "$BANCO" | cut -f1))"
  [ -f "$DESTINO/arquivos-$DATA.tar.gz" ] && { tar -tzf "$DESTINO/arquivos-$DATA.tar.gz" >/dev/null 2>&1 && echo "Arquivos enviados baixados e conferidos." || echo "ATENÇÃO: o pacote de arquivos baixado não abre."; }
  [ -f "$DESTINO/chaves-$DATA.tar.gz.enc" ] && echo "Pacote de chaves (criptografado) baixado."
  echo "Para restaurar:  bash $(dirname "$0")/restaurar-backup.sh $BANCO --arquivos --chaves"
  exit 0
fi

# ---------------------------------------------------------------- Enviar
exec 9>"$LOCK" || { echo "Não foi possível criar o bloqueio $LOCK"; exit 1; }
flock -w "$ESPERA" 9 || { echo "Há um backup ou restauração rodando há mais de ${ESPERA}s: o envio externo foi ignorado."; exit 0; }
mkdir -p "$PASTA"; chmod 700 "$PASTA" 2>/dev/null || true
ERROS=(); ENVIADOS=0; CONFERIDOS=0
erro() { ERROS+=("$1"); echo "ERRO: $1"; }
LOGTMP="$(mktemp)"; trap 'rm -f "$LOGTMP"' EXIT

for p in diarios semanais mensais; do
  [ -d "$PASTA/$p" ] || continue
  ls "$PASTA/$p"/* >/dev/null 2>&1 || continue
  echo "==> $p"
  if R copy "$PASTA/$p" "$REMOTO:$p" --immutable --exclude '*.tmp' --log-level INFO "${FLAGS[@]}" > "$LOGTMP" 2>&1; then
    N="$(grep -c 'Copied (new)' "$LOGTMP")"; ENVIADOS=$((ENVIADOS + N)); echo "$p: $N arquivo(s) novo(s) enviado(s)."
    if R cryptcheck "$PASTA/$p" "$REMOTO:$p" --one-way --exclude '*.tmp' "${FLAGS[@]}" > "$LOGTMP" 2>&1; then
      CONFERIDOS=$((CONFERIDOS + 1)); echo "$p: conferido (o que está no B2 bate com a VPS)."
    else
      erro "$p: a conferência no B2 FALHOU (arquivo diferente ou ausente no destino): $(grep -iE 'error|differ|missing|not found' "$LOGTMP" | head -2 | cut -c1-160 | tr '\n' ' ')"
    fi
  else
    erro "$p: o envio falhou: $(grep -iE 'error|failed|forbidden|unauthorized|immutable' "$LOGTMP" | head -2 | cut -c1-160 | tr '\n' ' ')"
  fi
done
[ "$CONFERIDOS" -ge 1 ] || [ "${#ERROS[@]}" -gt 0 ] || erro "não há nenhum backup em $PASTA para enviar"

OKJ=true; [ "${#ERROS[@]}" -gt 0 ] && OKJ=false
printf '{"quando":"%s","ok":%s,"enviados":%s,"pastas_conferidas":%s,"erros":"%s"}\n' \
  "$(date -d "$AGORA" '+%Y-%m-%dT%H:%M:%S')" "$OKJ" "$ENVIADOS" "$CONFERIDOS" "$(sem_aspas "${ERROS[*]:-}")" > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
if $OKJ; then echo "Backup externo concluído: $ENVIADOS arquivo(s) novo(s), $CONFERIDOS pasta(s) conferida(s)."; exit 0; fi
echo "Backup externo terminou COM PROBLEMAS (${#ERROS[@]})."; exit 1
