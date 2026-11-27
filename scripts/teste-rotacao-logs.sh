#!/usr/bin/env bash
# Testa deploy/rotacao-logs.sh (decisão #172) com o logrotate de verdade numa "VPS falsa" (pastas em /tmp).
# Uso: bash scripts/teste-rotacao-logs.sh   (precisa do logrotate instalado e de ser root)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
R=/tmp/lr-raiz
PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
command -v logrotate >/dev/null || { echo "logrotate não instalado"; exit 1; }
rm -rf "$R"; mkdir -p "$R/var-log" "$R/pm2" "$R/logrotate.d" "$R/journald"
export FILAPRO_LOGROTATE_DIR="$R/logrotate.d" FILAPRO_JOURNALD_DIR="$R/journald" FILAPRO_LOG_DIR="$R/var-log" FILAPRO_PM2_LOGS="$R/pm2" FILAPRO_SEM_SERVICOS=1
CONF="$R/logrotate.d/filapro"; ST="$R/estado"
rot() { logrotate -s "$ST" "$@" "$CONF" >> "$R/saida.txt" 2>&1; }

# ---- 0. Antes de instalar: conferir acusa a falta
bash "$D/rotacao-logs.sh" --conferir > "$R/o.txt" 2>&1; RC=$?
t "Antes de instalar, --conferir diz que falta (código 1)" "$([ $RC -eq 1 ] && grep -q FALTA "$R/o.txt" && echo 1)"

# ---- 1. Logs já existentes (permissão aberta, como o cron cria)
for n in backup rotinas vigia; do echo "linha de $n" > "$R/var-log/filapro-$n.log"; chmod 644 "$R/var-log/filapro-$n.log"; done
echo "pm2 web" > "$R/pm2/filapro-web-out.log"; echo "pm2 worker" > "$R/pm2/filapro-worker-error.log"; chmod 644 "$R/pm2"/*.log; chmod 755 "$R/pm2"
OUT=$(bash "$D/rotacao-logs.sh" 2>&1); RC=$?
t "Instalação termina com sucesso" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q Pronto && echo 1)" "$OUT"
t "A regra tem os dois grupos e as diretivas combinadas" "$(grep -q 'weekly' "$CONF" && grep -q 'maxsize 20M' "$CONF" && grep -q 'rotate 8' "$CONF" && grep -q 'daily' "$CONF" && grep -q 'maxsize 50M' "$CONF" && grep -q 'rotate 14' "$CONF" && grep -q copytruncate "$CONF" && grep -q 'create 0600 root root' "$CONF" && echo 1)"
t "Logs existentes passaram para 600 e a pasta do pm2 para 700" "$([ "$(stat -c %a "$R/var-log/filapro-backup.log")" = 600 ] && [ "$(stat -c %a "$R/pm2/filapro-web-out.log")" = 600 ] && [ "$(stat -c %a "$R/pm2")" = 700 ] && echo 1)"
t "Journal: limite de 200 MB e 1 mês gravado" "$(grep -q 'SystemMaxUse=200M' "$R/journald/filapro.conf" && grep -q 'MaxRetentionSec=1month' "$R/journald/filapro.conf" && echo 1)"
bash "$D/rotacao-logs.sh" --conferir > "$R/o.txt" 2>&1; t "--conferir depois de instalar: tudo OK (código 0)" "$([ $? -eq 0 ] && [ "$(grep -c '^OK' "$R/o.txt")" = 2 ] && echo 1)" "$(cat "$R/o.txt")"

# ---- 2. Idempotente
S1=$(sha256sum "$CONF" "$R/journald/filapro.conf" | awk '{print $1}' | tr '\n' ' ')
OUT=$(bash "$D/rotacao-logs.sh" 2>&1); RC=$?
S2=$(sha256sum "$CONF" "$R/journald/filapro.conf" | awk '{print $1}' | tr '\n' ' ')
t "Rodar de novo não muda nada e avisa que já estava configurado" "$([ $RC -eq 0 ] && [ "$S1" = "$S2" ] && echo "$OUT" | grep -q 'já estava configurada' && echo 1)"
echo "alterado à mão" >> "$CONF"; bash "$D/rotacao-logs.sh" --conferir > /dev/null 2>&1; RC=$?
t "Regra alterada à mão: --conferir acusa; rodar o script a restaura" "$([ $RC -eq 1 ] && bash "$D/rotacao-logs.sh" >/dev/null 2>&1 && bash "$D/rotacao-logs.sh" --conferir >/dev/null 2>&1 && echo 1)"

# ---- 3. Rotação de verdade (forçada), duas vezes: .1 sem compactar, depois .2.gz
B="$R/var-log/filapro-backup.log"
rot -f; echo "linha nova depois da 1ª rotação" >> "$B"; rot -f
t "Log do FilaPro girou: existem .1 e .2.gz" "$([ -f "$B.1" ] && [ -f "$B.2.gz" ] && echo 1)" "$(ls "$R/var-log")"
t "A cópia compactada abre e tem o conteúdo antigo" "$(gunzip -c "$B.2.gz" | grep -q 'linha de backup' && echo 1)"
t "Permissão 600 no log novo, na cópia e na compactada" "$([ "$(stat -c %a "$B")" = 600 ] && [ "$(stat -c %a "$B.1")" = 600 ] && [ "$(stat -c %a "$B.2.gz")" = 600 ] && echo 1)"
rot -f
t "Log vazio (notifempty) não gira de novo sem conteúdo novo" "$([ ! -f "$B.3.gz" ] && echo 1)"

# ---- 4. copytruncate: o processo continua escrevendo no mesmo arquivo depois da rotação
P="$R/pm2/filapro-web-out.log"
( exec 3>>"$P"; i=0; while [ $i -lt 40 ]; do echo "escrevendo $i" >&3; i=$((i+1)); sleep 0.15; done ) &
ESC=$!; sleep 1
rot -f
sleep 1.5
t "pm2: o arquivo original continua sendo escrito depois da rotação (copytruncate)" "$([ "$(grep -c escrevendo "$P")" -ge 1 ] && echo 1)" "$(wc -l < "$P") linhas"
t "pm2: a cópia rotacionada guardou o que havia antes" "$(grep -q escrevendo "$P.1" && echo 1)"
t "pm2: permissão 600 mantida no original e na cópia" "$([ "$(stat -c %a "$P")" = 600 ] && [ "$(stat -c %a "$P.1")" = 600 ] && echo 1)"
wait $ESC

# ---- 5. Retenção: o FilaPro guarda 8 e o pm2 guarda 14
for i in $(seq 1 12); do echo "x$i" >> "$B"; rot -f; done
N=$(ls "$R/var-log" | grep -c '^filapro-backup.log\.'); t "FilaPro: no máximo 8 cópias (tem $N)" "$([ "$N" -le 8 ] && [ "$N" -ge 6 ] && echo 1)"
for i in $(seq 1 18); do echo "y$i" >> "$P"; rot -f; done
N=$(ls "$R/pm2" | grep -c '^filapro-web-out.log\.'); t "pm2: no máximo 14 cópias (tem $N)" "$([ "$N" -le 14 ] && [ "$N" -ge 10 ] && echo 1)"

# ---- 6. maxsize: log grande gira mesmo sem passar o prazo; log pequeno não
rm -f "$R/var-log"/filapro-*.log* "$R/estado"
head -c 21000000 /dev/zero | tr '\0' 'a' > "$R/var-log/filapro-grande.log"; echo "pequeno" > "$R/var-log/filapro-pequeno.log"; chmod 600 "$R/var-log"/*.log
rot; rot   # a 1ª rodada só registra a data; maxsize vale logo na 1ª se já passou
t "maxsize: log de 21 MB gira antes da semana; o pequeno não" "$([ -f "$R/var-log/filapro-grande.log.1" ] && [ ! -f "$R/var-log/filapro-pequeno.log.1" ] && echo 1)" "$(ls "$R/var-log")"

# ---- 7. Regra inválida não é instalada
rm -rf "$R/logrotate.d2"; mkdir "$R/logrotate.d2"
OUT=$(FILAPRO_LOGROTATE_DIR="$R/logrotate.d2" FILAPRO_LOG_DIR="/tmp/lr com espaco {" bash "$D/rotacao-logs.sh" 2>&1); RC=$?
t "Regra que o logrotate recusa: nada é instalado (código 1)" "$([ $RC -eq 1 ] && [ ! -f "$R/logrotate.d2/filapro" ] && echo 1)" "rc=$RC"

# ---- 8. Segurança do script
t "O script não mexe em systemd quando FILAPRO_SEM_SERVICOS está ligado" "$(bash -c "FILAPRO_SEM_SERVICOS=1 bash -x $D/rotacao-logs.sh 2>&1" | grep -q 'systemctl\b.*restart' && echo 0 || echo 1)"
rm -rf "$R" /tmp/rotacao-logs-debug.*
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
