#!/usr/bin/env bash
# Cadastro da cópia do backup FORA da VPS, no Backblaze B2 (decisão #173 — Módulo 12, P0-3). Rode como root.
# Cria o arquivo do rclone (/root/.config/rclone/filapro-b2.conf, permissão 600) com:
#   - o acesso ao bucket do B2 (chave restrita ao bucket) e
#   - a CRIPTOGRAFIA feita na VPS antes de enviar (duas senhas aleatórias geradas aqui). Nenhum arquivo legível vai para o B2.
# REGRAS DE SEGURANÇA: a chave do B2 e as senhas NUNCA vão para o chat nem para print. Você COLA a chave UMA vez (não aparece na tela) e o
# script TESTA na hora (ACEITO / NÃO ACEITO) — sem digitar duas vezes. As duas senhas de criptografia aparecem UMA vez para você anotar FORA da VPS.
# Uso: backup-externo-config.sh                  cadastro novo (gera as senhas de criptografia)
#      backup-externo-config.sh --recuperar      servidor novo/desastre: você informa as duas senhas que anotou (para poder BAIXAR os backups)
#      backup-externo-config.sh --verificar-senhas   você digita as duas senhas anotadas e ele diz se CONFEREM com as gravadas
#      backup-externo-config.sh --trocar-chave   troca só a chave do B2 (mantém as senhas de criptografia)
#      backup-externo-config.sh --conferir       só confere (não altera nada)
set -uo pipefail
umask 077
CONF="${FILAPRO_RCLONE_CONF:-/root/.config/rclone/filapro-b2.conf}"
LOCAL_TESTE="${FILAPRO_EXT_LOCAL:-}"          # nos testes: destino é uma pasta local, não o B2
MODO="${1:-}"
R() { rclone --config "$1" "${@:2}"; }

[ "$(id -u)" = "0" ] || { echo "Rode como root (sudo bash $0)."; exit 1; }
if ! command -v rclone >/dev/null 2>&1; then
  echo "==> Instalando o rclone (repositório do Ubuntu)"
  apt-get install -y rclone >/dev/null 2>&1 || { echo "ERRO: não consegui instalar o rclone (apt-get install rclone)."; exit 1; }
fi

senha_do_conf() { # senha_do_conf N -> imprime a senha em texto (só em memória)
  local campo="password"; [ "$1" = "2" ] && campo="password2"
  local ob; ob="$(awk -F' = ' -v c="$campo" '/^\[filapro-cripto\]/{s=1;next} /^\[/{s=0} s && $1==c {print $2}' "$CONF")"
  [ -n "$ob" ] && rclone reveal "$ob" 2>/dev/null
}

if [ "$MODO" = "--conferir" ]; then
  [ -f "$CONF" ] || { echo "FALTA: a cópia externa não está configurada (rode: bash $0)."; exit 1; }
  P="$(stat -c %a "$CONF")"; [ "$P" = 600 ] && echo "OK: arquivo de configuração com permissão 600." || { echo "ATENÇÃO: permissão $P no arquivo de configuração (deveria ser 600): chmod 600 $CONF"; exit 1; }
  if R "$CONF" lsd filapro-cripto: >/dev/null 2>&1 || R "$CONF" lsf filapro-cripto: >/dev/null 2>&1; then echo "OK: o destino responde."; else echo "FALHA: o destino não respondeu (chave recusada ou sem internet)."; exit 1; fi
  exit 0
fi

if [ "$MODO" = "--verificar-senhas" ]; then
  [ -f "$CONF" ] || { echo "A cópia externa não está configurada."; exit 1; }
  read -rsp "Digite a senha 1 que você anotou: " D1; echo
  read -rsp "Digite a senha 2 que você anotou: " D2; echo
  if [ "$D1" = "$(senha_do_conf 1)" ] && [ "$D2" = "$(senha_do_conf 2)" ]; then echo "CONFEREM: as duas senhas anotadas são as mesmas gravadas na VPS."; exit 0; fi
  echo "NÃO CONFEREM: confira o que você anotou (as duas precisam estar certas)."; exit 1
fi

TROCAR=false; RECUPERAR=false
[ "$MODO" = "--trocar-chave" ] && TROCAR=true
[ "$MODO" = "--recuperar" ] && RECUPERAR=true
if [ -f "$CONF" ] && ! $TROCAR && ! $RECUPERAR; then
  echo "Já existe uma configuração. Para trocar só a chave do B2:  bash $0 --trocar-chave"
  echo "(Não gere senhas de criptografia novas: os backups já enviados só abrem com as senhas antigas.)"; exit 1
fi
$TROCAR && [ ! -f "$CONF" ] && { echo "Não há configuração para trocar. Rode:  bash $0"; exit 1; }

# ---------------------------------------------------------------- 1. Dados do B2 (a chave não aparece na tela e não é digitada duas vezes)
if [ -z "$LOCAL_TESTE" ]; then
  if [ -n "${FILAPRO_EXT_BUCKET:-}" ]; then BUCKET="$FILAPRO_EXT_BUCKET"; else read -rp "Nome do bucket do B2 (ex.: filaproleads-backup-123456): " BUCKET; fi
  [[ "$BUCKET" =~ ^[a-zA-Z0-9-]{6,63}$ ]] || { echo "Nome de bucket inválido (só letras, números e hífen)."; exit 1; }
  if [ -n "${FILAPRO_EXT_KEYID:-}" ]; then KEYID="$FILAPRO_EXT_KEYID"; else read -rp "keyID da chave de aplicação (não é segredo): " KEYID; fi
  if [ -n "${FILAPRO_EXT_KEY:-}" ]; then KEY="$FILAPRO_EXT_KEY"; else echo "Cole a applicationKey (NÃO aparece na tela) e aperte Enter:"; read -rs KEY; echo; fi
  [ -n "$KEYID" ] && [ -n "$KEY" ] || { echo "keyID ou applicationKey vazios. Nada foi gravado."; exit 1; }
  redigir() { sed -e "s|$KEY|[CHAVE]|g" -e "s|$KEYID|[keyID]|g" | cut -c1-200; }
  TMPB="$(mktemp)"; trap 'rm -f "$TMPB" "${TMPC:-}"' EXIT
  printf '[filapro-b2]\ntype = b2\naccount = %s\nkey = %s\n' "$KEYID" "$KEY" > "$TMPB"
  echo "==> Testando a chave no B2 (leitura do bucket)"
  if ! OUT="$(R "$TMPB" lsf "filapro-b2:$BUCKET" --max-depth 1 2>&1 | head -5)" || echo "$OUT" | grep -qiE 'error|unauthorized|forbidden|failed|not found'; then
    echo "NÃO ACEITO: o B2 recusou a chave ou o bucket. Detalhe:"; echo "$OUT" | redigir
    echo "Confira: bucket certo, chave criada com acesso a ESSE bucket (Read and Write) e internet na VPS. Nada foi gravado."; exit 1
  fi
  echo "ACEITO: a chave abre o bucket."
  BASE_REMOTO="filapro-b2:$BUCKET"
else
  BASE_REMOTO="$LOCAL_TESTE"; TMPB="$(mktemp)"; trap 'rm -f "$TMPB" "${TMPC:-}"' EXIT; : > "$TMPB"
fi

# ---------------------------------------------------------------- 2. Senhas de criptografia
if $TROCAR; then
  OB1="$(awk -F' = ' '/^\[filapro-cripto\]/{s=1;next} /^\[/{s=0} s && $1=="password" {print $2}' "$CONF")"
  OB2="$(awk -F' = ' '/^\[filapro-cripto\]/{s=1;next} /^\[/{s=0} s && $1=="password2" {print $2}' "$CONF")"
  GERADAS=false
elif $RECUPERAR; then
  if [ -n "${FILAPRO_EXT_PASS1:-}" ]; then P1="$FILAPRO_EXT_PASS1"; P2="${FILAPRO_EXT_PASS2:-}"; else
    read -rsp "Digite a senha 1 de criptografia que você anotou: " P1; echo; read -rsp "Digite a senha 2: " P2; echo; fi
  [ -n "$P1" ] && [ -n "$P2" ] || { echo "Senhas vazias. Nada foi gravado."; exit 1; }
  OB1="$(rclone obscure "$P1")"; OB2="$(rclone obscure "$P2")"; unset P1 P2; GERADAS=false
else
  P1="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"; P2="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)"
  [ "${#P1}" -eq 32 ] && [ "${#P2}" -eq 32 ] || { echo "ERRO: não foi possível gerar as senhas."; exit 1; }
  OB1="$(rclone obscure "$P1")"; OB2="$(rclone obscure "$P2")"; GERADAS=true
fi

# ---------------------------------------------------------------- 3. Arquivo do rclone (temporário) + prova completa antes de valer
TMPC="$(mktemp)"
{ cat "$TMPB"
  printf '[filapro-cripto]\ntype = crypt\nremote = %s\nfilename_encryption = standard\ndirectory_name_encryption = false\npassword = %s\npassword2 = %s\n' "$BASE_REMOTO" "$OB1" "$OB2"
} > "$TMPC"
echo "==> Prova completa: criptografa, envia, confere e lê de volta um arquivo de teste"
PROVA_DIR="$(mktemp -d)"; echo "teste do backup externo $(date +%s)" > "$PROVA_DIR/teste-conexao-$(date +%Y-%m-%d_%H%M).txt"
if $RECUPERAR; then
  # No modo recuperação só há leitura (o servidor novo ainda não tem o que enviar): confere que a pasta responde
  if R "$TMPC" lsf filapro-cripto:diarios >/dev/null 2>&1; then echo "ACEITO: o bucket responde e as senhas foram gravadas."; else echo "NÃO ACEITO: não consegui ler o bucket com esses dados."; rm -rf "$PROVA_DIR"; exit 1; fi
else
  if R "$TMPC" copy "$PROVA_DIR" filapro-cripto:diarios --immutable >/dev/null 2>"$PROVA_DIR.err" \
     && R "$TMPC" cryptcheck "$PROVA_DIR" filapro-cripto:diarios --one-way >/dev/null 2>>"$PROVA_DIR.err"; then
    echo "ACEITO: o envio criptografado e a conferência funcionaram."
  else
    echo "NÃO ACEITO: o teste de envio falhou. Detalhe:"; { [ -n "${KEY:-}" ] && sed "s|$KEY|[CHAVE]|g" "$PROVA_DIR.err" || cat "$PROVA_DIR.err"; } | head -5 | cut -c1-200
    echo "A chave precisa ser do tipo Read and Write, restrita ao bucket. Nada foi gravado."; rm -rf "$PROVA_DIR" "$PROVA_DIR.err"; exit 1
  fi
fi
rm -rf "$PROVA_DIR" "$PROVA_DIR.err"

mkdir -p "$(dirname "$CONF")"; chmod 700 "$(dirname "$CONF")" 2>/dev/null || true
install -m 600 "$TMPC" "$CONF"
unset KEY
echo "Configuração gravada em $CONF (permissão 600)."
if $GERADAS; then
  echo
  echo "======== SENHAS DE CRIPTOGRAFIA DO BACKUP EXTERNO (aparecem só desta vez) ========"
  echo
  echo "    Senha 1:  $P1"
  echo "    Senha 2:  $P2"
  echo
  echo "=================================================================================="
  echo "1) ANOTE AGORA as DUAS no gerenciador de senhas, como \"FilaPro — backup externo (senha 1 e senha 2)\"."
  echo "2) NÃO tire print desta tela e NÃO cole as senhas no chat. SEM elas os backups do B2 não abrem."
  echo "3) Confira que anotou certo:  bash $0 --verificar-senhas"
  echo "4) Depois limpe a tela:  clear"
  unset P1 P2
fi
