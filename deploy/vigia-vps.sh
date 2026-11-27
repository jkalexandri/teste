#!/usr/bin/env bash
# Vigia da VPS (decisão #171 — Módulo 12: P0-6, O2, O3, O5). Roda a cada 15 minutos (cron do root) e SÓ LÊ o estado da máquina:
# backups (estado-*.json), teste de restauração, disco, memória, reinício pendente, relógio e certificado HTTPS.
# Monta um relatório (códigos, nível e um valor curto — sem senhas, chaves ou caminhos) e envia ao site, que decide quando avisar
# os Super Admins por e-mail (aviso, lembretes e "resolvido"). Uso: vigia-vps.sh [--mostrar]  (--mostrar só imprime o relatório, não envia)
set -uo pipefail
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
PASTA="${FILAPRO_BACKUPS:-$RAIZ/backups}"
DOMINIO="${FILAPRO_DOMINIO:-filaproleads.com.br}"
URL="${FILAPRO_VIGIA_URL:-http://127.0.0.1:3000/api/cron/vps}"
ENV_WEB="$RAIZ/app/apps/web/.env.production"
MEMINFO="${FILAPRO_MEMINFO:-/proc/meminfo}"
REBOOT_ARQ="${FILAPRO_REBOOT_ARQ:-/var/run/reboot-required}"
AGORA_S="${FILAPRO_AGORA_S:-$(date +%s)}"
MOSTRAR=false; [ "${1:-}" = "--mostrar" ] && MOSTRAR=true

ITENS=()
item() { ITENS+=("{\"id\":\"$1\",\"nivel\":\"$2\",\"valor\":\"$3\"}"); }   # item ID NIVEL VALOR (valor só com texto simples)
horas_de() { echo $(( (AGORA_S - $(stat -c %Y "$1")) / 3600 )); }
ok_json() { grep -q '"ok":true' "$1" 2>/dev/null; }

# ---------------------------------------------------------------- Backups
EC="$PASTA/estado-completo.json"; EB="$PASTA/estado-banco.json"; ER="$PASTA/estado-restauracao.json"
if [ ! -f "$EC" ]; then item backup aviso "nenhum backup completo registrado"
else
  H=$(horas_de "$EC")
  if ! ok_json "$EC"; then item backup critico "o último backup terminou com problemas (há ${H} h)"
  elif [ "$H" -gt 50 ]; then item backup critico "último backup completo há ${H} h"
  elif [ "$H" -gt 26 ]; then item backup aviso "último backup completo há ${H} h"
  else item backup ok "há ${H} h"; fi
fi
# Dump de 6 h: vale o mais novo entre o completo (03:30) e o de só banco (09:30, 15:30, 21:30)
NOVO=""; for f in "$EC" "$EB"; do [ -f "$f" ] && { [ -z "$NOVO" ] || [ "$f" -nt "$NOVO" ] && NOVO="$f"; }; done
if [ -z "$NOVO" ]; then item backup6h aviso "nenhum dump registrado"
else
  H=$(horas_de "$NOVO")
  if ! ok_json "$NOVO"; then item backup6h aviso "o último dump terminou com problemas"
  elif [ "$H" -gt 26 ]; then item backup6h critico "último dump do banco há ${H} h"
  elif [ "$H" -gt 8 ]; then item backup6h aviso "último dump do banco há ${H} h"
  else item backup6h ok "há ${H} h"; fi
fi
if [ ! -f "$ER" ]; then item restauracao ok "ainda sem teste"
else
  H=$(horas_de "$ER")
  if ! ok_json "$ER"; then item restauracao aviso "o último teste de restauração falhou"
  elif [ "$H" -gt 216 ]; then item restauracao aviso "último teste de restauração há $((H / 24)) dias"
  else item restauracao ok "há ${H} h"; fi
fi

# Cópia externa (B2): só vigia se estiver configurada (decisão #173). Atraso >30 h ou falha = aviso; >74 h sem enviar = crítico
CONF_EXT="${FILAPRO_RCLONE_CONF:-/root/.config/rclone/filapro-b2.conf}"; EE="$PASTA/estado-externo.json"
if [ -f "$CONF_EXT" ]; then
  if [ ! -f "$EE" ]; then item backupExterno aviso "configurada, mas nenhum envio registrado"
  else
    H=$(horas_de "$EE")
    if [ "$H" -gt 74 ]; then item backupExterno critico "último envio externo há ${H} h"
    elif ! ok_json "$EE"; then item backupExterno aviso "o último envio externo terminou com problemas"
    elif [ "$H" -gt 30 ]; then item backupExterno aviso "último envio externo há ${H} h"
    else item backupExterno ok "há ${H} h"; fi
  fi
fi

# Auditoria de dependências (O7, decisão #175): pendente alta/crítica = aviso; auditoria que não roda há mais de 15 dias = aviso
ED="$PASTA/estado-dependencias.json"
if [ -f "$ED" ]; then
  H=$(horas_de "$ED"); PEND="$(grep -o '"pendentes":"[^"]*"' "$ED" | cut -d'"' -f4 | cut -c1-55)"
  if [ "$H" -gt 360 ]; then item dependencias aviso "auditoria sem rodar há $((H / 24)) dias"
  elif grep -q '"executou":true' "$ED" && ! ok_json "$ED"; then item dependencias aviso "${PEND:-vulnerabilidade pendente}"
  else item dependencias ok "há $((H / 24)) dias"; fi
fi
# Ensaio do desastre (O8, decisão #175): só vigia se a cópia externa existe; falhou ou mais de 45 dias = aviso
EN="$PASTA/estado-ensaio.json"
if [ -f "$CONF_EXT" ]; then
  if [ ! -f "$EN" ]; then item ensaio ok "ainda sem ensaio"
  else
    H=$(horas_de "$EN")
    if ! ok_json "$EN"; then item ensaio aviso "o último ensaio do desastre falhou"
    elif [ "$H" -gt 1080 ]; then item ensaio aviso "último ensaio há $((H / 24)) dias"
    else item ensaio ok "há $((H / 24)) dias"; fi
  fi
fi

# ---------------------------------------------------------------- Disco (do disco onde ficam os backups)
if [ -n "${FILAPRO_DISCO_PCT:-}" ]; then P="$FILAPRO_DISCO_PCT"; else P=$(df -P "$PASTA" 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}'); fi
if [[ "${P:-}" =~ ^[0-9]+$ ]]; then
  if [ "$P" -ge 90 ]; then item disco critico "disco em ${P}%"
  elif [ "$P" -ge 80 ]; then item disco aviso "disco em ${P}%"
  else item disco ok "disco em ${P}%"; fi
fi

# ---------------------------------------------------------------- Memória e swap
if [ -r "$MEMINFO" ]; then
  MT=$(awk '/^MemTotal:/{print $2}' "$MEMINFO"); MA=$(awk '/^MemAvailable:/{print $2}' "$MEMINFO")
  ST=$(awk '/^SwapTotal:/{print $2}' "$MEMINFO"); SF=$(awk '/^SwapFree:/{print $2}' "$MEMINFO")
  if [ "${MT:-0}" -gt 0 ] 2>/dev/null; then
    PM=$(( 100 * ${MA:-0} / MT )); PS=0
    [ "${ST:-0}" -gt 0 ] && PS=$(( 100 * (ST - ${SF:-0}) / ST ))
    if [ "$PM" -lt 10 ] || [ "$PS" -gt 80 ]; then item memoria aviso "memória livre ${PM}%, swap usado ${PS}%"
    else item memoria ok "memória livre ${PM}%, swap usado ${PS}%"; fi
  fi
fi

# ---------------------------------------------------------------- Reinício pendente, relógio e certificado
if [ -e "$REBOOT_ARQ" ]; then item reinicio aviso "reinício pendente"; else item reinicio ok "nenhum"; fi
if [ -n "${FILAPRO_NTP:-}" ]; then NTP="$FILAPRO_NTP"; elif command -v timedatectl >/dev/null 2>&1; then NTP=$(timedatectl show -p NTPSynchronized --value 2>/dev/null); else NTP=""; fi
case "$NTP" in no) item relogio aviso "relógio sem sincronização" ;; yes) item relogio ok "sincronizado" ;; esac
if [ -n "${FILAPRO_CERT_DIAS:-}" ]; then DIAS="$FILAPRO_CERT_DIAS"
elif command -v openssl >/dev/null 2>&1; then
  FIM=$(echo | timeout 10 openssl s_client -servername "$DOMINIO" -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  DIAS=""; [ -n "$FIM" ] && DIAS=$(( ( $(date -d "$FIM" +%s) - AGORA_S ) / 86400 ))
else DIAS=""; fi
if [[ "${DIAS:-}" =~ ^-?[0-9]+$ ]]; then
  if [ "$DIAS" -lt 5 ]; then item certificado critico "vence em ${DIAS} dias"
  elif [ "$DIAS" -lt 14 ]; then item certificado aviso "vence em ${DIAS} dias"
  else item certificado ok "válido por ${DIAS} dias"; fi
fi

# ---------------------------------------------------------------- Envio
JSON="{\"itens\":[$(IFS=,; echo "${ITENS[*]}")]}"
if $MOSTRAR; then echo "$JSON"; exit 0; fi
SEGREDO=$(grep '^CRON_SECRET=' "$ENV_WEB" 2>/dev/null | cut -d= -f2- | tr -d '"')
[ -n "$SEGREDO" ] || { echo "ERRO: CRON_SECRET não encontrado em $ENV_WEB"; exit 1; }
echo "$(date '+%Y-%m-%d %H:%M') $(printf '%s' "$JSON" | curl -fsS -m 30 -X POST -H "Authorization: Bearer $SEGREDO" -H 'content-type: application/json' --data-binary @- "$URL" 2>&1 | head -c 300)"
