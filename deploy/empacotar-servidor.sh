#!/usr/bin/env bash
# Mudar de servidor (Manual do Desenvolvedor): junta num arquivo só o backup do banco, os dois .env e os arquivos.
set -euo pipefail
DATA=$(date +%Y-%m-%d_%H%M)
TMP=$(mktemp -d)
sudo -u postgres pg_dump --no-owner filaproleads | gzip -9 > "$TMP/banco.sql.gz"
cp /opt/filapro/app/apps/web/.env.production "$TMP/web.env.production"
cp /opt/filapro/app/apps/worker/.env "$TMP/worker.env"
tar -czf "$TMP/arquivos.tar.gz" -C /opt/filapro arquivos 2>/dev/null || true
SAIDA=/opt/filapro/mudanca-$DATA.tar.gz
tar -czf "$SAIDA" -C "$TMP" .
rm -rf "$TMP"
chmod 600 "$SAIDA"
echo "Pacote pronto: $SAIDA ($(du -h "$SAIDA" | cut -f1))"
echo "ATENÇÃO: ele contém as chaves do sistema. Copie direto para o servidor novo e apague as cópias depois."
