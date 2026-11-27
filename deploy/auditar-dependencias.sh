#!/usr/bin/env bash
# Auditoria de dependências (decisão #175 — Módulo 12, O7). Roda toda semana (cron de domingo 05:00) e a cada entrega de código.
# Usa "pnpm audit" (todas as dependências, inclusive as de desenvolvimento, que também rodam na VPS na hora de montar o site).
# Vulnerabilidade ALTA ou CRÍTICA que não esteja em deploy/dependencias-aceitas.txt (e com a reavaliação em dia) = problema (aviso por e-mail pelo vigia).
# Resultado em backups/estado-dependencias.json. Uso: auditar-dependencias.sh [--mostrar]  (--mostrar lista os avisos encontrados)
set -uo pipefail
umask 077
DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
APP="${FILAPRO_APP:-$RAIZ/app}"
PASTA="${FILAPRO_BACKUPS:-$RAIZ/backups}"
PNPM="${FILAPRO_PNPM:-pnpm}"
ACEITAS="${FILAPRO_ACEITAS:-$DIR/dependencias-aceitas.txt}"
HOJE="${FILAPRO_HOJE:-$(date +%Y-%m-%d)}"
ESTADO="$PASTA/estado-dependencias.json"
MOSTRAR=false; [ "${1:-}" = "--mostrar" ] && MOSTRAR=true
mkdir -p "$PASTA"; chmod 700 "$PASTA" 2>/dev/null || true
quando() { date '+%Y-%m-%dT%H:%M:%S'; }
LOGTMP="$(mktemp)"; trap 'rm -f "$LOGTMP"' EXIT

if ! (cd "$APP" && timeout 120 $PNPM audit --json > "$LOGTMP" 2>/dev/null; true) || ! grep -q '"advisories"' "$LOGTMP"; then
  printf '{"quando":"%s","ok":false,"executou":false,"altas":0,"criticas":0,"moderadas":0,"aceitas":0,"pendentes":"","erros":"a auditoria nao executou (sem internet ou registro fora do ar)"}\n' "$(quando)" > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
  echo "ERRO: não consegui executar o pnpm audit (sem internet ou o registro está fora do ar). Tente de novo mais tarde."; exit 1
fi

RES="$(node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const hoje=process.argv[3];
const aceitas={};
for (const l of fs.existsSync(process.argv[2])?fs.readFileSync(process.argv[2],"utf8").split("\n"):[]) {
  if (!l.trim()||l.trim().startsWith("#")) continue;
  const p=l.split("|").map(s=>s.trim()); if (p.length<4) continue;
  aceitas[p[0]]={ate:p[3],motivo:p[2]};
}
let altas=0,crit=0,mod=0,ace=0; const pend=[]; const linhas=[];
for (const a of Object.values(j.advisories||{})) {
  const sev=a.severity, id=a.github_advisory_id||String(a.id), pac=a.module_name;
  if (sev==="moderate"||sev==="low") { mod++; continue; }
  if (sev==="high") altas++; if (sev==="critical") crit++;
  const ex=aceitas[id];
  if (ex && ex.ate>=hoje) { ace++; linhas.push(`  ACEITA   [${sev}] ${id} ${pac} — ${ex.motivo} (reavaliar até ${ex.ate})`); }
  else { pend.push(`${id} ${pac}`); linhas.push(`  PENDENTE [${sev}] ${id} ${pac} — ${a.title}${ex?" (EXCEÇÃO VENCIDA em "+ex.ate+")":""} — corrigir ${a.patched_versions}`); }
}
console.log(JSON.stringify({altas,crit,mod,ace,pend:pend.join("; ").replace(/[^A-Za-z0-9 ;._@\/-]/g,""),linhas}));
' "$LOGTMP" "$ACEITAS" "$HOJE")"
ALTAS="$(echo "$RES" | node -pe 'JSON.parse(require("fs").readFileSync(0)).altas')"; CRIT="$(echo "$RES" | node -pe 'JSON.parse(require("fs").readFileSync(0)).crit')"
MOD="$(echo "$RES" | node -pe 'JSON.parse(require("fs").readFileSync(0)).mod')"; ACE="$(echo "$RES" | node -pe 'JSON.parse(require("fs").readFileSync(0)).ace')"
PEND="$(echo "$RES" | node -pe 'JSON.parse(require("fs").readFileSync(0)).pend')"
OKJ=true; [ -n "$PEND" ] && OKJ=false
printf '{"quando":"%s","ok":%s,"executou":true,"altas":%s,"criticas":%s,"moderadas":%s,"aceitas":%s,"pendentes":"%s","erros":""}\n' "$(quando)" "$OKJ" "$ALTAS" "$CRIT" "$MOD" "$ACE" "$PEND" > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
echo "Auditoria de dependências: $CRIT crítica(s), $ALTAS alta(s), $MOD moderada(s)/baixa(s); $ACE aceita(s) com justificativa."
echo "$RES" | node -e 'for (const l of JSON.parse(require("fs").readFileSync(0)).linhas) console.log(l)'
if $OKJ; then echo "Nenhuma vulnerabilidade alta ou crítica pendente."; exit 0; fi
echo "HÁ vulnerabilidade(s) alta(s)/crítica(s) PENDENTE(S): corrija a dependência ou, se for uma exceção justificada, registre em deploy/dependencias-aceitas.txt."; exit 1
