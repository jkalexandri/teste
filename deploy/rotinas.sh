#!/usr/bin/env bash
# Rotinas diárias do site (antes era o Vercel Cron): avisos de renovação (decisão #42).
set -euo pipefail
SEGREDO=$(grep '^CRON_SECRET=' /opt/filapro/app/apps/web/.env.production | cut -d= -f2- | tr -d '"')
curl -fsS -H "Authorization: Bearer $SEGREDO" http://127.0.0.1:3000/api/cron/renovacao
