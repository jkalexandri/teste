#!/usr/bin/env bash
# Testa deploy/rotacionar-segredo.sh (decisão #175) com .env FALSOS, um "site" e um "serviço 24/7" de mentira (python) e o banco de teste (porta 5433).
# Uso: bash scripts/teste-rotacao-segredos.sh   (precisa do Postgres de teste no ar, python3, curl e flock)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
X=/tmp/rs2; R="$X/raiz"; WEB="$R/app/apps/web/.env.production"; WK="$R/app/apps/worker/.env"
PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
pkill -f "$X/servidor.py" 2>/dev/null; rm -rf "$X"; mkdir -p "$R/app/apps/web" "$R/app/apps/worker"
PGX="psql -h /var/tmp -p 5433 -U postgres"
$PGX -d postgres -qtAc "DROP ROLE IF EXISTS rot_teste" >/dev/null 2>&1; $PGX -d postgres -qtAc "CREATE ROLE rot_teste LOGIN PASSWORD 'senhaantiga123'" >/dev/null
printf 'NEXT_PUBLIC_APP_ENV="production"\nDATABASE_URL="postgresql://rot_teste:senhaantiga123@localhost:5432/filapro?schema=public"\nCRON_SECRET="cronantigo000"\nWORKER_TOKEN="workerantigo000"\nCHAVE_CRIPTO="chavecripto-fixa"\nMONITOR_TOKEN="monitorantigo0000000000000000"\n' > "$WEB"
printf 'DATABASE_URL="postgresql://rot_teste:senhaantiga123@localhost:5432/filapro?schema=public"\nWORKER_TOKEN="workerantigo000"\nCHAVE_CRIPTO="chavecripto-fixa"\nPORTA=4000\n' > "$WK"
chmod 600 "$WEB" "$WK"
# "Site" (18300) e "serviço" (18400) de mentira: só enxergam um .env novo depois de um "restart" (o pm2 de mentira marca o arquivo reload)
cat > "$X/servidor.py" <<'PY'
import http.server, threading, os, re, sys
X="/tmp/rs2"; WEB=X+"/raiz/app/apps/web/.env.production"; WK=X+"/raiz/app/apps/worker/.env"
def le(arq,var):
    for l in open(arq):
        if l.startswith(var+"="): return l.split("=",1)[1].strip().strip('"')
estado={"mtime":0,"cron":None,"mon":None,"wt":None}
def recarrega():
    if os.path.exists(X+"/nao-recarrega"): return
    m=os.path.getmtime(X+"/reload") if os.path.exists(X+"/reload") else 0
    if m!=estado["mtime"]:
        estado.update(mtime=m,cron=le(WEB,"CRON_SECRET"),mon=le(WEB,"MONITOR_TOKEN"),wt=le(WK,"WORKER_TOKEN"))
recarrega()
class H(http.server.BaseHTTPRequestHandler):
    def r(self,c): self.send_response(c); self.end_headers(); self.wfile.write(b"x")
    def do_GET(self):
        recarrega(); aut=self.headers.get("authorization","")
        if self.server.server_port==18300:
            if self.path.startswith("/api/cron/servico"): return self.r(200 if aut=="Bearer "+(estado["cron"] or "") else 401)
            if self.path.startswith("/api/monitor"):
                t=self.path.split("t=")[-1]; return self.r(200 if t==estado["mon"] else 404)
            if self.path.startswith("/login") and os.path.exists(X+"/site-falha"): return self.r(500)
            return self.r(200)
        if self.path=="/saude": return self.r(200)
        if self.path.startswith("/arquivos/"): return self.r(404 if aut=="Bearer "+(estado["wt"] or "") else 401)
        self.r(404)
    def log_message(self,*a): pass
for p in (18300,18400):
    threading.Thread(target=http.server.HTTPServer(("127.0.0.1",p),H).serve_forever,daemon=True).start()
threading.Event().wait()
PY
touch "$X/reload"; (python3 "$X/servidor.py" >/dev/null 2>&1 &); sleep 1
printf '#!/bin/bash\necho "$@" >> /tmp/rs2/pm2.log\ntouch /tmp/rs2/reload\n' > "$X/pm2.sh"; chmod +x "$X/pm2.sh"
export FILAPRO_RAIZ="$R" FILAPRO_PM2="$X/pm2.sh" FILAPRO_PSQL="$PGX" FILAPRO_SITE_URL=http://127.0.0.1:18300 FILAPRO_WORKER_URL=http://127.0.0.1:18400 FILAPRO_ROTACAO_ESPERA=1 FILAPRO_ROTACAO_LOCK="$X/lock"
SAIDAS="$X/saidas.txt"; : > "$SAIDAS"
rot() { bash "$D/rotacionar-segredo.sh" "$@" 2>&1 | tee -a "$SAIDAS"; return "${PIPESTATUS[0]}"; }
val() { grep -E "^$2=" "$1" | head -1 | cut -d= -f2- | tr -d '"'; }
sha() { sha256sum "$WEB" "$WK" | awk '{print $1}' | tr '\n' ' '; }
touch "$X/reload"; sleep 1.1; touch "$X/reload"; sleep 1   # o "site" lê os valores iniciais

# ---- 1. CRON_SECRET
ANT="$(val "$WEB" CRON_SECRET)"; OUTRAS_ANTES="$(grep -v '^CRON_SECRET=' "$WEB" | sha256sum)"
OUT=$(rot cron); RC=$?; NOVO="$(val "$WEB" CRON_SECRET)"
t "cron: termina com sucesso e o valor mudou (64 caracteres hex)" "$([ $RC -eq 0 ] && [ "$NOVO" != "$ANT" ] && [ "${#NOVO}" = 64 ] && echo 1)" "$OUT"
t "cron: o 'site' aceita o novo e recusa o antigo" "$([ "$(curl -s -o /dev/null -w %{http_code} -H "Authorization: Bearer $NOVO" $FILAPRO_SITE_URL/api/cron/servico)" = 200 ] && [ "$(curl -s -o /dev/null -w %{http_code} -H "Authorization: Bearer $ANT" $FILAPRO_SITE_URL/api/cron/servico)" = 401 ] && echo 1)"
t "cron: as outras linhas do .env ficaram idênticas e a permissão segue 600" "$([ "$(grep -v '^CRON_SECRET=' "$WEB" | sha256sum)" = "$OUTRAS_ANTES" ] && [ "$(stat -c %a "$WEB")" = 600 ] && echo 1)"
t "cron: a saída não traz o valor novo nem o antigo" "$(echo "$OUT" | grep -qF -e "$NOVO" -e "$ANT" && echo 0 || echo 1)"

# ---- 2. MONITOR_TOKEN
ANT="$(val "$WEB" MONITOR_TOKEN)"; OUT=$(rot monitor); RC=$?; NOVO="$(val "$WEB" MONITOR_TOKEN)"
t "monitor: trocado (48 hex), novo vale e antigo dá 404" "$([ $RC -eq 0 ] && [ "$NOVO" != "$ANT" ] && [ "${#NOVO}" = 48 ] && [ "$(curl -s -o /dev/null -w %{http_code} "$FILAPRO_SITE_URL/api/monitor?t=$NOVO")" = 200 ] && [ "$(curl -s -o /dev/null -w %{http_code} "$FILAPRO_SITE_URL/api/monitor?t=$ANT")" = 404 ] && echo 1)" "$OUT"
URL=$(bash "$D/rotacionar-segredo.sh" monitor --mostrar-url 2>&1 | head -1)
t "monitor --mostrar-url: mostra o endereço com o token novo (e só aí)" "$([ "$URL" = "https://filaproleads.com.br/api/monitor?t=$NOVO" ] && echo "$OUT" | grep -qF "$NOVO" && echo 0 || echo 1)"

# ---- 3. WORKER_TOKEN nos dois .env
ANT="$(val "$WK" WORKER_TOKEN)"; OUT=$(rot worker-token); RC=$?; NW="$(val "$WK" WORKER_TOKEN)"; NS="$(val "$WEB" WORKER_TOKEN)"
t "worker-token: igual nos dois .env, novo e com 64 hex" "$([ $RC -eq 0 ] && [ "$NW" = "$NS" ] && [ "$NW" != "$ANT" ] && [ "${#NW}" = 64 ] && echo 1)" "$OUT"
t "worker-token: o 'serviço' aceita o novo (404 = autorizado) e recusa o antigo (401)" "$([ "$(curl -s -o /dev/null -w %{http_code} -H "Authorization: Bearer $NW" $FILAPRO_WORKER_URL/arquivos/x)" = 404 ] && [ "$(curl -s -o /dev/null -w %{http_code} -H "Authorization: Bearer $ANT" $FILAPRO_WORKER_URL/arquivos/x)" = 401 ] && echo 1)"
t "worker-token: CHAVE_CRIPTO NÃO foi tocada" "$([ "$(val "$WEB" CHAVE_CRIPTO)" = chavecripto-fixa ] && [ "$(val "$WK" CHAVE_CRIPTO)" = chavecripto-fixa ] && echo 1)"

# ---- 4. Senha do banco (PostgreSQL de teste de verdade)
HASH_ANT="$($PGX -d postgres -qtAc "select rolpassword from pg_authid where rolname='rot_teste'")"
OUT=$(rot banco); RC=$?; HASH_NOVO="$($PGX -d postgres -qtAc "select rolpassword from pg_authid where rolname='rot_teste'")"
PW="$(val "$WEB" DATABASE_URL | sed -E 's#^[a-z]+://[^:@/]+:([^@/]*)@.*#\1#')"; PW2="$(val "$WK" DATABASE_URL | sed -E 's#^[a-z]+://[^:@/]+:([^@/]*)@.*#\1#')"
t "banco: a senha mudou no PostgreSQL (hash diferente) e nos dois .env (a mesma, 48 hex)" "$([ $RC -eq 0 ] && [ "$HASH_ANT" != "$HASH_NOVO" ] && [ "$PW" = "$PW2" ] && [ "${#PW}" = 48 ] && [ "$PW" != senhaantiga123 ] && echo 1)" "$OUT"
t "banco: o resto da DATABASE_URL (usuário, endereço, banco, ?schema) ficou igual" "$([ "$(val "$WEB" DATABASE_URL | sed -E 's#:[^:@/]*@#:X@#')" = 'postgresql://rot_teste:X@localhost:5432/filapro?schema=public' ] && echo 1)"
t "banco: a saída não mostra a senha nova" "$(echo "$OUT" | grep -qF "$PW" && echo 0 || echo 1)"

# ---- 5. Falha na conferência: DESFAZ tudo (o 'site' não recarrega o .env novo)
touch "$X/nao-recarrega"; ANTES="$(sha)"; : > "$X/pm2.log"
OUT=$(rot cron); RC=$?
t "cron com o site que NÃO recarrega: falha (código 1), mensagem DESFEITO e .env idênticos aos de antes" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q DESFEITO && [ "$(sha)" = "$ANTES" ] && echo 1)" "$OUT"
t "O sistema foi reiniciado de novo depois de desfazer (2 reinícios no total)" "$([ "$(grep -c restart "$X/pm2.log")" -ge 2 ] && echo 1)"
OUT=$(rot worker-token); RC=$?; t "worker-token com falha: desfeito e .env idênticos" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q DESFEITO && [ "$(sha)" = "$ANTES" ] && echo 1)"
touch "$X/site-falha"; OUT=$(rot banco); RC=$?; rm -f "$X/site-falha"; t "banco com falha (o site não volta com a senha nova): desfeito (.env idênticos, aviso DESFEITO)" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q DESFEITO && [ "$(sha)" = "$ANTES" ] && echo 1)"
rm -f "$X/nao-recarrega"

# ---- 6. Entradas inválidas e execução simultânea
bash "$D/rotacionar-segredo.sh" xyz >/dev/null 2>&1; t "Segredo desconhecido: uso e código 2" "$([ $? -eq 2 ] && echo 1)"
OUT=$(bash "$D/rotacionar-segredo.sh" chave-cripto 2>&1); t "CHAVE_CRIPTO não é rotacionável por aqui (recusa)" "$([ $? -eq 2 ] && echo 1)"
( exec 9>"$X/lock"; flock -n 9 && sleep 4 ) & sleep 1
OUT=$(bash "$D/rotacionar-segredo.sh" cron 2>&1); t "Rotação já em andamento: recusada" "$(echo "$OUT" | grep -q 'em andamento' && echo 1)"; wait
FILAPRO_RAIZ=/tmp/rs2/nao-existe bash "$D/rotacionar-segredo.sh" cron >/dev/null 2>&1; t "Sem o .env: erro claro e nada alterado" "$([ $? -eq 1 ] && echo 1)"
t "Nenhuma saída do teste vazou segredos (valores antigos e novos)" "$(grep -qE 'cronantigo000|workerantigo000|senhaantiga123' "$SAIDAS" && echo 0 || echo 1)"
pkill -f "$X/servidor.py" 2>/dev/null; $PGX -d postgres -qtAc "DROP ROLE IF EXISTS rot_teste" >/dev/null 2>&1; rm -rf "$X"
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
