#!/usr/bin/env bash
# Senha que protege o pacote de CHAVES do backup (decisão #169). Rode uma vez como root.
# A senha fica só num arquivo do root (/root/.filapro-backup-senha, permissão 600). NUNCA cole a senha no chat nem tire print dela.
# GUARDE A MESMA SENHA FORA DA VPS (gerenciador de senhas): sem ela o pacote de chaves do backup não abre.
# Uso: backup-senha.sh --gerar       (recomendado) gera uma senha aleatória, grava e mostra UMA vez na tela para você anotar
#      backup-senha.sh               você digita a senha duas vezes (não aparece na tela)
#      backup-senha.sh --verificar   você digita a senha que anotou e ele diz se CONFERE com a gravada (prova que anotou certo)
#      backup-senha.sh --conferir    só diz se existe e a permissão (não mostra a senha)
#      backup-senha.sh --trocar      troca a senha (pacotes de chaves já feitos continuam com a senha antiga)
set -euo pipefail
ARQ="${FILAPRO_SENHA_ARQ:-/root/.filapro-backup-senha}"
MODO="${1:-}"

if [ "$MODO" = "--conferir" ]; then
  if [ -f "$ARQ" ]; then echo "Senha do backup configurada ($ARQ, permissão $(stat -c %a "$ARQ"))."; else echo "Senha do backup NÃO configurada: rode  bash $0 --gerar"; exit 1; fi
  exit 0
fi

if [ "$MODO" = "--verificar" ]; then
  [ -f "$ARQ" ] || { echo "Senha do backup NÃO configurada: rode  bash $0 --gerar"; exit 1; }
  read -rsp "Digite a senha que você anotou: " S; echo
  if [ "$S" = "$(head -1 "$ARQ")" ]; then echo "CONFERE: a senha anotada é a mesma gravada na VPS."; exit 0; fi
  echo "NÃO CONFERE: a senha digitada é diferente da gravada. Confira o que você anotou (ou troque com: bash $0 --trocar --gerar)."; exit 1
fi

TROCAR=false; GERAR=false
for a in "$@"; do [ "$a" = "--trocar" ] && TROCAR=true; [ "$a" = "--gerar" ] && GERAR=true; done
if [ -f "$ARQ" ] && ! $TROCAR; then
  echo "Já existe uma senha configurada. Para trocar, rode:  bash $0 --trocar --gerar"
  echo "(Os pacotes de chaves já feitos continuam abrindo só com a senha antiga.)"
  exit 1
fi

if $GERAR; then
  S="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24)"
  [ "${#S}" -eq 24 ] || { echo "ERRO: não foi possível gerar a senha."; exit 1; }
else
  read -rsp "Digite a senha do backup (mínimo 12 caracteres): " S1; echo
  read -rsp "Repita a senha: " S2; echo
  [ "$S1" = "$S2" ] || { echo "As senhas não conferem. Nada foi gravado. (Dica: prefira  bash $0 --gerar)"; exit 1; }
  [ "${#S1}" -ge 12 ] || { echo "Senha curta demais (mínimo 12 caracteres). Nada foi gravado."; exit 1; }
  S="$S1"
fi

umask 077
printf '%s\n' "$S" > "$ARQ"
chmod 600 "$ARQ"
# Prova: cifra e decifra um texto com a senha gravada
PROVA=$(printf 'teste-do-backup' | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$ARQ" | openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$ARQ")
[ "$PROVA" = "teste-do-backup" ] || { echo "ERRO: a senha gravada não funcionou na prova de cifrar e decifrar."; exit 1; }
echo "Senha gravada em $ARQ (permissão 600) e testada."
if $GERAR; then
  echo
  echo "================ SUA SENHA DO BACKUP (aparece só desta vez) ================"
  echo
  echo "    $S"
  echo
  echo "============================================================================"
  echo "1) ANOTE AGORA no gerenciador de senhas (celular ou computador), com o nome \"FilaPro — senha do backup\"."
  echo "2) NÃO tire print desta tela e NÃO cole a senha no chat."
  echo "3) Confira que anotou certo:  bash $0 --verificar"
  echo "4) Depois limpe a tela:  clear"
else
  echo "AGORA guarde a MESMA senha fora da VPS (gerenciador de senhas). Sem ela, o pacote de chaves do backup não abre."
  echo "Confira que anotou certo:  bash $0 --verificar"
fi
