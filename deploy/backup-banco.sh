#!/usr/bin/env bash
# Backup do banco (decisões #99 e #169).
# Uso: backup-banco.sh [PASTA_DESTINO] [PREFIXO]
#   Sem argumentos (chamada do atualizar.sh): salva em /opt/filapro/backups como filapro-AAAA-MM-DD_HHMM.sql.gz e guarda os 10 mais recentes.
#   Com argumentos (chamada do backup-completo.sh): salva na pasta e com o prefixo indicados; quem chama cuida da retenção.
# O arquivo nasce protegido (só o root lê), é gravado com nome temporário e só vira backup depois de CONFERIDO:
# abre (gunzip -t), tem tamanho plausível e tem tabelas. Nunca existe um backup "pela metade".
set -euo pipefail
umask 077
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
BANCO="${FILAPRO_BANCO:-filaproleads}"
PASTA="${FILAPRO_BACKUPS:-$RAIZ/backups}"
DESTINO="${1:-$PASTA}"
PREFIXO="${2:-filapro}"
MIN_BYTES="${FILAPRO_MIN_BYTES:-10240}"
# Comando do pg_dump (nos testes, aponta para o banco de teste)
DUMP="${FILAPRO_PGDUMP:-sudo -u postgres pg_dump}"
mkdir -p "$PASTA" "$DESTINO"
chmod 700 "$PASTA" "$DESTINO"
AGORA="${FILAPRO_AGORA:-$(date '+%Y-%m-%d %H:%M')}"
ARQ="$DESTINO/$PREFIXO-$(date -d "$AGORA" +%Y-%m-%d_%H%M).sql.gz"
TMP="$ARQ.tmp"
trap 'rm -f "$TMP"' EXIT

# shellcheck disable=SC2086
if ! $DUMP --no-owner "$BANCO" | gzip -9 > "$TMP"; then
  echo "ERRO: o pg_dump falhou (banco '$BANCO'): o banco está parado ou sem permissão. Nada foi guardado."; exit 1
fi
gunzip -t "$TMP" || { echo "ERRO: o backup gerado não abre (arquivo corrompido). Nada foi guardado."; exit 1; }
TAM=$(stat -c %s "$TMP")
[ "$TAM" -ge "$MIN_BYTES" ] || { echo "ERRO: o backup gerado tem só $TAM bytes (esperado pelo menos $MIN_BYTES). Nada foi guardado."; exit 1; }
TAB=$(gunzip -c "$TMP" | grep -c '^CREATE TABLE public\.' || true)
[ "$TAB" -ge 1 ] || { echo "ERRO: o backup gerado não tem nenhuma tabela. Nada foi guardado."; exit 1; }
mv "$TMP" "$ARQ"

# Chamada do atualizar.sh (sem argumentos): guarda os 10 mais recentes
if [ -z "${1:-}" ]; then
  ls -1 "$DESTINO"/filapro-*.sql.gz 2>/dev/null | sort -r | tail -n +11 | xargs -r rm -f
fi
echo "Backup salvo: $ARQ ($(du -h "$ARQ" | cut -f1), $TAB tabelas)"
