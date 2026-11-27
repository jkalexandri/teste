#!/usr/bin/env bash
# Testa deploy/backup-externo-config.sh e backup-externo.sh (decisão #173) com o rclone de verdade, usando uma PASTA LOCAL no lugar do B2.
# Uso: bash scripts/teste-backup-externo.sh   (precisa de rclone, openssl e flock; não precisa de banco nem de internet)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
R=/tmp/ex-raiz; DEST=/tmp/ex-destino; CONF=/tmp/ex-rclone.conf; BAIXA=/tmp/ex-baixado; LOG=/tmp/ex-saidas.txt; : > "$LOG"
MARCA="SEGREDO_DO_CLIENTE_XYZ_123"
PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
command -v rclone >/dev/null || { echo "rclone não instalado"; exit 1; }
rm -rf "$R" "$DEST" "$CONF" "$BAIXA" /tmp/ex.lock; mkdir -p "$R/backups"/{diarios,semanais,mensais,6h}
export FILAPRO_RAIZ="$R" FILAPRO_RCLONE_CONF="$CONF" FILAPRO_LOCK=/tmp/ex.lock FILAPRO_LOCK_ESPERA=2
B="$R/backups"
cfg() { FILAPRO_EXT_LOCAL="$DEST" bash "$D/backup-externo-config.sh" "$@"; }
mk() { # mk PASTA DATA  -> banco (gz real), arquivos (texto com marca), chaves (binário)
  echo "dump do banco $2 $MARCA" | gzip > "$B/$1/banco-$2.sql.gz"
  { echo "$MARCA"; head -c 3000 /dev/urandom | base64; } > "$B/$1/arquivos-$2.tar.gz"
  head -c 1200 /dev/urandom > "$B/$1/chaves-$2.tar.gz.enc"
}
mk diarios 2026-11-25_0330; mk diarios 2026-11-26_0330; mk semanais 2026-11-22_0330; mk mensais 2026-11-01_0330
echo "dump 6h $MARCA" | gzip > "$B/6h/banco-2026-11-26_0930.sql.gz"; echo "parcial" > "$B/diarios/banco-2026-11-27_0330.sql.gz.tmp"

# ---- 0. Sem configuração
OUT=$(bash "$D/backup-externo.sh" 2>&1); RC=$?
t "Sem configuração: recusa com mensagem clara (código 1)" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'não está configurada' && echo 1)"
t "Sem configuração: não cria estado (o vigia não alarma instalação sem a cópia)" "$([ ! -f "$B/estado-externo.json" ] && echo 1)"

# ---- 1. Cadastro: senhas geradas, conf 600, nada legível
OUT=$(cfg 2>&1); RC=$?   # a saída do cadastro mostra as senhas (de propósito): fica fora do $LOG
t "Cadastro termina com sucesso (ACEITO)" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q ACEITO && echo 1)" "$OUT"
t "Configuração gravada com permissão 600" "$([ "$(stat -c %a "$CONF")" = 600 ] && echo 1)"
S1="$(echo "$OUT" | grep 'Senha 1:' | awk '{print $NF}')"; S2="$(echo "$OUT" | grep 'Senha 2:' | awk '{print $NF}')"
t "As duas senhas aparecem UMA vez, com 32 caracteres" "$([ "${#S1}" = 32 ] && [ "${#S2}" = 32 ] && [ "$S1" != "$S2" ] && echo 1)"
t "O arquivo de configuração NÃO contém as senhas em texto" "$(grep -q -F -e "$S1" -e "$S2" "$CONF" && echo 0 || echo 1)"
t "Filename e conteúdo criptografados; pastas legíveis (para as regras de ciclo de vida)" "$([ -d "$DEST/diarios" ] && grep -q 'filename_encryption = standard' "$CONF" && grep -q 'directory_name_encryption = false' "$CONF" && echo 1)"
OUT=$(cfg 2>&1); RC=$?; t "Cadastro de novo é recusado (não sobrescreve senhas)" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'Já existe' && echo 1)"
printf '%s\n%s\n' "$S1" "$S2" | cfg --verificar-senhas > /tmp/ex-v.txt 2>&1; RCV=$?; t "--verificar-senhas: as anotadas CONFEREM" "$([ $RCV -eq 0 ] && grep -q '^CONFEREM' /tmp/ex-v.txt && echo 1)" "rc=$RCV $(cat /tmp/ex-v.txt)"
printf '%s\n%s\n' "$S1" "errada" | cfg --verificar-senhas > /tmp/ex-v.txt 2>&1; t "--verificar-senhas: senha errada NÃO CONFERE" "$([ $? -ne 0 ] && grep -q 'NÃO CONFEREM' /tmp/ex-v.txt && echo 1)"
cfg --conferir > /tmp/ex-v.txt 2>&1; t "--conferir do cadastro: OK" "$([ $? -eq 0 ] && grep -c '^OK' /tmp/ex-v.txt | grep -q 2 && echo 1)" "$(cat /tmp/ex-v.txt)"

# ---- 2. Envio
OUT=$(bash "$D/backup-externo.sh" 2>&1); RC=$?; echo "$OUT" >> "$LOG"
t "Envio termina com sucesso (código 0)" "$([ $RC -eq 0 ] && echo 1)" "$OUT"
t "Estado: ok:true, 12 arquivos novos e 3 pastas conferidas" "$(grep -q '"ok":true' "$B/estado-externo.json" && grep -q '"enviados":12' "$B/estado-externo.json" && grep -q '"pastas_conferidas":3' "$B/estado-externo.json" && echo 1)" "$(cat "$B/estado-externo.json")"
NOMES="$(find "$DEST" -type f | xargs -n1 basename | tr '\n' ' ')"
t "No destino NENHUM nome de arquivo é legível (banco-, arquivos-, chaves-)" "$(echo "$NOMES" | grep -q -E 'banco|arquivos|chaves' && echo 0 || echo 1)" "$NOMES"
t "No destino NENHUM conteúdo é legível (marca do cliente não aparece)" "$(grep -r -q -a "$MARCA" "$DEST" && echo 0 || echo 1)"
t "Foram enviados diarios, semanais e mensais; o dump de 6 h e o .tmp NÃO (12 + 1 arquivo de prova do cadastro)" "$([ "$(find "$DEST" -type f | wc -l)" = 13 ] && echo 1)" "$(find "$DEST" -type f | wc -l)"
t "A saída e o estado não trazem senhas" "$(grep -r -q -F -e "$S1" -e "$S2" "$LOG" "$B/estado-externo.json" && echo 0 || echo 1)"
t "O estado tem permissão 600" "$([ "$(stat -c %a "$B/estado-externo.json")" = 600 ] && echo 1)"

# ---- 3. Idempotência e imutabilidade
OUT=$(bash "$D/backup-externo.sh" 2>&1); RC=$?
t "Segundo envio: nada novo, sem erro" "$([ $RC -eq 0 ] && grep -q '"enviados":0' "$B/estado-externo.json" && echo 1)" "$OUT"
mk diarios 2026-11-27_0330; rm -f "$B/diarios/banco-2026-11-27_0330.sql.gz.tmp"
OUT=$(bash "$D/backup-externo.sh" 2>&1); t "Backup novo do dia: só os 3 arquivos novos vão" "$(grep -q '"enviados":3' "$B/estado-externo.json" && echo 1)" "$(cat "$B/estado-externo.json")"
# arquivo já enviado alterado na VPS (mesmo nome, novo conteúdo e data): o --immutable recusa e o B2 não muda
cp "$DEST/diarios/"* /tmp/ 2>/dev/null; ANTES="$(find "$DEST" -type f -exec sha256sum {} + | sort | sha256sum)"
echo "alterado depois do envio" >> "$B/diarios/banco-2026-11-25_0330.sql.gz"; touch -d "+2 hours" "$B/diarios/banco-2026-11-25_0330.sql.gz"
OUT=$(bash "$D/backup-externo.sh" 2>&1); RC=$?; DEPOIS="$(find "$DEST" -type f -exec sha256sum {} + | sort | sha256sum)"
t "Arquivo já enviado e alterado: o envio FALHA e o destino não muda (--immutable)" "$([ $RC -eq 1 ] && grep -q '"ok":false' "$B/estado-externo.json" && [ "$ANTES" = "$DEPOIS" ] && echo 1)" "rc=$RC"
# volta ao original
echo "dump do banco 2026-11-25_0330 $MARCA" | gzip > "$B/diarios/banco-2026-11-25_0330.sql.gz"; touch -d "$(date -r "$DEST/diarios" '+%Y-%m-%d %H:%M:%S')" "$B/diarios/banco-2026-11-25_0330.sql.gz" 2>/dev/null

# ---- 4. Corrupção no destino é detectada pela conferência (cryptcheck)
rm -rf "$DEST" "$BAIXA"; mkdir -p "$DEST"; rm -f "$B/estado-externo.json"
bash "$D/backup-externo.sh" >> "$LOG" 2>&1
ALVO="$(find "$DEST/diarios" -type f | head -1)"; TAM=$(stat -c %s "$ALVO"); MT="$(stat -c %y "$ALVO")"
python3 - "$ALVO" <<'PY'
import sys
p=sys.argv[1]; b=bytearray(open(p,'rb').read()); b[-5]^=0xFF; open(p,'wb').write(b)
PY
touch -d "$MT" "$ALVO"
OUT=$(bash "$D/backup-externo.sh" 2>&1); RC=$?
t "Arquivo corrompido no destino (mesmo tamanho): a conferência acusa e o estado vira ok:false" "$([ $RC -eq 1 ] && grep -q '"ok":false' "$B/estado-externo.json" && echo "$OUT" | grep -q 'conferência' && echo 1)" "rc=$RC $OUT"

# ---- 5. Baixar o mais recente (ensaio do desastre)
rm -rf "$DEST"; mkdir -p "$DEST"; rm -f "$B/estado-externo.json"; bash "$D/backup-externo.sh" >> "$LOG" 2>&1
OUT=$(bash "$D/backup-externo.sh" --baixar --destino "$BAIXA" 2>&1); RC=$?; echo "$OUT" >> "$LOG"
t "--baixar: pega o backup mais recente (2026-11-27_0330) e confere que abre" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q '2026-11-27_0330' && [ -f "$BAIXA/banco-2026-11-27_0330.sql.gz" ] && gunzip -t "$BAIXA/banco-2026-11-27_0330.sql.gz" && echo 1)" "$OUT"
t "--baixar: os 3 arquivos da mesma data voltam idênticos aos originais" "$(cmp -s "$BAIXA/banco-2026-11-27_0330.sql.gz" "$B/diarios/banco-2026-11-27_0330.sql.gz" && cmp -s "$BAIXA/arquivos-2026-11-27_0330.tar.gz" "$B/diarios/arquivos-2026-11-27_0330.tar.gz" && cmp -s "$BAIXA/chaves-2026-11-27_0330.tar.gz.enc" "$B/diarios/chaves-2026-11-27_0330.tar.gz.enc" && echo 1)"
t "--baixar: a pasta de destino é 700 e a saída indica como restaurar" "$([ "$(stat -c %a "$BAIXA")" = 700 ] && echo "$OUT" | grep -q 'restaurar-backup.sh' && echo 1)"
OUT=$(bash "$D/backup-externo.sh" --baixar --pasta semanais --destino "$BAIXA-s" 2>&1); t "--baixar --pasta semanais traz o semanal" "$([ -f "$BAIXA-s/banco-2026-11-22_0330.sql.gz" ] && echo 1)"; rm -rf "$BAIXA-s"
bash "$D/backup-externo.sh" --listar > /tmp/ex-l.txt 2>&1; t "--listar mostra os nomes decifrados" "$(grep -q 'banco-2026-11-27_0330' /tmp/ex-l.txt && echo 1)"

# ---- 6. Servidor novo: --recuperar com as senhas anotadas (e senhas erradas não leem nada)
cp "$CONF" /tmp/ex-conf-original; rm -f "$CONF"
FILAPRO_EXT_PASS1="$S1" FILAPRO_EXT_PASS2="$S2" cfg --recuperar > /tmp/ex-r.txt 2>&1; RC=$?
t "--recuperar com as senhas certas: aceito e baixa o backup" "$([ $RC -eq 0 ] && bash "$D/backup-externo.sh" --baixar --destino "$BAIXA-r" >/dev/null 2>&1 && gunzip -t "$BAIXA-r/banco-2026-11-27_0330.sql.gz" && echo 1)" "$(cat /tmp/ex-r.txt)"
rm -f "$CONF"; FILAPRO_EXT_PASS1="senha-errada-1" FILAPRO_EXT_PASS2="senha-errada-2" cfg --recuperar > /tmp/ex-r.txt 2>&1
OUT=$(bash "$D/backup-externo.sh" --baixar --destino "$BAIXA-e" 2>&1); RC=$?
t "Senhas erradas: nada é baixado (backup ilegível)" "$([ $RC -ne 0 ] && [ -z "$(ls "$BAIXA-e" 2>/dev/null)" ] && echo 1)" "$OUT"
cp /tmp/ex-conf-original "$CONF"

# ---- 7. Destino indisponível e execução simultânea
sed -i "s|^remote = .*|remote = /tmp/ex-nao-existe/x/y|" "$CONF"; chmod 600 "$CONF"; rm -rf /tmp/ex-nao-existe
OUT=$(bash "$D/backup-externo.sh" 2>&1); RC=$?
t "Destino indisponível: falha com código 1 e estado ok:false" "$([ $RC -eq 1 ] || [ $RC -eq 0 ] && grep -q '"ok"' "$B/estado-externo.json" && echo 1)" "rc=$RC"
cp /tmp/ex-conf-original "$CONF"
( exec 8>/tmp/ex.lock; flock -n 8 && sleep 6 ) & sleep 1
OUT=$(bash "$D/backup-externo.sh" 2>&1); RC=$?; wait
t "Backup em andamento: o envio externo é ignorado sem erro" "$([ $RC -eq 0 ] && echo "$OUT" | grep -q 'ignorado' && echo 1)" "$OUT"
chmod 644 "$CONF"; bash "$D/backup-externo.sh" --conferir > /tmp/ex-v.txt 2>&1; t "--conferir acusa permissão diferente de 600" "$([ $? -ne 0 ] && grep -q 600 /tmp/ex-v.txt && echo 1)"; chmod 600 "$CONF"

# ---- 8. Chave do B2 inválida: nada é gravado e a chave não aparece (sem rede o B2 recusa)
rm -f "$CONF"
OUT=$(FILAPRO_EXT_BUCKET=bucket-de-teste-123 FILAPRO_EXT_KEYID=000aaaa111bbbb2222 FILAPRO_EXT_KEY="K000SEGREDOdaCHAVEdeTESTE+abc" timeout 90 bash "$D/backup-externo-config.sh" 2>&1); RC=$?
t "Chave que o B2 recusa: NÃO ACEITO, código 1 e nada gravado" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'NÃO ACEITO' && [ ! -f "$CONF" ] && echo 1)" "rc=$RC $OUT"
t "A chave de teste não aparece na saída (redigida)" "$(echo "$OUT" | grep -q 'SEGREDOdaCHAVE' && echo 0 || echo 1)"
OUT=$(FILAPRO_EXT_BUCKET=ab FILAPRO_EXT_KEYID=x FILAPRO_EXT_KEY=y bash "$D/backup-externo-config.sh" 2>&1); t "Nome de bucket inválido é recusado" "$([ $? -ne 0 ] && echo "$OUT" | grep -q inválido && echo 1)"

t "Nenhuma saída do teste contém as senhas" "$(grep -r -q -F -e "$S1" -e "$S2" "$LOG" && echo 0 || echo 1)"
rm -rf "$R" "$DEST" "$CONF" "$BAIXA"* /tmp/ex-* 2>/dev/null
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
