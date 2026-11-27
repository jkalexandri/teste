#!/usr/bin/env bash
# Ensaio do desastre, de ponta a ponta (decisão #175 — Módulo 12, O8). Roda todo dia 1, às 05:30 (cron) — e pode ser rodado à mão.
# Faz, num banco e numa pasta TEMPORÁRIOS (apaga tudo no fim; NÃO toca no banco nem nos .env reais), o que você faria depois de perder a VPS:
#   1) baixa o backup mais recente do B2 (com as senhas de criptografia gravadas)   2) abre o pacote de chaves com a senha do backup e confere os .env
#   3) restaura o banco baixado num banco temporário e confere   4) confere o pacote de arquivos enviados
# Mede o tempo de cada passo (base do roteiro de desastre) e grava backups/estado-ensaio.json (o vigia avisa se falhar ou passar de 45 dias).
# Nenhum segredo é mostrado: dos .env só se confere se as variáveis EXISTEM e se a CHAVE_CRIPTO bate com a atual (por hash).
set -uo pipefail
umask 077
DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
PASTA="${FILAPRO_BACKUPS:-$RAIZ/backups}"
SENHA_ARQ="${FILAPRO_SENHA_ARQ:-/root/.filapro-backup-senha}"
CONF="${FILAPRO_RCLONE_CONF:-/root/.config/rclone/filapro-b2.conf}"
ESTADO="$PASTA/estado-ensaio.json"
ENV_WEB="$RAIZ/app/apps/web/.env.production"; ENV_WORKER="$RAIZ/app/apps/worker/.env"
ERROS=(); T0=$(date +%s); DATA=""; USU="?"; EMP="?"; T_BAIXAR=0; T_CHAVES=0; T_REST=0
erro() { ERROS+=("$1"); echo "ERRO: $1"; }
sem_aspas() { echo "$1" | tr -d '"\\' | tr '\n' ' '; }
mkdir -p "$PASTA"; chmod 700 "$PASTA" 2>/dev/null || true
TMP="$(mktemp -d "$RAIZ/ensaio.XXXXXX" 2>/dev/null || mktemp -d)"; chmod 700 "$TMP"
LOGTMP="$(mktemp)"
trap 'rm -rf "$TMP" "$LOGTMP"' EXIT
nome_valor() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }

finalizar() {
  local ok=true; [ "${#ERROS[@]}" -gt 0 ] && ok=false
  local total=$(( $(date +%s) - T0 ))
  printf '{"quando":"%s","ok":%s,"duracao_s":%s,"baixar_s":%s,"chaves_s":%s,"restaurar_s":%s,"backup":"%s","usuarios":"%s","empresas":"%s","erros":"%s"}\n' \
    "$(date '+%Y-%m-%dT%H:%M:%S')" "$ok" "$total" "$T_BAIXAR" "$T_CHAVES" "$T_REST" "$DATA" "$USU" "$EMP" "$(sem_aspas "${ERROS[*]:-}")" > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
  if $ok; then echo "Ensaio do desastre CONCLUÍDO com sucesso em ${total}s (baixar ${T_BAIXAR}s, chaves ${T_CHAVES}s, restaurar ${T_REST}s). Nada real foi alterado."; exit 0; fi
  echo "Ensaio do desastre terminou COM PROBLEMAS (${#ERROS[@]}) em ${total}s. Nada real foi alterado."; exit 1
}

[ -f "$CONF" ] || { erro "a cópia externa (B2) não está configurada: sem ela não há o que ensaiar (bash deploy/backup-externo-config.sh)"; finalizar; }
[ -f "$SENHA_ARQ" ] || erro "a senha do backup ($SENHA_ARQ) não existe: o pacote de chaves não abriria"

# ---------------------------------------------------------------- 1. Baixar do B2
echo "==> 1/4 Baixando o backup mais recente do B2"
S=$(date +%s)
if bash "$DIR/backup-externo.sh" --baixar --destino "$TMP/baixado" > "$LOGTMP" 2>&1; then
  DATA="$(ls -1 "$TMP/baixado"/banco-*.sql.gz 2>/dev/null | head -1 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}')"
  echo "Backup de $DATA baixado do B2 e conferido (abre)."
else
  erro "não consegui baixar do B2: $(grep -E '^ERRO' "$LOGTMP" | head -1 | cut -c1-160)"
fi
T_BAIXAR=$(( $(date +%s) - S ))
[ -n "$DATA" ] || finalizar

# ---------------------------------------------------------------- 2. Chaves
echo "==> 2/4 Abrindo o pacote de chaves com a senha do backup"
S=$(date +%s)
ENC="$TMP/baixado/chaves-$DATA.tar.gz.enc"
if [ ! -f "$ENC" ]; then erro "o pacote de chaves de $DATA não veio do B2"
elif [ ! -f "$SENHA_ARQ" ]; then :
else
  mkdir -p "$TMP/chaves"
  if openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$SENHA_ARQ" -in "$ENC" 2>/dev/null | tar -xz -C "$TMP/chaves" 2>/dev/null && [ -f "$TMP/chaves/web/.env.production" ] && [ -f "$TMP/chaves/worker/.env" ]; then
    echo "Pacote de chaves aberto: os dois .env estão lá."
    for v in DATABASE_URL CRON_SECRET WORKER_TOKEN CHAVE_CRIPTO; do [ -n "$(nome_valor "$TMP/chaves/web/.env.production" "$v")" ] || erro "o .env do site recuperado não tem $v"; done
    for v in DATABASE_URL WORKER_TOKEN CHAVE_CRIPTO; do [ -n "$(nome_valor "$TMP/chaves/worker/.env" "$v")" ] || erro "o .env do serviço recuperado não tem $v"; done
    # A CHAVE_CRIPTO recuperada precisa ser a atual: é ela que abre o login do WhatsApp, as chaves da IA e os segredos do 2FA no banco
    if [ -f "$ENV_WEB" ]; then
      A="$(nome_valor "$TMP/chaves/web/.env.production" CHAVE_CRIPTO | sha256sum | cut -c1-16)"; B="$(nome_valor "$ENV_WEB" CHAVE_CRIPTO | sha256sum | cut -c1-16)"
      if [ "$A" = "$B" ]; then echo "A CHAVE_CRIPTO do backup é a mesma da VPS atual."; else erro "a CHAVE_CRIPTO do backup é DIFERENTE da atual: um banco restaurado não abriria os dados criptografados"; fi
    fi
    [ "$(nome_valor "$TMP/chaves/web/.env.production" WORKER_TOKEN | sha256sum)" = "$(nome_valor "$ENV_WEB" WORKER_TOKEN 2>/dev/null | sha256sum)" ] || echo "Aviso: o WORKER_TOKEN do backup difere do atual (normal se foi trocado depois do último backup diário)."
  else erro "não consegui abrir o pacote de chaves (senha do backup diferente da usada na época?) ou faltam os .env dentro dele"; fi
fi
T_CHAVES=$(( $(date +%s) - S ))

# ---------------------------------------------------------------- 3. Banco
echo "==> 3/4 Restaurando o banco baixado num banco temporário"
S=$(date +%s)
if bash "$DIR/restaurar-backup.sh" --so-testar "$TMP/baixado/banco-$DATA.sql.gz" > "$LOGTMP" 2>&1 && grep -q 'Teste de restauração concluído com sucesso' "$LOGTMP"; then
  L="$(grep 'Restauração de teste OK' "$LOGTMP" | head -1)"; echo "$L"
  USU="$(echo "$L" | grep -oE '[0-9]+ usuários' | grep -oE '[0-9]+')"; EMP="$(echo "$L" | grep -oE '[0-9]+ empresas' | grep -oE '[0-9]+')"
elif grep -q 'ignorada' "$LOGTMP"; then erro "há um backup ou restauração rodando agora; o ensaio do banco foi ignorado (tente de novo mais tarde)"
else erro "o banco baixado do B2 NÃO restaurou: $(grep -E '^ERRO' "$LOGTMP" | head -1 | cut -c1-160)"; fi
T_REST=$(( $(date +%s) - S ))

# ---------------------------------------------------------------- 4. Arquivos enviados
echo "==> 4/4 Conferindo o pacote de arquivos enviados"
PA="$TMP/baixado/arquivos-$DATA.tar.gz"
if [ -f "$PA" ] && tar -tzf "$PA" >/dev/null 2>&1; then echo "Pacote de arquivos abre: $(tar -tzf "$PA" | grep -vc '/$') arquivo(s)."
else erro "o pacote de arquivos enviados não veio do B2 ou não abre"; fi

finalizar
