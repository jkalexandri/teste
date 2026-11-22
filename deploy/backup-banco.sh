#!/usr/bin/env bash
# Backup diário do banco (decisão #99): guarda 14 dias em /opt/filapro/backups.
# Agendado no cron da VPS (ver docs/publicacao-vps.md).
set -euo pipefail
PASTA=/opt/filapro/backups
mkdir -p "$PASTA"
ARQ="$PASTA/filapro-$(date +%Y-%m-%d_%H%M).sql.gz"
sudo -u postgres pg_dump --no-owner filaproleads | gzip -9 > "$ARQ"
find "$PASTA" -name 'filapro-*.sql.gz' -mtime +14 -delete
echo "Backup salvo: $ARQ ($(du -h "$ARQ" | cut -f1))"
