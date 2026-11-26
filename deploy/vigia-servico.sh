#!/usr/bin/env bash
# Vigia do serviço 24/7 (decisão #151): roda a cada 5 minutos e pede ao site para conferir se o serviço está no ar.
# Se ficar mais de 3 minutos sem sinal, o site avisa os Super Admins por e-mail (um e-mail por queda e outro quando volta).
set -euo pipefail
SEGREDO=$(grep '^CRON_SECRET=' /opt/filapro/app/apps/web/.env.production | cut -d= -f2- | tr -d '"')
curl -fsS -m 30 -H "Authorization: Bearer $SEGREDO" http://127.0.0.1:3000/api/cron/servico
echo
