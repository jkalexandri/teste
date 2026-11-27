#!/usr/bin/env bash
# Testa deploy/restaurar-backup.sh (decisão #170) numa "VPS falsa" com o banco de teste real (porta 5433).
# Uso: bash scripts/teste-restauracao.sh   (precisa do Postgres de teste no ar com o banco "filapro" de demonstração)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
R=/tmp/rs-raiz; SENHA_ARQ=/tmp/rs-senha; LOG=/tmp/rs-saidas.txt; : > "$LOG"
PGB="-h /var/tmp -p 5433 -U postgres"
PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
q() { psql $PGB -qtA -d "${2:-bkr_vivo}" -c "$1" 2>/dev/null; }
pgx() { psql $PGB -qtA -d postgres -c "$1" 2>/dev/null; }

# ---- Preparação: banco "vivo" falso copiado do banco de teste, dono de teste e VPS falsa
pgx "DROP DATABASE IF EXISTS bkr_vivo" >/dev/null; pgx "DROP DATABASE IF EXISTS bkr_vivo_teste_restauracao" >/dev/null
for b in $(pgx "select datname from pg_database where datname like 'bkr_vivo_antes_%' or datname like 'bkr_vivo_restauracao_falha_%'"); do pgx "DROP DATABASE \"$b\"" >/dev/null; done
pgx "DROP ROLE IF EXISTS bkr_dono" >/dev/null 2>&1; pgx "CREATE ROLE bkr_dono" >/dev/null
pgx "CREATE DATABASE bkr_vivo" >/dev/null
pg_dump $PGB --no-owner filapro | psql $PGB -q -d bkr_vivo >/dev/null 2>&1
rm -rf "$R" "$SENHA_ARQ" /tmp/rs.lock /tmp/rs-pm2.log /tmp/rs-migrar.log
mkdir -p "$R/app/apps/web" "$R/app/apps/worker" "$R/arquivos/sub"
printf 'CHAVE_CRIPTO="SEGREDO_FALSO_RS_123456"\n' > "$R/app/apps/web/.env.production"
printf 'CHAVE_CRIPTO="SEGREDO_FALSO_RS_123456"\nPASTA_ARQUIVOS=%s/arquivos\n' "$R" > "$R/app/apps/worker/.env"
echo "conteudo a" > "$R/arquivos/a.png"; echo "conteudo b" > "$R/arquivos/sub/b.pdf"
echo "SenhaDeTeste@2026-xyz" > "$SENHA_ARQ"; chmod 600 "$SENHA_ARQ"
printf '#!/bin/bash\necho "$@" >> /tmp/rs-pm2.log\n' > /tmp/rs-pm2.sh; chmod +x /tmp/rs-pm2.sh
printf '#!/bin/bash\necho migrou >> /tmp/rs-migrar.log\n' > /tmp/rs-migrar.sh; chmod +x /tmp/rs-migrar.sh
export FILAPRO_RAIZ="$R" FILAPRO_BANCO=bkr_vivo FILAPRO_DONO=bkr_dono FILAPRO_SENHA_ARQ="$SENHA_ARQ" FILAPRO_LOCK=/tmp/rs.lock
export FILAPRO_PGDUMP="pg_dump $PGB" FILAPRO_PSQL="psql $PGB" FILAPRO_PM2=/tmp/rs-pm2.sh FILAPRO_MIGRAR_CMD=/tmp/rs-migrar.sh FILAPRO_SAUDE_CMD=true
B="$R/backups"
bash "$D/backup-completo.sh" completo >> "$LOG" 2>&1
BK="$(ls -1 "$B"/diarios/banco-*.sql.gz | head -1)"
t "Preparação: backup completo de teste criado" "$([ -f "$BK" ] && echo 1)"
U0="$(q 'select count(*) from "Usuario"')"; E0="$(q 'select count(*) from "Empresa"')"
t "Preparação: banco vivo falso tem usuários" "$([ "${U0:-0}" -gt 0 ] && echo 1)" "usuarios=$U0"
rest() { bash "$D/restaurar-backup.sh" "$@" >> "$LOG" 2>&1; }
sem_temp() { [ -z "$(pgx "select 1 from pg_database where datname='bkr_vivo_teste_restauracao'")" ]; }

# ---- 1. Backups ruins: o banco atual NUNCA é tocado
head -c 3000 "$BK" > "$R/corrompido.sql.gz"
rest "$R/corrompido.sql.gz" <<< "RESTAURAR"; RC=$?
t "Backup corrompido: recusa (código 1)" "$([ $RC -eq 1 ] && echo 1)" "rc=$RC"
t "Backup corrompido: banco atual intacto e sem banco temporário" "$([ "$(q 'select count(*) from "Usuario"')" = "$U0" ] && sem_temp && echo 1)"
printf 'x' | gzip > "$R/pequeno.sql.gz"; rest "$R/pequeno.sql.gz" <<< "RESTAURAR"; RC=$?
t "Backup minúsculo: recusa" "$([ $RC -eq 1 ] && echo 1)"
head -c 20000 /dev/urandom | base64 | gzip > "$R/sem-tabelas.sql.gz"; rest "$R/sem-tabelas.sql.gz" <<< "RESTAURAR"; RC=$?
t "Arquivo sem nenhuma tabela: recusa" "$([ $RC -eq 1 ] && grep -q 'nenhuma tabela' "$LOG" && echo 1)"
# SQL quebrado no meio (tem tabelas, mas não carrega)
( gunzip -c "$BK" | sed '0,/^COPY public\./s//COPY public.TABELA_QUE_NAO_EXISTE_XYZ /' | gzip > "$R/quebrado.sql.gz" )
rest "$R/quebrado.sql.gz" <<< "RESTAURAR"; RC=$?
t "SQL que não carrega: recusa e diz que o banco atual está intacto" "$([ $RC -eq 1 ] && grep -q 'NÃO restaura' "$LOG" && [ "$(q 'select count(*) from "Usuario"')" = "$U0" ] && sem_temp && echo 1)"
# Backup de outro sistema (tem tabela, mas não tem Usuario)
pgx "DROP DATABASE IF EXISTS bkr_outro" >/dev/null; pgx "CREATE DATABASE bkr_outro" >/dev/null
q "create table coisa(id int); insert into coisa select generate_series(1,2000)" bkr_outro >/dev/null
pg_dump $PGB --no-owner bkr_outro | gzip > "$R/outro.sql.gz"; pgx "DROP DATABASE bkr_outro" >/dev/null
FILAPRO_MIN_BYTES=10 rest "$R/outro.sql.gz" <<< "RESTAURAR"; RC=$?
t "Backup de outro sistema (sem tabela de usuários): recusa" "$([ $RC -eq 1 ] && grep -q 'não parece um backup do FilaPro' "$LOG" && echo 1)"
t "Nenhuma recusa deixou serviço parado nem dump de segurança" "$([ ! -f /tmp/rs-pm2.log ] && [ -z "$(ls "$B"/seguranca 2>/dev/null)" ] && echo 1)"

# ---- 2. Teste de restauração semanal
rest --so-testar; RC=$?
t "Teste semanal: sucesso e banco temporário apagado" "$([ $RC -eq 0 ] && sem_temp && echo 1)"
t "Teste semanal: estado-restauracao.json ok:true com usuários e empresas" "$(grep -q '"ok":true' "$B/estado-restauracao.json" && grep -q "\"usuarios\":\"$U0\"" "$B/estado-restauracao.json" && grep -q "\"empresas\":\"$E0\"" "$B/estado-restauracao.json" && echo 1)" "$(cat "$B/estado-restauracao.json" 2>/dev/null)"
t "Teste semanal: banco atual intacto e serviços não paradas" "$([ "$(q 'select count(*) from "Usuario"')" = "$U0" ] && [ ! -f /tmp/rs-pm2.log ] && echo 1)"
rest --so-testar "$R/corrompido.sql.gz"
t "Teste de arquivo específico NÃO mexe no estado semanal" "$(grep -q '"ok":true' "$B/estado-restauracao.json" && echo 1)"
cp "$BK" "$R/bom-copia.sql.gz"
mv "$B/diarios" "$B/diarios-off"; mkdir "$B/diarios"; rest --so-testar; RC=$?
t "Teste semanal sem nenhum backup: falha e registra ok:false" "$([ $RC -eq 1 ] && grep -q '"ok":false' "$B/estado-restauracao.json" && echo 1)"
rmdir "$B/diarios"; mv "$B/diarios-off" "$B/diarios"
rest --so-testar; t "Teste semanal volta a registrar ok:true" "$(grep -q '"ok":true' "$B/estado-restauracao.json" && echo 1)"

# ---- 3. Restauração: confirmação errada, cancelamento, menu
q "delete from \"Usuario\" where id in (select id from \"Usuario\" order by id limit 5)" >/dev/null
U1="$(q 'select count(*) from "Usuario"')"
t "Preparação: o banco atual agora tem menos usuários que o backup" "$([ "$U1" -lt "$U0" ] && echo 1)" "$U1 vs $U0"
rest "$BK" <<< "restaurar"; RC=$?
t "Confirmação errada (minúscula): cancela sem alterar" "$([ $RC -eq 0 ] && [ "$(q 'select count(*) from "Usuario"')" = "$U1" ] && sem_temp && [ ! -f /tmp/rs-pm2.log ] && echo 1)"
rest < /dev/null; t "Menu sem escolha: cancela sem alterar" "$([ "$(q 'select count(*) from "Usuario"')" = "$U1" ] && echo 1)"
rest <<< "999"; t "Menu com número inválido: cancela sem alterar" "$([ "$(q 'select count(*) from "Usuario"')" = "$U1" ] && echo 1)"

# ---- 4. Falha no dump de segurança: aborta antes de parar qualquer coisa
FILAPRO_PGDUMP=false rest "$BK" <<< "RESTAURAR"; RC=$?
t "Dump de segurança falhou: aborta, banco atual intacto, serviços não paradas" "$([ $RC -eq 1 ] && [ "$(q 'select count(*) from "Usuario"')" = "$U1" ] && sem_temp && [ ! -f /tmp/rs-pm2.log ] && echo 1)"

# ---- 5. Migração falha: o banco antigo volta ao lugar
FILAPRO_AGORA="2026-11-28 10:00" FILAPRO_MIGRAR_CMD=false rest "$BK" <<< "RESTAURAR"; RC=$?
t "Migração falhou: sai com erro e DEVOLVE o banco antigo" "$([ $RC -eq 1 ] && [ "$(q 'select count(*) from "Usuario"')" = "$U1" ] && echo 1)" "rc=$RC"
t "Migração falhou: o restaurado com defeito fica guardado para análise" "$([ -n "$(pgx "select 1 from pg_database where datname='bkr_vivo_restauracao_falha_2026_11_28_1000'")" ] && echo 1)"
t "Migração falhou: o site foi religado" "$(grep -q 'restart' /tmp/rs-pm2.log && echo 1)"
pgx "DROP DATABASE IF EXISTS bkr_vivo_restauracao_falha_2026_11_28_1000" >/dev/null; rm -f /tmp/rs-pm2.log

# ---- 6. Restauração completa (com arquivos e chaves) escolhida pelo menu
echo "mudou" > "$R/arquivos/a.png"
# o menu lista também os dumps de segurança (mais novos): acha o número do backup diário na lista
NUM="$(bash "$D/restaurar-backup.sh" < /dev/null 2>&1 | grep -F "$(basename "$BK")" | head -1 | sed -E 's/^ *([0-9]+)\).*/\1/')"
t "Menu lista o backup diário com um número" "$([[ "$NUM" =~ ^[0-9]+$ ]] && echo 1)" "num=$NUM"
printf '%s\nRESTAURAR\n' "$NUM" | FILAPRO_AGORA="2026-11-28 11:00" FILAPRO_CHAVES_DEST="$R/chaves-abertas" bash "$D/restaurar-backup.sh" --arquivos --chaves >> "$LOG" 2>&1
RC=$?
OUT_OK="$([ "$(q 'select count(*) from "Usuario"')" = "$U0" ] && echo 1)"
t "Restauração escolhida pelo menu: usuários e empresas voltam ao do backup" "$([ $RC -eq 0 ] && [ -n "$OUT_OK" ] && [ "$(q 'select count(*) from "Empresa"')" = "$E0" ] && echo 1)" "rc=$RC usuarios=$(q 'select count(*) from "Usuario"')"
t "Restauração: o banco antigo ficou guardado com os dados de antes" "$([ "$(q 'select count(*) from "Usuario"' bkr_vivo_antes_2026_11_28_1100)" = "$U1" ] && echo 1)"
t "Restauração: dump de segurança criado com permissão 600" "$([ -f "$B/seguranca/antes-restauracao-2026-11-28_1100.sql.gz" ] && [ "$(stat -c %a "$B/seguranca/antes-restauracao-2026-11-28_1100.sql.gz")" = 600 ] && gunzip -t "$B/seguranca/antes-restauracao-2026-11-28_1100.sql.gz" && echo 1)"
t "Restauração: tabelas passaram para o dono certo (bkr_dono)" "$([ "$(q "select count(*) from pg_tables where schemaname='public' and tableowner<>'bkr_dono'")" = 0 ] && echo 1)"
t "Restauração: banco temporário apagado, serviços parados e religados, migração rodou" "$(sem_temp && grep -q 'stop' /tmp/rs-pm2.log && grep -q 'restart' /tmp/rs-pm2.log && [ -f /tmp/rs-migrar.log ] && echo 1)"
t "Restauração: arquivos enviados voltaram e os atuais ficaram guardados" "$([ "$(cat "$R/arquivos/a.png")" = "conteudo a" ] && [ "$(cat "$R/arquivos.antes-2026-11-28_1100/a.png")" = "mudou" ] && echo 1)"
t "Restauração: chaves abertas à parte (pasta 700) sem sobrescrever os .env" "$([ -f "$R/chaves-abertas/web/.env.production" ] && [ "$(stat -c %a "$R/chaves-abertas")" = 700 ] && grep -q SEGREDO_FALSO "$R/app/apps/web/.env.production" && echo 1)"

# ---- 7. Só os 2 bancos antigos mais recentes ficam guardados
for h in "12:00" "13:00" "14:00"; do
  q "delete from \"Usuario\" where id in (select id from \"Usuario\" order by id limit 1)" >/dev/null
  FILAPRO_AGORA="2026-11-28 $h" rest "$BK" --confirmado
done
t "Retenção: só 2 bancos antigos ficam guardados" "$([ "$(pgx "select count(*) from pg_database where datname like 'bkr\\_vivo\\_antes\\_%'")" = 2 ] && echo 1)"
t "Retenção: ficaram os 2 mais recentes" "$([ -n "$(pgx "select 1 from pg_database where datname='bkr_vivo_antes_2026_11_28_1400'")" ] && [ -z "$(pgx "select 1 from pg_database where datname='bkr_vivo_antes_2026_11_28_1100'")" ] && echo 1)"
t "Dumps de segurança: no máximo 5" "$([ "$(ls "$B"/seguranca | wc -l)" -le 5 ] && echo 1)"

# ---- 8. Execução simultânea e permissões
( exec 8>/tmp/rs.lock; flock -n 8 && sleep 6 ) & sleep 1
OUT=$(bash "$D/restaurar-backup.sh" "$BK" --confirmado 2>&1); RC=$?
t "Backup/restauração em andamento: ignora esta execução sem alterar nada" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q 'ignorada' && echo 1)"
wait
t "Pasta de segurança 700" "$([ "$(stat -c %a "$B/seguranca")" = 700 ] && echo 1)"

# ---- 9. Nenhuma saída vaza segredo
t "Nenhuma saída contém segredo, chave ou senha" "$(grep -q -E 'SEGREDO_FALSO|SenhaDeTeste' "$LOG" && echo 0 || echo 1)"

# ---- 10. Integração com o voltar-versao.sh (sem dropdb direto e conferindo antes de mexer no código)
t "voltar-versao.sh não usa mais dropdb direto" "$(grep -q 'dropdb' "$D/voltar-versao.sh" && echo 0 || echo 1)"
t "voltar-versao.sh confere o backup ANTES do git checkout" "$([ "$(grep -n 'so-testar' "$D/voltar-versao.sh" | head -1 | cut -d: -f1)" -lt "$(grep -n 'git checkout --detach' "$D/voltar-versao.sh" | head -1 | cut -d: -f1)" ] && echo 1)"

# ---- limpeza
pgx "DROP DATABASE IF EXISTS bkr_vivo" >/dev/null
for b in $(pgx "select datname from pg_database where datname like 'bkr\\_vivo\\_%'"); do pgx "DROP DATABASE \"$b\"" >/dev/null; done
pgx "DROP ROLE IF EXISTS bkr_dono" >/dev/null 2>&1
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
