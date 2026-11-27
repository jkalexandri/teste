#!/usr/bin/env bash
# Senha que protege o pacote de CHAVES do backup (decisão #169). Rode uma vez como root:  bash /opt/filapro/app/deploy/backup-senha.sh
# A senha é digitada aqui (não aparece na tela, NUNCA cole no chat) e fica só num arquivo do root (/root/.filapro-backup-senha, permissão 600).
# GUARDE A MESMA SENHA FORA DA VPS (gerenciador de senhas): sem ela o pacote de chaves do backup não abre.
# Uso: backup-senha.sh              cria a senha (se ainda não existe)
#      backup-senha.sh --conferir   só diz se existe e a permissão (não mostra a senha)
#      backup-senha.sh --trocar     troca a senha (pacotes de chaves já feitos continuam com a senha antiga)
set -euo pipefail
ARQ="${FILAPRO_SENHA_ARQ:-/root/.filapro-backup-senha}"
if [ "${1:-}" = "--conferir" ]; then
  if [ -f "$ARQ" ]; then echo "Senha do backup configurada ($ARQ, permissão $(stat -c %a "$ARQ"))."; else echo "Senha do backup NÃO configurada: rode  bash $0"; exit 1; fi
  exit 0
fi
if [ -f "$ARQ" ] && [ "${1:-}" != "--trocar" ]; then
  echo "Já existe uma senha configurada. Para trocar, rode:  bash $0 --trocar"
  echo "(Os pacotes de chaves já feitos continuam abrindo só com a senha antiga.)"
  exit 1
fi
read -rsp "Digite a senha do backup (mínimo 12 caracteres): " S1; echo
read -rsp "Repita a senha: " S2; echo
[ "$S1" = "$S2" ] || { echo "As senhas não conferem. Nada foi gravado."; exit 1; }
[ "${#S1}" -ge 12 ] || { echo "Senha curta demais (mínimo 12 caracteres). Nada foi gravado."; exit 1; }
umask 077
printf '%s\n' "$S1" > "$ARQ"
chmod 600 "$ARQ"
# Prova: cifra e decifra um texto com a senha gravada
PROVA=$(printf 'teste-do-backup' | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$ARQ" | openssl enc -d -aes-256-cbc -pbkdf2 -pass "file:$ARQ")
[ "$PROVA" = "teste-do-backup" ] || { echo "ERRO: a senha gravada não funcionou na prova de cifrar e decifrar."; exit 1; }
echo "Senha gravada em $ARQ (permissão 600) e testada."
echo "AGORA guarde a MESMA senha fora da VPS (gerenciador de senhas do celular ou do computador). Sem ela, o pacote de chaves do backup não abre."
