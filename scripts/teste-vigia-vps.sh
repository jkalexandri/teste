#!/usr/bin/env bash
# Testa deploy/vigia-vps.sh (decisão #171) numa "VPS falsa": arquivos de estado velhos, disco cheio, memória no limite etc.
# Uso: bash scripts/teste-vigia-vps.sh   (não precisa de banco nem de site: usa --mostrar)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
R=/tmp/vg-raiz; B="$R/backups"
PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
rm -rf "$R"; mkdir -p "$B" "$R/app/apps/web"
printf 'CRON_SECRET="segredo-falso-vg"\n' > "$R/app/apps/web/.env.production"
# /proc/meminfo falso: MemTotal 4000000, MemAvailable $1, SwapTotal 2000000, SwapFree $2
mem() { printf 'MemTotal: 4000000 kB\nMemAvailable: %s kB\nSwapTotal: 2000000 kB\nSwapFree: %s kB\n' "$1" "$2" > /tmp/vg-meminfo; }
mem 3000000 2000000
export FILAPRO_RAIZ="$R" FILAPRO_MEMINFO=/tmp/vg-meminfo FILAPRO_REBOOT_ARQ=/tmp/vg-naoexiste FILAPRO_DISCO_PCT=40 FILAPRO_NTP=yes FILAPRO_CERT_DIAS=60
rodar() { bash "$D/vigia-vps.sh" --mostrar; }
nivel() { echo "$1" | grep -o "{\"id\":\"$2\",\"nivel\":\"[a-z]*\"" | sed -E 's/.*"nivel":"([a-z]*)"/\1/'; }
valido() { echo "$1" | python3 -c 'import json,sys; j=json.load(sys.stdin); assert isinstance(j["itens"],list) and len(j["itens"])>=7' 2>/dev/null; }
estado() { printf '{"quando":"x","ok":%s}\n' "$2" > "$B/estado-$1.json"; touch -d "$3 hours ago" "$B/estado-$1.json"; }

# ---- 1. Tudo em dia
estado completo true 3; estado banco true 1; estado restauracao true 48
J=$(rodar)
t "O relatório é um JSON válido com todas as verificações" "$(valido "$J" && echo 1)" "$J"
ALL_OK=1; for i in backup backup6h restauracao disco memoria reinicio relogio certificado; do [ "$(nivel "$J" $i)" = ok ] || ALL_OK=0; done
t "Tudo em dia: todos os itens em 'ok'" "$ALL_OK" "$J"

# ---- 2. Backup
estado completo true 30; J=$(rodar); t "Backup completo com 30 h: aviso" "$([ "$(nivel "$J" backup)" = aviso ] && echo 1)"
estado completo true 60; J=$(rodar); t "Backup completo com 60 h: crítico" "$([ "$(nivel "$J" backup)" = critico ] && echo 1)"
estado completo false 2; J=$(rodar); t "Backup completo com ok:false: crítico" "$([ "$(nivel "$J" backup)" = critico ] && echo 1)"
estado completo true 3; rm "$B/estado-completo.json"; J=$(rodar); t "Sem estado do backup completo: aviso" "$([ "$(nivel "$J" backup)" = aviso ] && echo 1)"
estado completo true 3
# dump de 6 h: vale o mais novo entre o completo e o de só banco
estado completo true 20; estado banco true 5; J=$(rodar); t "Dump de 6 h: o do banco (5 h) vale, mesmo com o completo velho" "$([ "$(nivel "$J" backup6h)" = ok ]  && echo 1)"
estado banco true 10; estado completo true 20; J=$(rodar); t "Dump de 6 h com 10 h: aviso" "$([ "$(nivel "$J" backup6h)" = aviso ] && echo 1)"
estado banco true 30; estado completo true 30; J=$(rodar); t "Dump de 6 h com 30 h: crítico" "$([ "$(nivel "$J" backup6h)" = critico ] && echo 1)"
estado completo true 3; estado banco true 1
estado restauracao false 2; J=$(rodar); t "Teste de restauração com falha: aviso" "$([ "$(nivel "$J" restauracao)" = aviso ] && echo 1)"
estado restauracao true 240; J=$(rodar); t "Teste de restauração com 10 dias: aviso" "$([ "$(nivel "$J" restauracao)" = aviso ] && echo 1)"
rm "$B/estado-restauracao.json"; J=$(rodar); t "Sem teste de restauração ainda: ok (não alarma instalação nova)" "$([ "$(nivel "$J" restauracao)" = ok ] && echo 1)"

# ---- 3. Disco, memória, reinício, relógio, certificado
FILAPRO_DISCO_PCT=79 J=$(rodar); t "Disco em 79%: ok" "$([ "$(nivel "$J" disco)" = ok ] && echo 1)"
J=$(FILAPRO_DISCO_PCT=80 rodar); t "Disco em 80%: aviso" "$([ "$(nivel "$J" disco)" = aviso ] && echo 1)"
J=$(FILAPRO_DISCO_PCT=91 rodar); t "Disco em 91%: crítico" "$([ "$(nivel "$J" disco)" = critico ] && echo 1)"
mem 300000 2000000; J=$(rodar); t "Memória livre abaixo de 10%: aviso" "$([ "$(nivel "$J" memoria)" = aviso ] && echo 1)"
mem 3000000 200000; J=$(rodar); t "Swap acima de 80%: aviso" "$([ "$(nivel "$J" memoria)" = aviso ] && echo 1)"
mem 3000000 2000000
touch /tmp/vg-reboot; J=$(FILAPRO_REBOOT_ARQ=/tmp/vg-reboot rodar); t "Reinício pendente: aviso" "$([ "$(nivel "$J" reinicio)" = aviso ] && echo 1)"; rm -f /tmp/vg-reboot
J=$(FILAPRO_NTP=no rodar); t "Relógio sem sincronizar: aviso" "$([ "$(nivel "$J" relogio)" = aviso ] && echo 1)"
J=$(FILAPRO_CERT_DIAS=10 rodar); t "Certificado com 10 dias: aviso" "$([ "$(nivel "$J" certificado)" = aviso ] && echo 1)"
J=$(FILAPRO_CERT_DIAS=3 rodar); t "Certificado com 3 dias: crítico" "$([ "$(nivel "$J" certificado)" = critico ] && echo 1)"

# ---- 3b. Cópia externa (B2): só vigia se estiver configurada
J=$(rodar); t "Sem a cópia externa configurada: o item nem aparece (não alarma)" "$(echo "$J" | grep -q backupExterno && echo 0 || echo 1)"
echo "[filapro-b2]" > /tmp/vg-rclone.conf; export FILAPRO_RCLONE_CONF=/tmp/vg-rclone.conf
J=$(rodar); t "Configurada, mas sem nenhum envio: aviso" "$([ "$(nivel "$J" backupExterno)" = aviso ] && echo 1)"
estado externo true 5; J=$(rodar); t "Envio externo com 5 h: ok" "$([ "$(nivel "$J" backupExterno)" = ok ] && echo 1)"
estado externo true 40; J=$(rodar); t "Envio externo com 40 h: aviso" "$([ "$(nivel "$J" backupExterno)" = aviso ] && echo 1)"
estado externo true 80; J=$(rodar); t "Envio externo com 80 h: crítico" "$([ "$(nivel "$J" backupExterno)" = critico ] && echo 1)"
estado externo false 2; J=$(rodar); t "Último envio externo com ok:false: aviso" "$([ "$(nivel "$J" backupExterno)" = aviso ] && echo 1)"
rm -f "$B/estado-externo.json" /tmp/vg-rclone.conf; unset FILAPRO_RCLONE_CONF

# ---- 4. Segurança do relatório e do envio
J=$(rodar)
t "O relatório não contém o segredo nem caminhos da VPS" "$(echo "$J" | grep -q -E 'segredo-falso|/opt/|/root|/tmp' && echo 0 || echo 1)"
J=$(FILAPRO_RAIZ=/tmp/vg-sem-env bash "$D/vigia-vps.sh" 2>&1); t "Sem CRON_SECRET: erro claro, nada é enviado" "$(echo "$J" | grep -q 'CRON_SECRET não encontrado' && echo 1)"
# Envio real a um servidor falso: confere o cabeçalho e o corpo
python3 - <<'PY' &
import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        n=int(self.headers.get('content-length',0)); corpo=self.rfile.read(n).decode()
        open('/tmp/vg-recebido.txt','w').write(self.headers.get('authorization','')+'\n'+self.headers.get('content-type','')+'\n'+corpo)
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"acao":"processado"}')
    def log_message(self,*a): pass
s=http.server.HTTPServer(('127.0.0.1',18765),H); s.handle_request()
PY
sleep 1; rm -f /tmp/vg-recebido.txt
OUT=$(FILAPRO_VIGIA_URL=http://127.0.0.1:18765/api/cron/vps bash "$D/vigia-vps.sh" 2>&1); sleep 1
t "Envio: manda POST com o segredo e o JSON dos itens" "$(sed -n 1p /tmp/vg-recebido.txt 2>/dev/null | grep -q 'Bearer segredo-falso-vg' && sed -n 2p /tmp/vg-recebido.txt | grep -q json && sed -n 3p /tmp/vg-recebido.txt | grep -q '"itens"' && echo 1)"
t "Envio: o log mostra a resposta, sem o segredo" "$(echo "$OUT" | grep -q processado && ! echo "$OUT" | grep -q segredo-falso && echo 1)" "$OUT"
rm -f /tmp/vg-meminfo /tmp/vg-recebido.txt
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
