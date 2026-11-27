#!/usr/bin/env bash
# Cadastro das chaves SSH que podem entrar na VPS (decisão #174 — Módulo 12). Rode como root.
# Você cola só a linha da chave PÚBLICA (o arquivo .pub do seu computador: começa com "ssh-ed25519"). A chave PRIVADA nunca sai do seu computador.
# Uso: ssh-chave.sh --adicionar        cola a linha da chave pública (o script confere o formato e recusa chave privada)
#      ssh-chave.sh --listar           lista as chaves cadastradas (só impressão digital e comentário)
#      ssh-chave.sh --remover N        remove a chave de número N (recusa remover a última, para não te trancar fora)
set -uo pipefail
umask 077
DIR="${FILAPRO_SSH_DIR:-/root/.ssh}"
AK="$DIR/authorized_keys"
MODO="${1:-}"
[ "$(id -u)" = "0" ] || { echo "Rode como root (sudo bash $0)."; exit 1; }
command -v ssh-keygen >/dev/null 2>&1 || { echo "ERRO: ssh-keygen não encontrado (apt-get install openssh-client)."; exit 1; }

garantir_pasta() { mkdir -p "$DIR"; chmod 700 "$DIR"; touch "$AK"; chmod 600 "$AK"; }
chaves_validas() { [ -f "$AK" ] || { echo 0; return; }; grep -cE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) ' "$AK" || true; }

case "$MODO" in
  --adicionar)
    if [ -n "${FILAPRO_SSH_PUB:-}" ]; then LINHA="$FILAPRO_SSH_PUB"; else
      echo "Cole a linha da chave PÚBLICA (a que começa com ssh-ed25519) e aperte Enter:"; read -r LINHA; fi
    LINHA="$(echo "$LINHA" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | tr -d '\r')"
    [ -n "$LINHA" ] || { echo "Nada colado. Nada foi gravado."; exit 1; }
    if echo "$LINHA" | grep -qiE 'PRIVATE KEY|BEGIN OPENSSH|BEGIN RSA|BEGIN EC'; then
      echo "PARE: isto é a chave PRIVADA. Ela NUNCA deve sair do seu computador nem ir para a VPS ou para o chat."
      echo "Você precisa da chave PÚBLICA: o arquivo com final .pub (id_ed25519.pub). Considere esta chave privada comprometida e crie outra com:  ssh-keygen -t ed25519"
      exit 1
    fi
    # Só aceita linhas que COMEÇAM pelo tipo da chave (recusa opções como command= ou from= que mudariam o que a chave pode fazer)
    echo "$LINHA" | grep -qE '^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/=]+( .*)?$' \
      || { echo "Linha inválida: uma chave pública começa com ssh-ed25519 (ou ssh-rsa) seguido de um texto longo. Nada foi gravado."; exit 1; }
    TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT; echo "$LINHA" > "$TMP"
    INFO="$(ssh-keygen -l -f "$TMP" 2>/dev/null)" || { echo "A chave não passou na conferência do ssh-keygen (texto incompleto ou corrompido). Nada foi gravado."; exit 1; }
    BITS="$(echo "$INFO" | awk '{print $1}')"; TIPO="$(echo "$INFO" | awk '{print $NF}')"
    if [ "$TIPO" = "(RSA)" ] && [ "${BITS:-0}" -lt 3072 ]; then echo "Chave RSA de $BITS bits é fraca (mínimo 3072). Crie uma ed25519:  ssh-keygen -t ed25519. Nada foi gravado."; exit 1; fi
    garantir_pasta
    BLOB="$(echo "$LINHA" | awk '{print $2}')"
    if grep -qF "$BLOB" "$AK"; then echo "Essa chave já está cadastrada. Nada mudou."; exit 0; fi
    echo "$LINHA" >> "$AK"; chmod 600 "$AK"
    echo "Chave cadastrada: $INFO"
    echo "Agora, com a senha ainda LIGADA, teste entrar com a chave numa NOVA janela (veja docs/publicacao-vps.md 6.2e). Depois rode:  bash $(dirname "$0")/ssh-travar.sh"
    ;;
  --listar)
    N="$(chaves_validas)"
    echo "Chaves cadastradas: $N"
    [ "$N" -gt 0 ] && awk '/^(ssh-|ecdsa-|sk-)/{n++; print n") "$0}' "$AK" | while IFS= read -r l; do
      num="${l%%)*}"; linha="${l#*) }"; t="$(mktemp)"; echo "$linha" > "$t"; echo "  $num) $(ssh-keygen -l -f "$t" 2>/dev/null)"; rm -f "$t"
    done
    ;;
  --remover)
    N="${2:-}"; [[ "$N" =~ ^[0-9]+$ ]] || { echo "Uso: $0 --remover N (número da lista de --listar)"; exit 2; }
    TOTAL="$(chaves_validas)"
    [ "$N" -ge 1 ] && [ "$N" -le "$TOTAL" ] || { echo "Não existe a chave $N (há $TOTAL)."; exit 1; }
    if [ "$TOTAL" -le 1 ] && [ "${3:-}" != "--forcar" ]; then
      echo "RECUSADO: é a última chave. Remover deixaria a VPS sem nenhuma chave (você só entraria pelo Terminal do navegador do painel)."
      echo "Cadastre a nova chave primeiro (--adicionar) e depois remova a antiga."; exit 1
    fi
    awk -v n="$N" '/^(ssh-|ecdsa-|sk-)/{c++; if (c==n) next} {print}' "$AK" > "$AK.novo" && chmod 600 "$AK.novo" && mv "$AK.novo" "$AK"
    echo "Chave $N removida. Restam $(chaves_validas)."
    ;;
  *) sed -n 2,8p "$0"; exit 2 ;;
esac
