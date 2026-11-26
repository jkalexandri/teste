#!/bin/bash
# Regressão completa (site + serviço 24/7) — ambiente de TESTE, nunca na VPS de produção (os testes criam e apagam dados).
# Pré-requisitos: Postgres de teste em /var/tmp:5433 (banco "filapro", com seed de demonstração),
# site em http://localhost:3005 (CRON_SECRET=segredo-teste ASAAS_URL=http://127.0.0.1:4010 — Asaas de mentira dos testes) e serviço 24/7 em 127.0.0.1:4000 (DISPAROS=desligado).
# Uso: bash scripts/regressao.sh   (leva ~40 minutos)
cd "$(dirname "$0")/.."
PRINTS=${PRINTS:-/tmp/regressao-prints}; mkdir -p "$PRINTS"
Q='psql -h /var/tmp -p 5433 -U postgres -d filapro -tAc'
# Liga o serviço 24/7 de teste (o padrão "src/[i]ndex" evita que o pkill derrube este próprio script)
ligar_worker() { (cd apps/worker && set -a && . ./.env && set +a && PASTA_ARQUIVOS=/var/tmp/filapro-arquivos nohup npx tsx src/index.ts > /tmp/worker-teste.log 2>&1 &); sleep 7; }
# Teste que para no meio (erro/tempo esgotado) conta como falha: "PAROU NO MEIO"
conta() { o=$(timeout 600 node apps/web/tests/$1.e2e.cjs "$PRINTS" 2>&1); c=$?; p=""; [ $c -ne 0 ] && p="PAROU NO MEIO (código $c) —"; echo "$1: $(echo "$o" | grep -c '^PASSOU') passaram, $(echo "$o" | grep -c '^FALHOU') falharam $p $(echo "$o" | grep -m3 -E '^FALHOU|Error' | tr '\n' ' ')"; }
# O teste login-regras troca a senha da conta de demonstração "usuario@…": volta a senha padrão
restaura() { $Q "update \"Usuario\" u set \"senhaHash\"=a.\"senhaHash\", \"bloqueadoAte\"=null, \"tentativasFalhas\"=0, \"senhaTempHash\"=null from \"Usuario\" a where a.email='ana@empresaexemplo.com.br' and u.email='usuario@disparopro.com.br'" >/dev/null; }
for t in etapa3-layout login-regras etapa27-primeiro-acesso etapa28-conta-sem-acesso; do conta $t; restaura; done
for t in etapa4a-planos etapa4b-compra etapa4c-empresas etapa4d-renovacao etapa5-usuarios etapa7-leads etapa8a-campanhas etapa8c-paineis etapa9a-ia etapa9b-empresa-ia etapa10-conversas etapa10b-avisos-anuncios etapa10c-whatsapp-extra etapa11-relatorios etapa12-logs-app etapa12b-ajuda etapa13-online-suporte etapa14-manutencao etapa14b-interessados etapa15-seguranca etapa16-financeiro etapa17-planos-abas etapa17b-instalar-app etapa18-preco-quantidade etapa18b-individuais-tipo etapa19a-asaas-config etapa19b-asaas-pagamento etapa19c-asaas-confirmacao etapa19d-asaas-automatica etapa20-upgrade etapa21-acesso-telas legal; do conta $t; restaura; done
# A etapa 6 precisa da porta 4000 livre; a 8b precisa do motor de envios ligado
pkill -f "src/[i]ndex.ts"; sleep 2
conta etapa6-whatsapp; restaura
DISPAROS= ligar_worker
conta etapa8b-envio
# O teste do status do login espera o motor de envios desligado
pkill -f "src/[i]ndex.ts"; sleep 2
(cd apps/worker && set -a && . ./.env && set +a && DISPAROS=desligado PASTA_ARQUIVOS=/var/tmp/filapro-arquivos nohup npx tsx src/index.ts > /tmp/worker-teste.log 2>&1 &); sleep 7
conta etapa16b-status-login
pkill -f "src/[i]ndex.ts"; sleep 1
(cd apps/worker && set -a && . ./.env && set +a && echo "worker-unit: $(npx tsx --test --test-concurrency=1 tests/*.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')")
(cd packages/ia && set -a && . ../../apps/web/.env.local && set +a && echo "ia-unit: $(npx tsx --test tests/*.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')")
(cd apps/web && set -a && . ./.env.local && set +a && echo "leads-unit: $(../worker/node_modules/.bin/tsx --test tests/leads-unit.test.ts 2>&1 | grep -E '^# (pass|fail)' | tr '\n' ' ')")
(cd apps/worker && set -a && . ./.env && set +a && DISPAROS=desligado PASTA_ARQUIVOS=/var/tmp/filapro-arquivos nohup npx tsx src/index.ts > /tmp/worker-teste.log 2>&1 &)
echo FIM
