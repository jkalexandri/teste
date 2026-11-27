#!/usr/bin/env bash
# Testa deploy/ssh-chave.sh e ssh-travar.sh (decisão #174) com um sshd REAL numa porta alta (127.0.0.1:2222) e o cliente ssh de verdade.
# Uso: bash scripts/teste-ssh.sh   (precisa de openssh-server e openssh-client; roda como root; não mexe no SSH da máquina)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
X=/tmp/sx
PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
command -v sshd >/dev/null && command -v ssh >/dev/null || { echo "openssh-server/client não instalados"; exit 1; }
pkill -f "sshd -f $X/sshd_config" 2>/dev/null; sleep 0.5
rm -rf "$X"; mkdir -p "$X/conf.d" "$X/ssh" "$X/run" /run/sshd
ssh-keygen -q -t ed25519 -N "" -f "$X/host_ed25519"
ssh-keygen -q -t ed25519 -N "" -C "teste-notebook" -f "$X/id"
ssh-keygen -q -t ed25519 -N "" -C "teste-segunda" -f "$X/id2"
ssh-keygen -q -t rsa -b 2048 -N "" -f "$X/rsa2048"; ssh-keygen -q -t rsa -b 3072 -N "" -f "$X/rsa3072"
cat > "$X/sshd_config" <<CONF
Include $X/conf.d/*.conf
Port 2222
ListenAddress 127.0.0.1
HostKey $X/host_ed25519
PidFile $X/sshd.pid
AuthorizedKeysFile $X/ssh/authorized_keys
StrictModes no
UsePAM no
PasswordAuthentication yes
PermitRootLogin yes
LogLevel INFO
CONF
/usr/sbin/sshd -f "$X/sshd_config" -E "$X/sshd.log" || { echo "sshd de teste não subiu"; exit 1; }
export FILAPRO_SSH_DIR="$X/ssh" FILAPRO_SSHD_CONF_DIR="$X/conf.d" FILAPRO_RUN_DIR="$X/run" FILAPRO_SSH_LOG_FILE="$X/sshd.log"
export FILAPRO_SSHD="/usr/sbin/sshd -f $X/sshd_config" FILAPRO_SSH_RELOAD="kill -HUP \$(cat $X/sshd.pid)" FILAPRO_TRAVAR_ESPERA=7
CONF="$X/conf.d/10-filapro.conf"; AK="$X/ssh/authorized_keys"; SAIDAS="$X/saidas.txt"; : > "$SAIDAS"
cli() { ssh -p 2222 -i "${1:-$X/id}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o ConnectTimeout=5 root@127.0.0.1 "${2:-true}" 2>&1; }
senha_oferecida() { ssh -p 2222 -o PubkeyAuthentication=no -o PreferredAuthentications=password -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes -o ConnectTimeout=5 root@127.0.0.1 true 2>&1 | grep -q 'publickey,password'; }
chave() { bash "$D/ssh-chave.sh" "$@" 2>&1 | tee -a "$SAIDAS"; return "${PIPESTATUS[0]}"; }
BLOB="$(awk '{print $2}' "$X/id.pub")"

# ---- 1. ssh-chave.sh: só aceita chave pública válida
OUT=$(FILAPRO_SSH_PUB="-----BEGIN OPENSSH PRIVATE KEY-----" chave --adicionar); RC=$?
t "Chave PRIVADA colada: recusada com aviso forte e nada gravado" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'PRIVADA' && [ ! -s "$AK" ] && echo 1)"
OUT=$(FILAPRO_SSH_PUB="isto não é uma chave" chave --adicionar); t "Texto qualquer: recusado" "$([ $? -eq 1 ] && echo 1)"
OUT=$(FILAPRO_SSH_PUB="command=\"rm -rf /\" $(cat "$X/id.pub")" chave --adicionar); t "Linha com opções (command=) na frente: recusada" "$([ $? -eq 1 ] && [ ! -s "$AK" ] && echo 1)"
OUT=$(FILAPRO_SSH_PUB="$(cut -c1-60 "$X/id.pub")" chave --adicionar); t "Chave cortada/incompleta: recusada" "$([ $? -eq 1 ] && [ ! -s "$AK" ] && echo 1)"
OUT=$(FILAPRO_SSH_PUB="$(cat "$X/rsa2048.pub")" chave --adicionar); t "RSA de 2048 bits (fraca): recusada" "$([ $? -eq 1 ] && echo "$OUT" | grep -q 3072 && echo 1)"
OUT=$(FILAPRO_SSH_PUB="$(cat "$X/id.pub")" chave --adicionar); RC=$?
t "ed25519 válida: cadastrada, mostra a impressão digital" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q 'SHA256:' && grep -qF "$BLOB" "$AK" && echo 1)"
t "Permissões: pasta 700 e authorized_keys 600" "$([ "$(stat -c %a "$X/ssh")" = 700 ] && [ "$(stat -c %a "$AK")" = 600 ] && echo 1)"
OUT=$(FILAPRO_SSH_PUB="$(cat "$X/id.pub")" chave --adicionar); t "Mesma chave de novo: não duplica" "$([ "$(grep -c "$BLOB" "$AK")" = 1 ] && echo "$OUT" | grep -q 'já está' && echo 1)"
OUT=$(FILAPRO_SSH_PUB="$(cat "$X/rsa3072.pub")" chave --adicionar); t "RSA de 3072 bits: aceita" "$([ $? -eq 0 ] && echo 1)"
OUT=$(chave --listar); t "--listar mostra 2 chaves com impressão digital e NÃO mostra a chave em si" "$(echo "$OUT" | grep -q 'Chaves cadastradas: 2' && echo "$OUT" | grep -q 'SHA256' && ! echo "$OUT" | grep -qF "$BLOB" && echo 1)"
chave --remover 99 >/dev/null; t "--remover de número inexistente: recusado" "$([ $? -ne 0 ] && echo 1)"
OUT=$(chave --remover 2); t "--remover 2: remove a RSA e sobra 1" "$([ $? -eq 0 ] && [ "$(grep -cE '^(ssh-|ecdsa-)' "$AK")" = 1 ] && echo 1)"
OUT=$(chave --remover 1); t "Remover a ÚLTIMA chave é recusado (não te tranca fora)" "$([ $? -eq 1 ] && echo "$OUT" | grep -q 'última chave' && [ "$(grep -cE '^(ssh-|ecdsa-)' "$AK")" = 1 ] && echo 1)"

# ---- 2. Antes de travar: chave funciona e senha é oferecida
t "Login com a chave funciona (senha ainda ligada)" "$(cli | grep -q 'Permission denied' && echo 0 || echo 1)"
t "Antes de travar o servidor oferece senha (publickey,password)" "$(senha_oferecida && echo 1)"

# ---- 3. Travar sem nenhuma chave
cp "$AK" "$X/ak-backup"; : > "$AK"
OUT=$(bash "$D/ssh-travar.sh" 2>&1); RC=$?; echo "$OUT" >> "$SAIDAS"
t "Travar sem chave cadastrada: RECUSADO e a regra não é criada" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q RECUSADO && [ ! -f "$CONF" ] && echo 1)"
cp "$X/ak-backup" "$AK"

# ---- 4. Travar COM a prova de login real
( bash "$D/ssh-travar.sh" > "$X/travar1.txt" 2>&1; echo $? > "$X/travar1.rc" ) &
sleep 3; cli > /dev/null 2>&1
for i in $(seq 1 20); do [ -f "$X/travar1.rc" ] && break; sleep 1; done
cat "$X/travar1.txt" >> "$SAIDAS"
t "Com um login real por chave durante a espera: CONFIRMADO (código 0)" "$([ "$(cat "$X/travar1.rc" 2>/dev/null)" = 0 ] && grep -q CONFIRMADO "$X/travar1.txt" && echo 1)" "$(cat "$X/travar1.txt" | tail -3)"
sleep 2
t "Depois de travar: a senha NÃO é mais oferecida (só publickey)" "$(! senha_oferecida && ssh -p 2222 -o PubkeyAuthentication=no -o PreferredAuthentications=password -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o BatchMode=yes root@127.0.0.1 true 2>&1 | grep -q 'Permission denied (publickey)' && echo 1)"
cli >/dev/null 2>&1; t "Depois de travar: o login com a chave continua funcionando" "$([ $? -eq 0 ] && echo 1)"
EF="$(bash "$D/ssh-travar.sh" --estado 2>&1)"
t "--estado: senha no, root só com chave, 3 tentativas" "$(echo "$EF" | grep -q 'passwordauthentication no' && echo "$EF" | grep -qE 'permitrootlogin (prohibit-password|without-password)' && echo "$EF" | grep -q 'maxauthtries 3' && echo 1)" "$EF"
t "Endurecimento extra: sem repasse de portas e de agente, sem X11, 120 s para entrar (sshd -T)" "$(/usr/sbin/sshd -f "$X/sshd_config" -T | grep -E '^(allowtcpforwarding no|allowagentforwarding no|x11forwarding no|logingracetime 120)' | wc -l | grep -q 4 && echo 1)"
OUT=$(bash "$D/ssh-travar.sh" 2>&1); t "Travar de novo: avisa que já está e não muda nada (idempotente)" "$([ $? -eq 0 ] && echo "$OUT" | grep -q 'já está' && echo 1)"
OUT=$(bash "$D/ssh-travar.sh" --desfazer 2>&1); sleep 1
t "--desfazer: a senha volta a ser oferecida" "$(senha_oferecida && [ ! -f "$CONF" ] && echo 1)"

# ---- 5. SEM a prova: desfaz sozinho e o servidor volta ao estado anterior
echo "MaxAuthTries 5" > "$CONF"; kill -HUP "$(cat "$X/sshd.pid")"; ORIG="$(cat "$CONF")"
OUT=$(bash "$D/ssh-travar.sh" 2>&1); RC=$?; echo "$OUT" >> "$SAIDAS"
t "Sem login por chave em 7 s: DESFEITO sozinho (código 1)" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q DESFEITO && echo 1)" "$(echo "$OUT" | tail -3)"
t "Desfeito: a regra anterior foi restaurada exatamente e a senha ainda vale" "$([ "$(cat "$CONF")" = "$ORIG" ] && senha_oferecida && echo 1)"
cli >/dev/null 2>&1; t "Depois do desfazer automático o login com a chave continua funcionando" "$([ $? -eq 0 ] && echo 1)"
rm -f "$CONF"; kill -HUP "$(cat "$X/sshd.pid")"

# ---- 6. O desfazer acontece mesmo se o terminal morrer no meio
bash "$D/ssh-travar.sh" > "$X/travar2.txt" 2>&1 &
PID=$!; sleep 2; kill -9 $PID 2>/dev/null
t "Terminal 'morreu' no meio: nesse instante a regra está aplicada (senha desligada)" "$([ -f "$CONF" ] && ! senha_oferecida && echo 1)"
sleep 10
t "Mesmo assim o vigia separado DESFEZ sozinho depois do prazo" "$([ ! -f "$CONF" ] && senha_oferecida && grep -q DESFEITO "$X/run/filapro-ssh-travar.estado" && echo 1)" "$(cat "$X/run/filapro-ssh-travar.estado" 2>/dev/null)"

# ---- 7. Tentativa simultânea
bash "$D/ssh-travar.sh" > "$X/travar3.txt" 2>&1 &
PID=$!; sleep 2
OUT=$(bash "$D/ssh-travar.sh" 2>&1); t "Segunda tentativa durante a espera: recusada" "$(echo "$OUT" | grep -q 'em andamento' && echo 1)"
wait $PID; sleep 1

# ---- 8. Configuração recusada pelo teste do sshd: nada muda
cat > "$X/sshd-quebrado.sh" <<'W'
#!/bin/bash
# se a regra do FilaPro estiver gravada, finge que a configuração é inválida no teste (-t)
if [ "$1" = "-t" ] && grep -q "decisão #174" /tmp/sx/conf.d/10-filapro.conf 2>/dev/null; then echo "/tmp/sx/conf.d/10-filapro.conf: erro simulado" >&2; exit 255; fi
exec /usr/sbin/sshd -f /tmp/sx/sshd_config "$@"
W
chmod +x "$X/sshd-quebrado.sh"
OUT=$(FILAPRO_SSHD="$X/sshd-quebrado.sh" bash "$D/ssh-travar.sh" 2>&1); RC=$?
t "sshd -t recusa a regra: ERRO, regra removida, SSH não recarregado, senha segue valendo" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'recusou' && [ ! -f "$CONF" ] && senha_oferecida && echo 1)" "$OUT"

# ---- 9. Segurança dos scripts e das saídas
t "Nenhuma saída trouxe a chave pública inteira" "$(grep -qF "$BLOB" "$SAIDAS" && echo 0 || echo 1)"
t "seguranca-vps.sh não desliga mais a senha sozinho" "$(grep -q 'PasswordAuthentication no' "$D/seguranca-vps.sh" && echo 0 || echo 1)"
pkill -f "sshd -f $X/sshd_config" 2>/dev/null
rm -rf "$X"
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
