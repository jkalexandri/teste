#!/usr/bin/env bash
# Rotação de logs (decisão #172 — Módulo 12, O4). Rode UMA vez como root (pode repetir: não duplica nada).
# Usa o logrotate do próprio Ubuntu (sem instalar o módulo pm2-logrotate):
#   /var/log/filapro-*.log  -> semanal (ou ao passar de 20 MB), guarda 8, compactados, permissão 600
#   ~/.pm2/logs/*.log       -> diário (ou ao passar de 50 MB), guarda 14, compactados, permissão 600, copytruncate (o pm2 mantém o arquivo aberto)
# E limita o journal do sistema (Caddy, SSH, fail2ban) a 200 MB e 1 mês.
# Uso: rotacao-logs.sh              instala/atualiza e confere
#      rotacao-logs.sh --conferir   só confere (não altera nada): sai com 1 se faltar algo ou a regra for inválida
set -euo pipefail
LOGROTATE_DIR="${FILAPRO_LOGROTATE_DIR:-/etc/logrotate.d}"
JOURNALD_DIR="${FILAPRO_JOURNALD_DIR:-/etc/systemd/journald.conf.d}"
LOG_DIR="${FILAPRO_LOG_DIR:-/var/log}"
PM2_LOGS="${FILAPRO_PM2_LOGS:-${HOME:-/root}/.pm2/logs}"
SEM_SERVICOS="${FILAPRO_SEM_SERVICOS:-}"        # nos testes: não mexe em systemd
CONF="$LOGROTATE_DIR/filapro"
JCONF="$JOURNALD_DIR/filapro.conf"
MODO="${1:-}"

[ "$(id -u)" = "0" ] || { echo "Rode como root (sudo bash $0)."; exit 1; }

conf_logrotate() {
  cat <<EOF
# FilaPro Leads — rotação de logs (decisão #172). Gerado por deploy/rotacao-logs.sh: não edite à mão (rode o script de novo).
$LOG_DIR/filapro-*.log {
    su root root
    weekly
    maxsize 20M
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    create 0600 root root
}
$PM2_LOGS/*.log {
    su root root
    daily
    maxsize 50M
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
}
conf_journald() {
  cat <<'EOF'
# FilaPro Leads — limite do journal do sistema (decisão #172). Gerado por deploy/rotacao-logs.sh.
[Journal]
SystemMaxUse=200M
RuntimeMaxUse=100M
MaxRetentionSec=1month
EOF
}

# Confere uma regra do logrotate sem aplicar nada (modo de simulação)
valida() { local est; est="$(mktemp)"; logrotate -d -s "$est" "$1" >/tmp/rotacao-logs-debug.$$ 2>&1; local rc=$?; rm -f "$est"; if [ $rc -ne 0 ] || grep -qiE '^error|unknown option|bad|failed' /tmp/rotacao-logs-debug.$$; then sed -n 1,8p /tmp/rotacao-logs-debug.$$ | cut -c1-200; rm -f /tmp/rotacao-logs-debug.$$; return 1; fi; rm -f /tmp/rotacao-logs-debug.$$; return 0; }

if [ "$MODO" = "--conferir" ]; then
  RC=0
  command -v logrotate >/dev/null 2>&1 || { echo "FALTA: o programa logrotate não está instalado."; exit 1; }
  if [ -f "$CONF" ] && [ "$(conf_logrotate)" = "$(cat "$CONF")" ]; then
    if valida "$CONF"; then echo "OK: regra de rotação ($CONF) presente e válida."; else echo "FALHA: a regra de rotação existe, mas o logrotate a recusou."; RC=1; fi
  else echo "FALTA: regra de rotação ausente ou diferente do esperado (rode: bash $0)."; RC=1; fi
  if [ -f "$JCONF" ] && [ "$(conf_journald)" = "$(cat "$JCONF")" ]; then echo "OK: journal limitado a 200 MB e 1 mês."; else echo "FALTA: limite do journal ausente (rode: bash $0)."; RC=1; fi
  exit $RC
fi

echo "==> Conferindo o logrotate"
if ! command -v logrotate >/dev/null 2>&1; then
  [ -z "$SEM_SERVICOS" ] || { echo "ERRO: logrotate não instalado."; exit 1; }
  apt-get install -y logrotate >/dev/null 2>&1 || { echo "ERRO: não consegui instalar o logrotate (apt-get install logrotate)."; exit 1; }
fi
echo "logrotate: $(logrotate --version 2>&1 | head -1)"

mkdir -p "$LOGROTATE_DIR" "$JOURNALD_DIR"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT
conf_logrotate > "$TMP"
echo "==> Validando a regra de rotação antes de valer (simulação, nada é rotacionado)"
valida "$TMP" || { echo "ERRO: o logrotate recusou a regra. NADA foi instalado."; exit 1; }
if [ -f "$CONF" ] && cmp -s "$TMP" "$CONF"; then echo "Regra de rotação: já estava configurada."; else install -m 644 "$TMP" "$CONF"; echo "Regra de rotação gravada em $CONF."; fi

# Permissão 600 nos logs que já existem (só o root lê: podem conter e-mails e endereços de IP)
for f in "$LOG_DIR"/filapro-*.log "$PM2_LOGS"/*.log; do [ -f "$f" ] && chmod 600 "$f"; done
[ -d "$PM2_LOGS" ] && chmod 700 "$PM2_LOGS"
echo "Permissão dos logs existentes: 600 (só o root lê)."

conf_journald > "$TMP"
JMUDOU=false
if [ -f "$JCONF" ] && cmp -s "$TMP" "$JCONF"; then echo "Limite do journal: já estava configurado."; else install -m 644 "$TMP" "$JCONF"; JMUDOU=true; echo "Limite do journal gravado em $JCONF."; fi

if [ -z "$SEM_SERVICOS" ]; then
  if $JMUDOU; then
    systemctl restart systemd-journald 2>/dev/null && echo "journald reiniciado com o novo limite." || echo "ATENÇÃO: não consegui reiniciar o journald; vale no próximo boot."
    journalctl --vacuum-size=200M --vacuum-time=1month 2>&1 | tail -1 || true
  fi
  # A rotação roda sozinha todo dia pelo timer do sistema
  if systemctl list-unit-files logrotate.timer >/dev/null 2>&1; then
    systemctl is-enabled logrotate.timer >/dev/null 2>&1 || systemctl enable --now logrotate.timer >/dev/null 2>&1 || true
    echo "Timer diário do logrotate: $(systemctl is-active logrotate.timer 2>/dev/null || echo desconhecido)"
  fi
fi
echo
echo "Pronto. Logs do FilaPro: semanal (ou 20 MB), 8 cópias. Logs do pm2: diário (ou 50 MB), 14 cópias. Journal: 200 MB e 1 mês."
echo "Confira com:  bash $0 --conferir"
