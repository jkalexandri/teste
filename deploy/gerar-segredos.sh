#!/usr/bin/env bash
# Mostra segredos novos para colar no .env (rode uma vez). NÃO troque WORKER_TOKEN nem CHAVE_CRIPTO que já existem:
# a CHAVE_CRIPTO nova obrigaria a ler o QR Code de novo e apagaria as chaves da IA salvas.
set -euo pipefail
echo "CRON_SECRET=$(openssl rand -hex 32)"
echo "SENHA_BANCO=$(openssl rand -hex 24)"
echo "MONITOR_TOKEN=$(openssl rand -hex 24)"
cd /opt/filapro/app/apps/worker && node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)"
