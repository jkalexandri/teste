#!/usr/bin/env bash
# Testa deploy/backup-completo.sh, backup-banco.sh e backup-senha.sh numa "VPS falsa" com o banco de teste real (porta 5433).
# Uso: bash scripts/teste-backup.sh   (precisa do Postgres de teste no ar, de pg_dump, openssl e flock)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
R=/tmp/bk-raiz
SENHA_ARQ=/tmp/bk-senha
SENHA="SenhaDeTeste@2026-xyz"
SEG1="SEGREDO_FALSO_CRIPTO_9f8e7d6c5b4a"; SEG2="TOKEN_FALSO_WORKER_zzzz1111"
LOG=/tmp/bk-saidas.txt; : > "$LOG"
PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
rm -rf "$R" "$SENHA_ARQ" /tmp/bk.lock
mkdir -p "$R/app/apps/web" "$R/app/apps/worker" "$R/arquivos/sub"
printf 'CHAVE_CRIPTO="%s"\nWORKER_TOKEN="%s"\n' "$SEG1" "$SEG2" > "$R/app/apps/web/.env.production"
printf 'CHAVE_CRIPTO="%s"\nWORKER_TOKEN="%s"\nPASTA_ARQUIVOS=%s/arquivos\n' "$SEG1" "$SEG2" "$R" > "$R/app/apps/worker/.env"
echo "conteudo a" > "$R/arquivos/a.png"; echo "conteudo b" > "$R/arquivos/sub/b.pdf"
export FILAPRO_RAIZ="$R" FILAPRO_BANCO=filapro FILAPRO_PGDUMP="pg_dump -h /var/tmp -p 5433 -U postgres" FILAPRO_SENHA_ARQ="$SENHA_ARQ" FILAPRO_LOCK=/tmp/bk.lock
B="$R/backups"
cnt() { ls -1 $1 2>/dev/null | wc -l; }

# ---- 0. Sem senha configurada: banco e arquivos ficam, chaves falham, resultado "com problemas"
bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1; RC=$?
t "Sem a senha: o backup termina COM PROBLEMAS (código 1)" "$([ $RC -eq 1 ] && echo 1)" "rc=$RC"
t "Sem a senha: banco e arquivos foram salvos mesmo assim" "$([ "$(cnt "$B/diarios/banco-*.sql.gz")" = 1 ] && [ "$(cnt "$B/diarios/arquivos-*.tar.gz")" = 1 ] && echo 1)"
t "Sem a senha: nenhum pacote de chaves foi criado" "$([ "$(cnt "$B/diarios/chaves-*")" = 0 ] && echo 1)"
t "Sem a senha: o estado diz ok:false e explica" "$(grep -q '"ok":false' "$B/estado-completo.json" && grep -q 'senha do backup' "$B/estado-completo.json" && echo 1)"

# ---- 1. Senha: recusa errada/curta, aceita boa, nunca imprime
printf 'AAAAAAAAAAAAAA\nBBBBBBBBBBBBBB\n' | bash "$D/backup-senha.sh" >> "$LOG" 2>&1; RC=$?
t "Senha: duas digitações diferentes são recusadas" "$([ $RC -ne 0 ] && [ ! -f "$SENHA_ARQ" ] && echo 1)"
printf 'curta\ncurta\n' | bash "$D/backup-senha.sh" >> "$LOG" 2>&1; RC=$?
t "Senha: senha curta é recusada" "$([ $RC -ne 0 ] && [ ! -f "$SENHA_ARQ" ] && echo 1)"
OUT=$(printf '%s\n%s\n' "$SENHA" "$SENHA" | bash "$D/backup-senha.sh" 2>&1); RC=$?
echo "$OUT" >> "$LOG"
t "Senha: a boa é gravada com permissão 600 e testada" "$([ $RC -eq 0 ] && [ "$(stat -c %a "$SENHA_ARQ")" = 600 ] && echo 1)"
t "Senha: a tela NÃO repete a senha" "$(echo "$OUT" | grep -qF "$SENHA" && echo 0 || echo 1)"
bash "$D/backup-senha.sh" --conferir > /dev/null 2>&1; t "Senha: --conferir confirma que existe" "$([ $? -eq 0 ] && echo 1)"
bash "$D/backup-senha.sh" > /dev/null 2>&1 < /dev/null; t "Senha: rodar de novo sem --trocar não sobrescreve" "$([ $? -ne 0 ] && echo 1)"

# ---- 2. Backup completo: peças, permissões (mesmo com umask 022 do chamador), conferência, criptografia
rm -rf "$B"
( umask 022; AGORA_DUMMY=1 FILAPRO_AGORA="2026-11-25 03:30" bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1 ); RC=$?
t "Completo: termina com sucesso (código 0)" "$([ $RC -eq 0 ] && echo 1)" "rc=$RC"
t "Completo: criou banco, arquivos e chaves" "$([ -f "$B/diarios/banco-2026-11-25_0330.sql.gz" ] && [ -f "$B/diarios/arquivos-2026-11-25_0330.tar.gz" ] && [ -f "$B/diarios/chaves-2026-11-25_0330.tar.gz.enc" ] && echo 1)"
PERM_OK=1; for d in "$B" "$B"/diarios "$B"/semanais "$B"/mensais "$B"/6h; do [ "$(stat -c %a "$d")" = 700 ] || PERM_OK=0; done
for f in "$B"/diarios/* "$B"/estado-completo.json; do [ "$(stat -c %a "$f")" = 600 ] || PERM_OK=0; done
t "Completo: pastas 700 e arquivos 600 (mesmo com umask 022 de quem chamou)" "$PERM_OK"
t "Completo: estado-completo.json com ok:true e tabelas" "$(grep -q '"ok":true' "$B/estado-completo.json" && grep -qE '"tabelas":[1-9]' "$B/estado-completo.json" && echo 1)"
t "Completo: o pacote de arquivos tem os 2 arquivos" "$([ "$(tar -tzf "$B/diarios/arquivos-2026-11-25_0330.tar.gz" | grep -vc '/$')" = 2 ] && echo 1)"
LISTA=$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$SENHA_ARQ" -in "$B/diarios/chaves-2026-11-25_0330.tar.gz.enc" 2>/dev/null | tar -tz 2>/dev/null | tr '\n' ' ')
t "Chaves: abrem com a senha certa e trazem os dois .env" "$(echo "$LISTA" | grep -q 'web/.env.production' && echo "$LISTA" | grep -q 'worker/.env' && echo 1)" "$LISTA"
printf 'senha-errada-qualquer\n' > /tmp/bk-senha-errada
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:/tmp/bk-senha-errada -in "$B/diarios/chaves-2026-11-25_0330.tar.gz.enc" 2>/dev/null | tar -tz > /dev/null 2>&1
t "Chaves: NÃO abrem com a senha errada" "$([ $? -ne 0 ] && echo 1)"
t "Chaves: o arquivo criptografado não contém os segredos em texto" "$(grep -c -a -E "$SEG1|$SEG2|CHAVE_CRIPTO" "$B/diarios/chaves-2026-11-25_0330.tar.gz.enc" | grep -q '^0$' && echo 1)"

# ---- 3. Camadas e retenção (datas simuladas, retenção pequena): 25/11 a 07/12; domingos 29/11 e 06/12; dia 1 = 01/12
export FILAPRO_RET_DIARIOS=3 FILAPRO_RET_SEMANAIS=1 FILAPRO_RET_MENSAIS=1
for dia in 26 27 28 29 30; do FILAPRO_AGORA="2026-11-$dia 03:30" bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1; done
for dia in 01 02 03 04 05 06 07; do FILAPRO_AGORA="2026-12-$dia 03:30" bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1; done
t "Retenção: os diários ficam nos 3 mais recentes (banco, arquivos e chaves)" "$([ "$(cnt "$B/diarios/banco-*.sql.gz")" = 3 ] && [ "$(cnt "$B/diarios/arquivos-*.tar.gz")" = 3 ] && [ "$(cnt "$B/diarios/chaves-*.enc")" = 3 ] && ls "$B/diarios" | grep -q '2026-12-07' && ! ls "$B/diarios" | grep -q '2026-12-03' && echo 1)"
t "Camadas: a cópia semanal vem do domingo (06/12) e as anteriores saem" "$(ls "$B/semanais" | grep -q 'banco-2026-12-06' && ! ls "$B/semanais" | grep -q '2026-11-29' && [ "$(cnt "$B/semanais/banco-*")" = 1 ] && echo 1)"
t "Camadas: a cópia mensal vem do dia 1 (01/12)" "$(ls "$B/mensais" | grep -q 'banco-2026-12-01' && [ "$(cnt "$B/mensais/banco-*")" = 1 ] && echo 1)"
t "Camadas: semanais e mensais trazem também arquivos e chaves" "$([ "$(cnt "$B/semanais/arquivos-*")" = 1 ] && [ "$(cnt "$B/semanais/chaves-*")" = 1 ] && [ "$(cnt "$B/mensais/arquivos-*")" = 1 ] && [ "$(cnt "$B/mensais/chaves-*")" = 1 ] && echo 1)"

# ---- 4. Falha do banco: nada é apagado do banco, nada fica pela metade
ANTES=$(cnt "$B/diarios/banco-*.sql.gz")
FILAPRO_PGDUMP=false FILAPRO_AGORA="2026-12-08 03:30" bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1; RC=$?
t "Falha do pg_dump: termina com problemas (código 1)" "$([ $RC -eq 1 ] && echo 1)"
t "Falha do pg_dump: os backups do banco existentes continuam (nenhum foi apagado)" "$([ "$(cnt "$B/diarios/banco-*.sql.gz")" = "$ANTES" ] && echo 1)"
t "Falha do pg_dump: não sobrou arquivo temporário" "$([ -z "$(find "$B" -name '*.tmp')" ] && echo 1)"
t "Falha do pg_dump: estado ok:false e a mensagem diz o que houve" "$(grep -q '"ok":false' "$B/estado-completo.json" && grep -q 'pg_dump falhou' "$B/estado-completo.json" && echo 1)"

# ---- 5. Banco "vazio/pequeno demais" é recusado
FILAPRO_MIN_BYTES=999999999 bash "$D/backup-banco.sh" "$B/diarios" banco >> "$LOG" 2>&1; RC=$?
t "Backup pequeno demais é recusado e não é guardado" "$([ $RC -ne 0 ] && [ -z "$(find "$B" -name '*.tmp')" ] && [ "$(cnt "$B/diarios/banco-*.sql.gz")" = "$ANTES" ] && echo 1)"

# ---- 6. Espaço insuficiente
ANTES=$(find "$B" -type f | wc -l)
FILAPRO_LIVRE_MIN_KB=999999999999 FILAPRO_AGORA="2026-12-09 03:30" bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1; RC=$?
t "Espaço insuficiente: recusa com mensagem e não cria nada" "$([ $RC -eq 1 ] && grep -q 'espaço livre insuficiente' "$LOG" && [ "$(find "$B" -type f | wc -l)" = "$ANTES" ] && echo 1)"

# ---- 7. Duas execuções ao mesmo tempo
( exec 9>/tmp/bk.lock; flock -n 9; sleep 4 ) &
sleep 1
OUT=$(bash "$D/backup-completo.sh" completo 2>&1); RC=$?
echo "$OUT" >> "$LOG"
t "Execução simultânea: a segunda é ignorada com aviso (código 0)" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q 'Já há um backup rodando' && echo 1)"
wait

# ---- 8. Modo banco (a cada 6 horas)
for h in 09 15 21 03; do FILAPRO_RET_6H=2 FILAPRO_AGORA="2026-12-10 $h:30" bash "$D/backup-completo.sh" banco >> "$LOG" 2>&1; done
t "Modo banco: só o banco, guardando os 2 mais recentes" "$([ "$(cnt "$B/6h/banco-*.sql.gz")" = 2 ] && grep -q '"modo":"banco"' "$B/estado-banco.json" && grep -q '"ok":true' "$B/estado-banco.json" && echo 1)"

# ---- 9. Chamada do atualizar.sh (sem argumentos): prefixo filapro, 10 mais recentes, protegido
for i in $(seq 1 12); do touch "$B/filapro-2026-01-$(printf '%02d' $i)_0000.sql.gz"; done
( umask 022; bash "$D/backup-banco.sh" >> "$LOG" 2>&1 ); RC=$?
NOVO=$(ls -1 "$B"/filapro-*.sql.gz | sort -r | head -1)
t "Atualizar.sh: o backup do banco sem argumentos guarda os 10 mais recentes" "$([ $RC -eq 0 ] && [ "$(cnt "$B/filapro-*.sql.gz")" = 10 ] && echo 1)"
t "Atualizar.sh: o backup novo tem permissão 600" "$([ "$(stat -c %a "$NOVO")" = 600 ] && echo 1)"
t "Atualizar.sh: o arquivo mais recente continua achável como antes (ls | sort)" "$(gunzip -t "$NOVO" 2>/dev/null && echo 1)"

# ---- 10. Vazamento: nenhuma saída pode conter segredo ou senha
t "Vazamento: nenhuma saída dos scripts contém os segredos nem a senha do backup" "$(grep -q -F -e "$SEG1" -e "$SEG2" -e "$SENHA" "$LOG" && echo 0 || echo 1)"

echo "--------"; echo "passaram: $PASS | falharam: $FAIL"
