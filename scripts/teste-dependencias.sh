#!/usr/bin/env bash
# Testa deploy/auditar-dependencias.sh (decisão #175) com um "pnpm" de mentira que devolve resultados prontos (e uma rodada com o pnpm de verdade).
# Uso: bash scripts/teste-dependencias.sh   (precisa de node)
set -u
D="$(cd "$(dirname "$0")/.." && pwd)/deploy"
X=/tmp/ad; B="$X/backups"; PASS=0; FAIL=0
t() { if [ "$2" = "1" ]; then echo "PASSOU — $1"; PASS=$((PASS+1)); else echo "FALHOU — $1 ${3:+($3)}"; FAIL=$((FAIL+1)); fi; }
rm -rf "$X"; mkdir -p "$X/app" "$B"
adv() { # adv ID SEVERIDADE PACOTE -> um aviso no formato do pnpm audit
  printf '"%s":{"github_advisory_id":"%s","id":%s,"module_name":"%s","severity":"%s","title":"Titulo de teste","vulnerable_versions":"<2.0.0","patched_versions":">=2.0.0"}' "$1" "$1" "$RANDOM" "$3" "$2"
}
fake() { printf '#!/bin/bash\ncat <<JSON\n{"actions":[],"advisories":{%s},"muted":[],"metadata":{}}\nJSON\n' "$1" > "$X/pnpm.sh"; chmod +x "$X/pnpm.sh"; }
export FILAPRO_APP="$X/app" FILAPRO_BACKUPS="$B" FILAPRO_PNPM="$X/pnpm.sh" FILAPRO_ACEITAS="$X/aceitas.txt" FILAPRO_HOJE=2026-11-27
: > "$X/aceitas.txt"
rodar() { bash "$D/auditar-dependencias.sh" "$@" 2>&1; }
j() { grep -o "\"$1\":[^,}]*" "$B/estado-dependencias.json" | head -1 | cut -d: -f2- | tr -d '"'; }

fake ""; OUT=$(rodar); RC=$?
t "Sem avisos: ok, código 0, estado ok:true" "$([ $RC -eq 0 ] && [ "$(j ok)" = true ] && [ "$(j executou)" = true ] && echo 1)" "$OUT"
fake "$(adv GHSA-aaaa-1111-bbbb moderate pac-mod),$(adv GHSA-cccc-2222-dddd low pac-low)"; OUT=$(rodar); RC=$?
t "Só moderada/baixa: não é problema (código 0), contadas" "$([ $RC -eq 0 ] && [ "$(j moderadas)" = 2 ] && [ "$(j ok)" = true ] && echo 1)"
fake "$(adv GHSA-eeee-3333-ffff high pac-alto)"; OUT=$(rodar); RC=$?
t "Alta sem exceção: PENDENTE, código 1, ok:false e o aviso aparece na saída" "$([ $RC -eq 1 ] && [ "$(j ok)" = false ] && [ "$(j altas)" = 1 ] && echo "$OUT" | grep -q 'PENDENTE.*GHSA-eeee-3333-ffff pac-alto' && echo 1)" "$OUT"
t "O estado lista o pendente (id e pacote)" "$(grep -q 'GHSA-eeee-3333-ffff pac-alto' "$B/estado-dependencias.json" && echo 1)"
fake "$(adv GHSA-gggg-4444-hhhh critical pac-crit)"; OUT=$(rodar); RC=$?
t "Crítica sem exceção: PENDENTE (criticas=1)" "$([ $RC -eq 1 ] && [ "$(j criticas)" = 1 ] && echo 1)"
echo "GHSA-eeee-3333-ffff | pac-alto | usado só na montagem, sem dados de usuário | 2027-01-31" > "$X/aceitas.txt"
fake "$(adv GHSA-eeee-3333-ffff high pac-alto)"; OUT=$(rodar); RC=$?
t "Alta COM exceção em dia: ok (código 0), aceitas=1 e o motivo aparece" "$([ $RC -eq 0 ] && [ "$(j aceitas)" = 1 ] && [ "$(j ok)" = true ] && echo "$OUT" | grep -q 'sem dados de usuário' && echo 1)" "$OUT"
echo "GHSA-eeee-3333-ffff | pac-alto | motivo antigo | 2026-11-01" > "$X/aceitas.txt"; OUT=$(rodar); RC=$?
t "Exceção VENCIDA: volta a ser problema e diz 'EXCEÇÃO VENCIDA'" "$([ $RC -eq 1 ] && echo "$OUT" | grep -q 'EXCEÇÃO VENCIDA' && echo 1)" "$OUT"
printf '# comentário\n\nlinha-malformada-sem-barras\nGHSA-eeee-3333-ffff | pac-alto | motivo | 2027-01-31\n' > "$X/aceitas.txt"; OUT=$(rodar); t "Comentários, linhas em branco e malformadas são ignorados; a exceção válida vale" "$([ $? -eq 0 ] && echo 1)"
: > "$X/aceitas.txt"; printf '#!/bin/bash\necho "erro de rede" >&2; exit 1\n' > "$X/pnpm.sh"
OUT=$(rodar); RC=$?
t "pnpm que falha (sem internet): código 1, executou:false e mensagem clara" "$([ $RC -eq 1 ] && [ "$(j executou)" = false ] && [ "$(j ok)" = false ] && echo "$OUT" | grep -q 'não consegui executar' && echo 1)" "$OUT"
printf '#!/bin/bash\necho "isto nao e json"\n' > "$X/pnpm.sh"; OUT=$(rodar); t "Resposta que não é JSON: tratada como não executou (não quebra)" "$([ $? -eq 1 ] && [ "$(j executou)" = false ] && echo 1)"
fake "$(adv 'GHSA-x\"y' high 'pac\"; rm -rf /')"; OUT=$(rodar); RC=$?
t "Nomes com aspas/símbolos: o estado continua um JSON válido (sanitizado)" "$(node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$B/estado-dependencias.json" 2>/dev/null && echo 1)"
t "O estado tem permissão 600" "$([ "$(stat -c %a "$B/estado-dependencias.json")" = 600 ] && echo 1)"
# rodada com o pnpm de verdade neste repositório (precisa de internet; sem internet só confere que não quebra)
unset FILAPRO_PNPM FILAPRO_ACEITAS; export FILAPRO_APP="$(cd "$D/.." && pwd)"
OUT=$(timeout 150 bash "$D/auditar-dependencias.sh" 2>&1); RC=$?
t "pnpm audit de verdade neste repositório: sem vulnerabilidade alta/crítica pendente (ou sem internet: erro claro)" "$([ $RC -eq 0 ] || echo "$OUT" | grep -q 'não consegui executar' && echo 1)" "$OUT"
rm -rf "$X"
echo; echo "== $PASS passaram, $FAIL falharam =="; [ "$FAIL" -eq 0 ]
