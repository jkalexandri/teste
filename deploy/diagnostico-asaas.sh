#!/bin/bash
# Diagnóstico do Asaas na VPS (decisão #115): versão, chave, webhook no Asaas e endereço do aviso.
# Não mostra a chave nem o token. Uso: bash /opt/filapro/app/deploy/diagnostico-asaas.sh
cd "$(dirname "$0")/../apps/worker" || exit 1
# Usa o mesmo banco e o mesmo segredo de criptografia do serviço 24/7
set -a; . ./.env; set +a
npx tsx scripts/diagnostico-asaas.ts
