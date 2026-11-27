#!/usr/bin/env bash
# SSH SÓ COM CHAVE, com prova de login real e desfazer automático (decisão #174 — Módulo 12). Rode como root.
# Fluxo: confere que há chave cadastrada -> grava a regra -> testa a configuração (sshd -t) -> recarrega o SSH -> espera você ENTRAR COM A CHAVE
# numa NOVA janela (a prova é o registro do SSH: "Accepted publickey"). Sem essa prova em 5 minutos, DESFAZ sozinho e a senha volta.
# Quem espera e desfaz é um processo separado: mesmo que o Terminal do navegador feche no meio, o desfazer acontece.
# Uso: ssh-travar.sh             trava (só chave; root só com chave)
#      ssh-travar.sh --estado    mostra a configuração efetiva do SSH e o resultado da última tentativa
#      ssh-travar.sh --desfazer  reabre a senha (emergência; depois trave de novo)
set -uo pipefail
CONFDIR="${FILAPRO_SSHD_CONF_DIR:-/etc/ssh/sshd_config.d}"
CONF="$CONFDIR/10-filapro.conf"
SSHD="${FILAPRO_SSHD:-sshd}"
RELOAD="${FILAPRO_SSH_RELOAD:-systemctl reload ssh || systemctl reload sshd}"
ESPERA="${FILAPRO_TRAVAR_ESPERA:-300}"
RUN="${FILAPRO_RUN_DIR:-/run}"
ESTADO="$RUN/filapro-ssh-travar.estado"
LOCK="$RUN/filapro-ssh-travar.lock"
SSHDIR="${FILAPRO_SSH_DIR:-/root/.ssh}"
MODO="${1:-}"
[ "$(id -u)" = "0" ] || { echo "Rode como root (sudo bash $0)."; exit 1; }

regra() { cat <<'CONF'
# FilaPro Leads (decisão #174): SSH só com chave. Gerado por deploy/ssh-travar.sh.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding no
CONF
}
recarregar() { bash -c "$RELOAD" >/dev/null 2>&1; }
# Quantos logins por chave já existem no registro do SSH (a prova é o número AUMENTAR depois de travar)
contar_logins() {
  if [ -n "${FILAPRO_SSH_LOG_FILE:-}" ]; then grep -c 'Accepted publickey' "$FILAPRO_SSH_LOG_FILE" 2>/dev/null || true
  elif command -v journalctl >/dev/null 2>&1 && journalctl -u ssh -u sshd -n 1 --no-pager >/dev/null 2>&1; then journalctl -u ssh -u sshd --no-pager -o cat 2>/dev/null | grep -c 'Accepted publickey' || true
  elif [ -f /var/log/auth.log ]; then grep -c 'Accepted publickey' /var/log/auth.log || true
  else echo 0; fi
}
efetivo() { bash -c "$SSHD -T" 2>/dev/null | grep -E '^(passwordauthentication|permitrootlogin|maxauthtries|kbdinteractiveauthentication) ' | tr '\n' ' '; }
chaves() { [ -f "$SSHDIR/authorized_keys" ] || { echo 0; return; }; grep -cE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) ' "$SSHDIR/authorized_keys" || true; }

if [ "$MODO" = "--estado" ]; then
  echo "Configuração efetiva do SSH: $(efetivo)"
  echo "Chaves cadastradas: $(chaves)"
  [ -f "$ESTADO" ] && echo "Última tentativa de travar: $(cat "$ESTADO")" || echo "Nenhuma tentativa de travar registrada nesta inicialização."
  exit 0
fi

if [ "$MODO" = "--desfazer" ]; then
  if [ -f "$CONF" ]; then rm -f "$CONF"; recarregar; echo "Regra do FilaPro removida; SSH recarregado."; else echo "Não havia regra do FilaPro para remover."; fi
  echo "Configuração efetiva agora: $(efetivo)"
  echo "$(date '+%d/%m %H:%M') DESFEITO manualmente (--desfazer)" > "$ESTADO"
  echo "Se ainda aparecer passwordauthentication no, outro arquivo em $CONFDIR está desligando a senha."
  echo "Depois de resolver o que precisava, trave de novo:  bash $0"
  exit 0
fi

# ---- Modo interno: o processo que espera a prova e desfaz se ela não vier (roda separado do terminal)
if [ "$MODO" = "--vigiar" ]; then
  BASE="${2:-0}"; ANTIGA="${3:-}"; FIM=$(( $(date +%s) + ESPERA ))
  while [ "$(date +%s)" -lt "$FIM" ]; do
    ATUAL="$(contar_logins)"
    if [ "${ATUAL:-0}" -gt "${BASE:-0}" ]; then echo "$(date '+%d/%m %H:%M') CONFIRMADO: login real com chave detectado; SSH só com chave." > "$ESTADO"; rm -f "$ANTIGA"; exit 0; fi
    sleep 2
  done
  if [ -n "$ANTIGA" ] && [ -f "$ANTIGA" ]; then cp "$ANTIGA" "$CONF"; else rm -f "$CONF"; fi
  recarregar; rm -f "$ANTIGA"
  echo "$(date '+%d/%m %H:%M') DESFEITO: nenhum login com chave em ${ESPERA}s; a regra anterior foi restaurada." > "$ESTADO"
  exit 0
fi

# ---- Travar
exec 8>"$LOCK" || exit 1; flock -n 8 || { echo "Já há uma tentativa de travar em andamento."; exit 1; }
N="$(chaves)"
if [ "${N:-0}" -lt 1 ]; then
  echo "RECUSADO: nenhuma chave SSH cadastrada. Cadastre antes:  bash $(dirname "$0")/ssh-chave.sh --adicionar"; exit 1
fi
echo "Chaves cadastradas: $N"
command -v "${SSHD%% *}" >/dev/null 2>&1 || { echo "ERRO: sshd não encontrado."; exit 1; }
if efetivo | grep -q 'passwordauthentication no' && [ -f "$CONF" ] && [ "$(regra)" = "$(cat "$CONF")" ]; then echo "O SSH já está só com chave ($(efetivo))."; exit 0; fi

mkdir -p "$CONFDIR"
ANTIGA=""; [ -f "$CONF" ] && { ANTIGA="$(mktemp)"; cp "$CONF" "$ANTIGA"; }
regra > "$CONF.novo"; mv "$CONF.novo" "$CONF"; chmod 644 "$CONF"
if ! bash -c "$SSHD -t" 2>/tmp/ssh-travar-teste.$$; then
  echo "ERRO: o teste de configuração do SSH recusou a regra (nada mudou):"; head -3 /tmp/ssh-travar-teste.$$
  if [ -n "$ANTIGA" ]; then cp "$ANTIGA" "$CONF"; else rm -f "$CONF"; fi; rm -f /tmp/ssh-travar-teste.$$ "$ANTIGA"; exit 1
fi
rm -f /tmp/ssh-travar-teste.$$
BASE="$(contar_logins)"
recarregar || { echo "ERRO: não consegui recarregar o SSH; restaurando."; if [ -n "$ANTIGA" ]; then cp "$ANTIGA" "$CONF"; else rm -f "$CONF"; fi; recarregar; exit 1; }
echo "$(date '+%d/%m %H:%M') AGUARDANDO a prova do login com chave" > "$ESTADO"
# O vigia roda separado do terminal (setsid): se esta janela fechar, ele continua e desfaz se não houver prova
setsid nohup bash "$0" --vigiar "$BASE" "$ANTIGA" >/dev/null 2>&1 < /dev/null &
echo
echo "================================================================"
echo "  SSH AGORA SÓ COM CHAVE — falta a PROVA"
echo "  1) NÃO FECHE esta janela."
echo "  2) Abra OUTRA janela (PowerShell) e entre com a chave:"
echo "       ssh root@IP_DA_VPS"
echo "  3) Se entrar SEM pedir a senha da VPS, a prova é detectada aqui."
echo "  Você tem $((ESPERA / 60)) minuto(s). Sem a prova, tudo é DESFEITO sozinho"
echo "  (a senha volta). Nada a fazer: é só esperar."
echo "================================================================"
FIM=$(( $(date +%s) + ESPERA + 15 ))
while [ "$(date +%s)" -lt "$FIM" ]; do
  if grep -q 'CONFIRMADO' "$ESTADO" 2>/dev/null; then echo; cat "$ESTADO"; echo "Configuração efetiva: $(efetivo)"; exit 0; fi
  if grep -q 'DESFEITO' "$ESTADO" 2>/dev/null; then echo; cat "$ESTADO"; echo "A senha voltou a valer. Confira a chave e tente de novo."; exit 1; fi
  sleep 2
done
echo "Sem resposta do vigia; confira com:  bash $0 --estado"; exit 1
