#!/usr/bin/env bash
# Testa deploy/ensaio-desastre.sh (decisão #175) de ponta a ponta numa "VPS falsa": backup completo -> envio criptografado (pasta local no lugar do B2) -> ensaio.
# Uso: bash scripts/teste-ensaio-desastre.sh   (precisa do Postgres de teste no ar com o banco "filapro", rclone, openssl e flock)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
R=/tmp/en-raiz; B="$R/backups"; DEST=/tmp/en-destino; CONF=/tmp/en-rclone.conf; SENHA=/tmp/en-senha; LOG=/tmp/en-saidas.txt; : > "$LOG"
PGB="-h /var/tmp -p 5433 -U postgres"; PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
pgx() { psql $PGB -qtA -d postgres -c "$1" 2>/dev/null; }
S_CRIPTO="CHAVECRIPTO_SEGREDO_AAA111"; S_TOKEN="WORKERTOKEN_SEGREDO_BBB222"; S_CRON="CRONSECRET_SEGREDO_CCC333"
pgx "DROP DATABASE IF EXISTS bkr_en" >/dev/null; pgx "DROP DATABASE IF EXISTS bkr_en_teste_restauracao" >/dev/null; pgx "CREATE DATABASE bkr_en" >/dev/null
pg_dump $PGB --no-owner filapro | psql $PGB -q -d bkr_en >/dev/null 2>&1
rm -rf "$R" "$DEST" "$CONF" "$SENHA" /tmp/en.lock; mkdir -p "$R/app/apps/web" "$R/app/apps/worker" "$R/arquivos" "$DEST"
echo "SenhaDoBackup@Teste-123" > "$SENHA"; chmod 600 "$SENHA"
echo "arquivo do cliente" > "$R/arquivos/a.png"
env_web() { printf 'DATABASE_URL="postgresql://u:p@localhost/db"\n%sWORKER_TOKEN="%s"\nCHAVE_CRIPTO="%s"\n' "${1-CRON_SECRET=\"$S_CRON\"
}" "$S_TOKEN" "$S_CRIPTO" > "$R/app/apps/web/.env.production"; }
env_web
printf 'DATABASE_URL="postgresql://u:p@localhost/db"\nWORKER_TOKEN="%s"\nCHAVE_CRIPTO="%s"\nPASTA_ARQUIVOS=%s/arquivos\n' "$S_TOKEN" "$S_CRIPTO" "$R" > "$R/app/apps/worker/.env"
export FILAPRO_RAIZ="$R" FILAPRO_BANCO=bkr_en FILAPRO_PGDUMP="pg_dump $PGB" FILAPRO_PSQL="psql $PGB" FILAPRO_SENHA_ARQ="$SENHA" FILAPRO_LOCK=/tmp/en.lock FILAPRO_LOCK_ESPERA=2 FILAPRO_RCLONE_CONF="$CONF"
bkp() { FILAPRO_AGORA="$1" bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1; bash "$D/backup-externo.sh" >> "$LOG" 2>&1; }
ens() { bash "$D/ensaio-desastre.sh" 2>&1 | tee -a "$LOG"; return "${PIPESTATUS[0]}"; }
j() { grep -o "\"$1\":\"\?[^,\"}]*" "$B/estado-ensaio.json" | head -1 | sed -E 's/^[^:]*:"?//'; }

# ---- 0. Sem cópia externa configurada
OUT=$(ens); RC=$?
t "Sem a cópia externa configurada: o ensaio falha com mensagem clara e registra ok:false" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'não está configurada' && grep -q '"ok":false' "$B/estado-ensaio.json" && echo 1)"
FILAPRO_EXT_LOCAL="$DEST" bash "$D/backup-externo-config.sh" >> /tmp/en-cfg.txt 2>&1
bkp "2026-11-25 03:30"
t "Preparação: backup completo feito e enviado ao destino criptografado" "$([ -n "$(ls "$B"/diarios/banco-*.sql.gz 2>/dev/null)" ] && [ "$(find "$DEST" -type f | wc -l)" -ge 3 ] && echo 1)"

# ---- 1. Ensaio completo com sucesso
OUT=$(ens); RC=$?
t "Ensaio completo: termina com sucesso (código 0)" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q 'CONCLUÍDO com sucesso' && echo 1)" "$OUT"
t "O estado registra ok:true, a data do backup, usuários, empresas e os tempos" "$(grep -q '"ok":true' "$B/estado-ensaio.json" && [ "$(j backup)" = 2026-11-25_0330 ] && [ "$(j usuarios)" -ge 1 ] && grep -qE '"duracao_s":[0-9]+' "$B/estado-ensaio.json" && grep -q '"baixar_s"' "$B/estado-ensaio.json" && grep -q '"restaurar_s"' "$B/estado-ensaio.json" && echo 1)" "$(cat "$B/estado-ensaio.json")"
t "Cada passo aparece na saída (1/4 a 4/4) e a CHAVE_CRIPTO do backup bate com a atual" "$(echo "$OUT" | grep -q '1/4' && echo "$OUT" | grep -q '4/4' && echo "$OUT" | grep -q 'mesma da VPS atual' && echo 1)"
t "Limpeza: nenhuma pasta de ensaio, nenhum banco temporário e o banco 'real' intacto" "$([ -z "$(ls -d "$R"/ensaio.* 2>/dev/null)" ] && [ -z "$(pgx "select 1 from pg_database where datname='bkr_en_teste_restauracao'")" ] && [ -n "$(pgx "select 1 from pg_database where datname='bkr_en'")" ] && echo 1)"
t "Os .env reais não foram tocados (continuam com os mesmos segredos)" "$(grep -q "$S_CRIPTO" "$R/app/apps/web/.env.production" && grep -q "$S_CRIPTO" "$R/app/apps/worker/.env" && echo 1)"
t "O ensaio NÃO mexe no estado do teste semanal de restauração" "$([ ! -f "$B/estado-restauracao.json" ] && echo 1)"
t "Permissão 600 no estado" "$([ "$(stat -c %a "$B/estado-ensaio.json")" = 600 ] && echo 1)"

# ---- 2. A CHAVE_CRIPTO da VPS mudou depois do backup: o ensaio acusa
cp "$R/app/apps/web/.env.production" /tmp/en-web.bak; sed -i "s/$S_CRIPTO/OUTRA_CHAVE_CRIPTO_ZZZ999/" "$R/app/apps/web/.env.production"
OUT=$(ens); RC=$?
t "CHAVE_CRIPTO atual diferente da do backup: FALHA clara (o banco restaurado não abriria os dados criptografados)" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'DIFERENTE da atual' && grep -q '"ok":false' "$B/estado-ensaio.json" && echo 1)"
cp /tmp/en-web.bak "$R/app/apps/web/.env.production"

# ---- 3. O backup tem um .env sem variável obrigatória
env_web ""; bkp "2026-11-26 03:30"
OUT=$(ens); RC=$?
t "Backup cujo .env não tem CRON_SECRET: FALHA dizendo qual variável falta" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'não tem CRON_SECRET' && echo 1)"
env_web; bkp "2026-11-27 03:30"; OUT=$(ens); t "Com um backup novo e completo, o ensaio volta a passar" "$([ $? -eq 0 ] && [ "$(j backup)" = 2026-11-27_0330 ] && echo 1)"

# ---- 4. Senha do backup diferente da usada na época
cp "$SENHA" /tmp/en-senha.bak; echo "OutraSenha@Qualquer-999" > "$SENHA"
OUT=$(ens); RC=$?
t "Senha do backup diferente: FALHA ao abrir o pacote de chaves (e o resto do ensaio continua)" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'não consegui abrir o pacote de chaves' && echo "$OUT" | grep -q '3/4' && echo 1)"
cp /tmp/en-senha.bak "$SENHA"

# ---- 5. Backup corrompido no destino
ALVO="$(find "$DEST/diarios" -type f -printf '%s %p\n' | sort -rn | head -1 | cut -d' ' -f2-)"; cp "$ALVO" /tmp/en-alvo.bak
python3 - "$ALVO" <<'PY'
import sys
p=sys.argv[1]; b=bytearray(open(p,'rb').read()); b[len(b)//2]^=0xFF; b[len(b)//2+1]^=0xFF; open(p,'wb').write(b)
PY
OUT=$(ens); RC=$?
t "Arquivo corrompido no destino: o ensaio FALHA (não finge que está tudo bem)" "$([ $RC -eq 1 ] && grep -q '"ok":false' "$B/estado-ensaio.json" && echo 1)" "$OUT"
cp /tmp/en-alvo.bak "$ALVO"

# ---- 6. Restauração ocupada e destino sem nada
( exec 9>/tmp/en.lock; flock -n 9 && sleep 6 ) & sleep 1
OUT=$(ens); RC=$?; wait
t "Backup/restauração em andamento (bloqueio ocupado): falha avisando que foi ignorado, sem fingir sucesso" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'ignorado' && echo 1)" "$OUT"
rm -rf "$DEST"/diarios; mkdir -p "$DEST/diarios"
OUT=$(ens); RC=$?; t "Nada no destino: FALHA (não encontrou backup)" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'não consegui baixar' && echo 1)"

# ---- 7. Segurança
t "Nenhuma saída nem o estado traz segredos (chave, token, cron, senha)" "$(grep -rqE "$S_CRIPTO|$S_TOKEN|$S_CRON|SenhaDoBackup|OUTRA_CHAVE" "$LOG" "$B/estado-ensaio.json" && echo 0 || echo 1)"
t "Depois de todos os cenários, nada de ensaio ficou sobrando (pastas e bancos temporários)" "$([ -z "$(ls -d "$R"/ensaio.* 2>/dev/null)" ] && [ -z "$(pgx "select 1 from pg_database where datname='bkr_en_teste_restauracao'")" ] && echo 1)"
pgx "DROP DATABASE IF EXISTS bkr_en" >/dev/null; rm -rf "$R" "$DEST" "$CONF" "$SENHA" /tmp/en-* /tmp/en.lock
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
