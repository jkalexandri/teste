#!/usr/bin/env bash
# Diagnóstico da VPS (decisão #168 — Passo 0 e Módulo 12). SOMENTE LEITURA: não altera, não apaga e não reinicia nada.
# Mostra o estado real: sistema, relógio, serviços, site, backup, arquivos, chaves (só os NOMES), banco, aplicação e logs.
# NUNCA mostra senhas, chaves, tokens, DATABASE_URL nem valores dos .env. Cada linha sai como [OK], [ATENCAO] ou [FALHA].
# Uso (como root):  bash /opt/filapro/app/deploy/diagnostico-vps.sh      — depois, mande a tela inteira para o desenvolvedor.
# Para testar fora da VPS: FILAPRO_RAIZ=/outra/pasta  FILAPRO_BANCO=nome  FILAPRO_DOMINIO=exemplo.com  FILAPRO_PSQL="psql -h /var/tmp -p 5433 -U postgres"

RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
BANCO="${FILAPRO_BANCO:-filaproleads}"
DOMINIO="${FILAPRO_DOMINIO:-filaproleads.com.br}"
APP="$RAIZ/app"
ENV_WEB="$APP/apps/web/.env.production"
ENV_WORKER="$APP/apps/worker/.env"
export LC_ALL=C

N_OK=0; N_ATEN=0; N_FALHA=0
ok()    { echo "  [OK]       $*"; N_OK=$((N_OK+1)); }
aten()  { echo "  [ATENCAO]  $*"; N_ATEN=$((N_ATEN+1)); }
falha() { echo "  [FALHA]    $*"; N_FALHA=$((N_FALHA+1)); }
info()  { echo "             $*"; }
secao() { echo; echo "== $* =="; }
tem()   { command -v "$1" >/dev/null 2>&1; }
# Roda com limite de tempo (uma consulta lenta não trava as outras)
lim()   { timeout "${LIMITE:-15}" "$@" 2>/dev/null; }
# Tira qualquer coisa parecida com segredo de um texto
oculta() { sed -E 's/(bearer|token|senha|password|passwd|secret|chave|apikey|api_key)[^[:space:]]*/[oculto]/Ig'; }
# Valor de uma variável de um .env (para COMPARAR; nunca é mostrado)
valor() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }
# SQL no banco do FilaPro (somente consultas de leitura)
sql()   { if [ -n "${FILAPRO_PSQL:-}" ]; then lim $FILAPRO_PSQL -qtA "$BANCO" -c "$1"; elif [ "$(id -u)" = "0" ] && tem sudo; then lim sudo -u postgres psql -qtA "$BANCO" -c "$1"; else lim psql -qtA "$BANCO" -c "$1"; fi; }
# Idade em horas de um arquivo
horas() { echo $(( ( $(date +%s) - $(stat -c %Y "$1") ) / 3600 )); }

echo "DIAGNÓSTICO DA VPS — somente leitura — $(date '+%d/%m/%Y %H:%M:%S %Z')"
echo "(não mostra senhas, chaves nem valores dos .env)"
[ "$(id -u)" = "0" ] || aten "Você não é root: algumas verificações ficam sem resposta. Rode com:  sudo bash $0"

# ---------------------------------------------------------------- 1. Sistema
secao "1. Sistema"
[ -r /etc/os-release ] && info "$(. /etc/os-release; echo "$PRETTY_NAME")"
tem uptime && info "no ar há: $(uptime -p 2>/dev/null)"
if [ -r /proc/loadavg ] && tem nproc; then
  CARGA=$(cut -d' ' -f1 /proc/loadavg); NUC=$(nproc)
  if awk -v c="$CARGA" -v n="$NUC" 'BEGIN{exit !(c > n*1.5)}'; then aten "Carga alta: $CARGA (processadores: $NUC)"; else ok "Carga normal: $CARGA (processadores: $NUC)"; fi
fi
if tem free; then
  read -r MT MD < <(free -m | awk '/^Mem:/{print $2, $7}')
  read -r ST SU < <(free -m | awk '/^Swap:/{print $2, $3}')
  info "memória: ${MD}MB livres de ${MT}MB; swap: ${SU}MB usados de ${ST}MB"
  if [ "${MD:-0}" -lt 250 ]; then aten "Pouca memória livre (${MD}MB): o sistema pode matar processos"; else ok "Memória livre suficiente (${MD}MB)"; fi
  if [ "${ST:-0}" -eq 0 ]; then aten "Sem swap (a documentação pede 2 GB)"; elif [ "$SU" -gt $((ST/2)) ]; then aten "Swap em uso alto (${SU}MB de ${ST}MB)"; else ok "Swap em ordem"; fi
fi
for ponto in / "$RAIZ"; do
  [ -d "$ponto" ] || continue
  USO=$(df -P "$ponto" 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}'); LIVRE=$(df -Ph "$ponto" 2>/dev/null | awk 'NR==2{print $4}')
  [ -n "$USO" ] || continue
  if [ "$USO" -ge 90 ]; then falha "Disco $ponto com ${USO}% de uso (livre: $LIVRE)"; elif [ "$USO" -ge 80 ]; then aten "Disco $ponto com ${USO}% de uso (livre: $LIVRE)"; else ok "Disco $ponto com ${USO}% de uso (livre: $LIVRE)"; fi
done
INODES=$(df -Pi / 2>/dev/null | awk 'NR==2{gsub("%","",$5); print $5}')
[ -n "$INODES" ] && { [ "$INODES" -ge 80 ] && aten "Inodes do disco em ${INODES}%" || ok "Inodes do disco em ${INODES}%"; }
for p in "$RAIZ/backups" "$RAIZ/arquivos" /var/log "${HOME:-/root}/.pm2/logs"; do
  [ -d "$p" ] && info "tamanho de $p: $(LIMITE=25 lim du -sh "$p" | cut -f1)"
done
if [ -f /var/run/reboot-required ]; then aten "Reinício pendente (correções de segurança do sistema só valem depois de reiniciar)"; [ -r /var/run/reboot-required.pkgs ] && info "pacotes: $(head -5 /var/run/reboot-required.pkgs | tr '\n' ' ')"; else ok "Nenhum reinício pendente"; fi

# ---------------------------------------------------------------- 2. Relógio
secao "2. Relógio (a verificação em duas etapas depende dele)"
if tem timedatectl; then
  SINC=$(lim timedatectl show -p NTPSynchronized --value); FUSO=$(lim timedatectl show -p Timezone --value)
  info "agora: $(date '+%d/%m/%Y %H:%M:%S %Z') — fuso: ${FUSO:-?}"
  if [ "$SINC" = "yes" ]; then ok "Relógio sincronizado com a internet"; else falha "Relógio NÃO sincronizado: códigos da verificação em duas etapas podem ser recusados"; fi
  OFF=$(lim timedatectl timesync-status | grep -i 'Offset' | head -1 | sed 's/^ *//'); [ -n "$OFF" ] && info "$OFF"
else
  aten "timedatectl não encontrado: não foi possível verificar o relógio"
fi

# ---------------------------------------------------------------- 3. Serviços
secao "3. Serviços"
if tem pm2; then
  LISTA=$(lim pm2 jlist | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const i=d.search(/^\[\s*[\{\]]/m);const a=JSON.parse(d.slice(i));for(const p of a){const e=p.pm2_env||{};console.log([p.name,e.status,e.restart_time,Math.round((Date.now()-e.pm_uptime)/3600000)+"h",Math.round(((p.monit||{}).memory||0)/1048576)+"MB"].join("|"))}}catch(e){process.exit(2)}})' 2>/dev/null)
  if [ -z "$LISTA" ]; then aten "pm2: não foi possível listar os processos"; else
    for nome in filapro-web filapro-worker; do
      L=$(echo "$LISTA" | grep "^$nome|")
      if [ -z "$L" ]; then falha "pm2: processo $nome não existe"; continue; fi
      IFS='|' read -r _ EST REIN UP MEM <<< "$L"
      if [ "$EST" = "online" ]; then ok "pm2 $nome: online (reinícios: $REIN, no ar há $UP, memória $MEM)"; else falha "pm2 $nome: $EST"; fi
      [ "${REIN:-0}" -ge 15 ] && aten "pm2 $nome reiniciou $REIN vezes: veja 'pm2 logs $nome'"
    done
  fi
  if lim systemctl is-enabled pm2-root >/dev/null; then ok "pm2 volta sozinho depois de reiniciar a VPS (pm2-root habilitado)"; else aten "pm2 pode NÃO voltar sozinho após reiniciar a VPS (rode: pm2 startup systemd, depois pm2 save)"; fi
else
  aten "pm2 não encontrado: não foi possível verificar o site e o serviço 24/7"
fi
for s in caddy postgresql fail2ban unattended-upgrades; do
  if tem systemctl; then
    EST=$(lim systemctl is-active "$s")
    if [ "$EST" = "active" ]; then ok "$s: ativo"; else aten "$s: ${EST:-desconhecido}"; fi
  fi
done
if tem ufw; then
  if lim ufw status | head -1 | grep -qi "active"; then ok "Firewall (ufw) ativo"; else aten "Firewall (ufw) inativo ou sem permissão para consultar"; fi
fi
if tem sshd; then
  SSH=$(lim sshd -T | grep -E '^(passwordauthentication|permitrootlogin) ' | tr '\n' ' ')
  if echo "$SSH" | grep -q 'passwordauthentication no'; then ok "SSH só com chave ($SSH)"; elif [ -n "$SSH" ]; then aten "SSH aceita senha ($SSH): rode deploy/seguranca-vps.sh depois de cadastrar a chave"; fi
fi
ULT=/var/log/unattended-upgrades/unattended-upgrades.log
[ -f "$ULT" ] && info "última atualização automática: $(date -r "$ULT" '+%d/%m/%Y %H:%M')"

# ---------------------------------------------------------------- 4. Site e portas
secao "4. Site, serviço 24/7 e portas"
if tem curl; then
  C=$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:3000/login 2>/dev/null); [ "$C" = "200" ] && ok "Site (porta 3000) responde 200" || falha "Site (porta 3000) respondeu: ${C:-sem resposta}"
  C=$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:4000/saude 2>/dev/null); [ "$C" = "200" ] && ok "Serviço 24/7 (porta 4000, /saude) responde 200" || falha "Serviço 24/7 respondeu: ${C:-sem resposta}"
  C=$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:3000/api/status 2>/dev/null); info "api/status respondeu: ${C:-sem resposta}"
fi
if tem openssl; then
  FIM=$(echo | lim openssl s_client -servername "$DOMINIO" -connect 127.0.0.1:443 | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$FIM" ]; then
    DIAS=$(( ( $(date -d "$FIM" +%s) - $(date +%s) ) / 86400 ))
    if [ "$DIAS" -lt 5 ]; then falha "Certificado HTTPS de $DOMINIO vence em $DIAS dia(s)"; elif [ "$DIAS" -lt 20 ]; then aten "Certificado HTTPS de $DOMINIO vence em $DIAS dias"; else ok "Certificado HTTPS de $DOMINIO válido por mais $DIAS dias"; fi
  else aten "Não foi possível ler o certificado HTTPS de $DOMINIO (Caddy parado?)"; fi
fi
if tem ss; then
  PUBLICAS=$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -E '^(0\.0\.0\.0|\[::\]|\*):' | sed -E 's/.*://' | sort -un | tr '\n' ' ')
  OUTRAS=$(echo "$PUBLICAS" | tr ' ' '\n' | grep -vE '^(22|80|443|)$' | tr '\n' ' ')
  info "portas abertas para a internet: ${PUBLICAS:-nenhuma}"
  if [ -z "$OUTRAS" ]; then ok "Só 22, 80 e 443 escutam para fora"; else aten "Portas além de 22, 80 e 443 escutando para fora: $OUTRAS (3000, 4000 e 5432 devem ficar só em 127.0.0.1)"; fi
fi

# ---------------------------------------------------------------- 5. Backup
secao "5. Backup do banco"
CRON=$(crontab -l 2>/dev/null | grep -i filapro | oculta)
if [ -n "$CRON" ]; then
  echo "$CRON" | while IFS= read -r l; do info "cron: $l"; done
  # Backup completo diário (#169); aceita também a linha antiga do backup-banco.sh
  if echo "$CRON" | grep -q 'backup-completo.sh completo'; then ok "Backup completo diário está agendado no cron"
  elif echo "$CRON" | grep -q 'backup-banco.sh'; then aten "Só o backup antigo do banco está agendado (sem arquivos e chaves): troque pelo backup-completo.sh (docs/publicacao-vps.md 6.1)"
  else falha "Backup NÃO está agendado no cron (nenhuma linha com backup-completo.sh)"; fi
  echo "$CRON" | grep -q 'backup-completo.sh banco' && ok "Dump do banco a cada 6 h está agendado" || aten "Dump do banco a cada 6 h não está no cron (backup-completo.sh banco)"
  echo "$CRON" | grep -q 'vigia-servico.sh' && ok "Vigia do serviço 24/7 está agendado" || aten "Vigia do serviço 24/7 não está no cron"
  echo "$CRON" | grep -q 'rotinas.sh' && ok "Rotinas diárias (renovações) estão agendadas" || aten "Rotinas diárias não estão no cron"
else
  falha "Nenhuma linha do FilaPro no cron do root: backup, rotinas e vigia NÃO estão agendados (ou você não é root)"
fi
PASTA="$RAIZ/backups"
if [ -d "$PASTA" ]; then
  MP=$(stat -c %a "$PASTA"); info "pasta: $PASTA (permissão $MP, dono $(stat -c %U "$PASTA")) — total $(LIMITE=25 lim du -sh "$PASTA" | cut -f1)"
  case "$MP" in *00) ok "Pasta de backups restrita ($MP)";; *) aten "Pasta de backups legível por outros usuários ($MP): deveria ser 700 (rode: chmod 700 $PASTA)";; esac
  # Todos os dumps do banco, do mais novo para o mais antigo (pelo NOME, que tem a data): antes de atualizar (raiz), diários e a cada 6 h
  mapfile -t ARQS < <(for f in "$PASTA"/filapro-*.sql.gz "$PASTA"/diarios/banco-*.sql.gz "$PASTA"/6h/banco-*.sql.gz; do
      [ -f "$f" ] && echo "$(basename "$f" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}') $f"; done | sort -r | awk '{print $2}')
  QTD=${#ARQS[@]}
  info "dumps do banco: $QTD — antes de atualizar: $(ls -1 "$PASTA"/filapro-*.sql.gz 2>/dev/null | wc -l), diários: $(ls -1 "$PASTA"/diarios/banco-*.sql.gz 2>/dev/null | wc -l), a cada 6 h: $(ls -1 "$PASTA"/6h/banco-*.sql.gz 2>/dev/null | wc -l), semanais: $(ls -1 "$PASTA"/semanais/banco-*.sql.gz 2>/dev/null | wc -l), mensais: $(ls -1 "$PASTA"/mensais/banco-*.sql.gz 2>/dev/null | wc -l)"
  if [ "$QTD" -eq 0 ]; then falha "Nenhum backup do banco encontrado em $PASTA"; else
    NOVO="${ARQS[0]}"; H=$(horas "$NOVO"); TAM=$(stat -c %s "$NOVO")
    info "mais recente: $(basename "$NOVO") — $(du -h "$NOVO" | cut -f1) — há ${H}h"
    if [ "$H" -le 8 ]; then ok "Último dump do banco tem ${H}h"; elif [ "$H" -le 26 ]; then ok "Último dump do banco tem ${H}h (diário em dia)"; elif [ "$H" -le 50 ]; then aten "Último dump do banco tem ${H}h: o de ontem falhou?"; else falha "Último dump do banco tem ${H}h (parado!)"; fi
    [ "$TAM" -lt 10240 ] && falha "Último dump tem só ${TAM} bytes: provavelmente vazio"
    MA=$(stat -c %a "$NOVO"); case "$MA" in *00) ok "Backup restrito ($MA)";; *) aten "Backup legível por outros usuários ($MA): deveria ser 600 (contém todos os dados dos clientes)";; esac
    # integridade dos 3 mais recentes
    TABELAS_VIVAS=$(sql "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")
    for i in 0 1 2; do
      A="${ARQS[$i]:-}"; [ -n "$A" ] || continue
      if LIMITE=90 lim gunzip -t "$A"; then
        T=$(LIMITE=90 lim zcat "$A" | grep -c '^CREATE TABLE public\.')
        if [ "$i" -eq 0 ] && [ -n "$TABELAS_VIVAS" ]; then
          if [ "$T" -eq "$TABELAS_VIVAS" ]; then ok "$(basename "$A") abre e tem $T tabelas (igual ao banco atual)"; elif [ "$T" -gt 0 ]; then aten "$(basename "$A") abre e tem $T tabelas; o banco atual tem $TABELAS_VIVAS (normal se houve atualização depois do backup)"; else falha "$(basename "$A") abre, mas não tem nenhuma tabela"; fi
        else
          [ "$T" -gt 0 ] && ok "$(basename "$A") abre e tem $T tabelas" || falha "$(basename "$A") abre, mas não tem nenhuma tabela"
        fi
      else
        falha "$(basename "$A") está CORROMPIDO (não abre)"
      fi
    done
  fi
  # Backup completo (decisão #169): arquivos enviados e chaves, e o resultado do último
  UA=$(ls -1 "$PASTA"/diarios/arquivos-*.tar.gz 2>/dev/null | sort -r | head -1); UC=$(ls -1 "$PASTA"/diarios/chaves-*.tar.gz.enc 2>/dev/null | sort -r | head -1)
  if [ -n "$UA" ]; then HA=$(horas "$UA"); if [ "$HA" -le 26 ]; then ok "Backup dos arquivos enviados tem ${HA}h ($(basename "$UA"))"; else aten "Backup dos arquivos enviados tem ${HA}h (o completo diário falhou?)"; fi; else aten "Ainda não há backup dos arquivos enviados (o backup completo ainda não rodou: bash deploy/backup-completo.sh)"; fi
  if [ -n "$UC" ]; then HC=$(horas "$UC"); if [ "$HC" -le 26 ]; then ok "Backup das chaves (criptografado) tem ${HC}h ($(basename "$UC"))"; else aten "Backup das chaves tem ${HC}h"; fi; else aten "Ainda não há backup das chaves do sistema (crie a senha: bash deploy/backup-senha.sh, depois rode o backup completo)"; fi
  if [ -f /root/.filapro-backup-senha ]; then ok "Senha do backup das chaves configurada ($(stat -c %a /root/.filapro-backup-senha))"; else aten "Senha do backup das chaves NÃO configurada (bash deploy/backup-senha.sh)"; fi
  for e in completo banco; do
    J="$PASTA/estado-$e.json"
    if [ -f "$J" ]; then
      if grep -q '"ok":true' "$J"; then ok "Último backup $e: sucesso ($(grep -o '"quando":"[^"]*"' "$J" | cut -d'"' -f4))"; else falha "Último backup $e terminou COM PROBLEMAS: $(grep -o '"erros":"[^"]*"' "$J" | cut -d'"' -f4)"; fi
    fi
  done
  info "camadas: diárias $(ls -1 "$PASTA"/diarios/banco-*.sql.gz 2>/dev/null | wc -l)/14, semanais $(ls -1 "$PASTA"/semanais/banco-*.sql.gz 2>/dev/null | wc -l)/8, mensais $(ls -1 "$PASTA"/mensais/banco-*.sql.gz 2>/dev/null | wc -l)/6"
else
  falha "Pasta de backups $PASTA não existe"
fi
LOGB=/var/log/filapro-backup.log
if [ -f "$LOGB" ]; then info "log do backup ($(date -r "$LOGB" '+%d/%m/%Y %H:%M')), últimas linhas:"; tail -n 3 "$LOGB" | oculta | while IFS= read -r l; do info "  $l"; done; elif [ -f "$RAIZ/backups/estado-completo.json" ]; then info "Ainda sem log do cron em $LOGB (normal até a primeira execução automática, às 03:30; o backup manual não grava nele)"
else aten "Sem log do backup em $LOGB (o cron nunca rodou?)"; fi
[ -f "$RAIZ/backup-antes-da-atualizacao" ] && info "ponto de volta da última atualização: $(basename "$(cat "$RAIZ/backup-antes-da-atualizacao" 2>/dev/null)")"
PACOTES=$(ls -1 "$RAIZ"/mudanca-*.tar.gz 2>/dev/null)
if [ -n "$PACOTES" ]; then
  echo "$PACOTES" | while IFS= read -r p; do
    M=$(stat -c %a "$p")
    aten "Pacote de mudança $(basename "$p") existe (modo $M, há $(horas "$p")h): CONTÉM AS CHAVES do sistema. Apague depois de usar"
  done
else ok "Nenhum pacote de mudança esquecido na VPS"; fi

# ---------------------------------------------------------------- 6. Arquivos enviados
secao "6. Arquivos enviados pelos usuários (entram no backup completo — decisão #169)"
PASTA_ARQ=$(valor "$ENV_WORKER" PASTA_ARQUIVOS); PASTA_ARQ="${PASTA_ARQ:-$RAIZ/arquivos}"
if [ -d "$PASTA_ARQ" ]; then
  NA=$(LIMITE=25 lim find "$PASTA_ARQ" -type f | wc -l)
  info "pasta: $PASTA_ARQ — $NA arquivo(s), $(LIMITE=25 lim du -sh "$PASTA_ARQ" | cut -f1)"
  if [ "$NA" -eq 0 ]; then ok "Pasta de arquivos vazia"
  elif ls "$RAIZ"/backups/diarios/arquivos-*.tar.gz >/dev/null 2>&1; then ok "Os $NA arquivo(s) entram no backup completo (diários/arquivos-*.tar.gz)"
  else aten "Há $NA arquivo(s) que só existem nesta VPS e ainda não têm backup (rode: bash deploy/backup-completo.sh)"; fi
else
  aten "Pasta de arquivos $PASTA_ARQ não existe"
fi

# ---------------------------------------------------------------- 7. Chaves e configuração (.env) — só nomes
secao "7. Chaves e configuração (só os NOMES; nunca os valores)"
for f in "$ENV_WEB" "$ENV_WORKER"; do
  if [ -f "$f" ]; then
    MODO=$(stat -c %a "$f"); DONO=$(stat -c %U "$f")
    case "$MODO" in *00) ok "$(basename "$f"): permissão restrita ($MODO, dono $DONO)";; *) falha "$(basename "$f"): legível por outros usuários ($MODO)! Rode: chmod 600 $f";; esac
    info "variáveis em $(basename "$f"): $(grep -E '^[A-Z0-9_]+=' "$f" | cut -d= -f1 | sort | tr '\n' ' ')"
  else
    falha "Arquivo $f não existe"
  fi
done
if [ -f "$ENV_WEB" ] && [ -f "$ENV_WORKER" ]; then
  for v in CHAVE_CRIPTO WORKER_TOKEN DATABASE_URL; do
    A=$(valor "$ENV_WEB" "$v"); B=$(valor "$ENV_WORKER" "$v")
    if [ -z "$A" ] || [ -z "$B" ]; then falha "$v: ausente em um dos arquivos"; elif [ "$A" = "$B" ]; then ok "$v: igual no site e no serviço 24/7"; else falha "$v: DIFERENTE entre o site e o serviço 24/7"; fi
  done
  CC=$(valor "$ENV_WEB" CHAVE_CRIPTO); [ -n "$CC" ] && info "CHAVE_CRIPTO tem ${#CC} caracteres"
  for v in CRON_SECRET VAPID_PUBLIC_KEY; do [ -n "$(valor "$ENV_WEB" "$v")" ] || aten "$v ausente no .env do site"; done
  [ -n "$(valor "$ENV_WORKER" VAPID_PRIVATE_KEY)" ] || aten "VAPID_PRIVATE_KEY ausente no .env do serviço 24/7"
  AMB=$(valor "$ENV_WEB" NEXT_PUBLIC_APP_ENV); if [ "$AMB" = "production" ]; then ok "NEXT_PUBLIC_APP_ENV=production (sem botões de demonstração no login)"; else falha "NEXT_PUBLIC_APP_ENV='${AMB:-vazio}': o login pode mostrar contas de demonstração!"; fi
  WU=$(valor "$ENV_WEB" WORKER_URL); case "$WU" in http://127.0.0.1:*|http://localhost:*) ok "WORKER_URL aponta para dentro da VPS ($WU)";; *) aten "WORKER_URL='${WU:-vazio}': o serviço 24/7 deveria ser acessado por http://127.0.0.1:4000";; esac
  [ -n "$(valor "$ENV_WORKER" RESEND_API_KEY)" ] && ok "RESEND_API_KEY presente no serviço 24/7 (alerta por e-mail do número da plataforma)" || aten "RESEND_API_KEY ausente no serviço 24/7: o alerta por e-mail da queda do número da plataforma não sai"
fi

# ---------------------------------------------------------------- 8. Banco de dados
secao "8. Banco de dados"
V=$(sql "select split_part(version(),' on ',1)")
if [ -z "$V" ]; then falha "Não foi possível consultar o banco '$BANCO' (parado, sem permissão ou nome diferente)"; else
  info "$V"
  info "tamanho do banco: $(sql "select pg_size_pretty(pg_database_size('$BANCO'))")"
  info "maiores tabelas: $(sql "select string_agg(relname||' '||pg_size_pretty(pg_total_relation_size(c.oid)), ', ' order by pg_total_relation_size(c.oid) desc) from (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public' order by pg_total_relation_size(c.oid) desc limit 5) c")"
  CON=$(sql "select count(*) from pg_stat_activity where datname='$BANCO'"); MAXC=$(sql "show max_connections")
  info "conexões abertas: $CON de $MAXC"
  LA=$(sql "show listen_addresses"); case "$LA" in localhost|127.0.0.1|"localhost,127.0.0.1"|"") ok "Banco escuta só em localhost ($LA)";; *) aten "Banco escuta em '$LA': deveria ser só localhost";; esac
  MIG=$(sql "select count(*)||' migrações, a última em '||coalesce(to_char(max(finished_at),'DD/MM/YYYY HH24:MI'),'-') from _prisma_migrations"); [ -n "$MIG" ] && info "$MIG"
  MAN=$(sql "select ligada from \"Manutencao\" limit 1"); case "$MAN" in f) ok "Modo manutenção desligado";; t) aten "Modo manutenção LIGADO (clientes bloqueados)";; esac
fi

# ---------------------------------------------------------------- 9. Aplicação
secao "9. Aplicação"
if [ -f "$APP/package.json" ] && tem node; then info "versão instalada: v$(node -p "require('$APP/package.json').version" 2>/dev/null)"; fi
if tem git && [ -d "$APP/.git" ]; then
  info "commit: $(git -C "$APP" rev-parse --short HEAD 2>/dev/null) ($(git -C "$APP" rev-parse --abbrev-ref HEAD 2>/dev/null))"
  ALT=$(git -C "$APP" status --porcelain 2>/dev/null | wc -l)
  [ "$ALT" -eq 0 ] && ok "Nenhuma alteração local no código (a atualização não trava)" || aten "$ALT arquivo(s) alterado(s) na pasta do sistema: o 'git pull' pode travar"
fi
[ -f "$RAIZ/atualizacao-em-andamento" ] && falha "Há uma atualização parada no meio ($(cat "$RAIZ/atualizacao-em-andamento")): rode atualizar.sh de novo ou voltar-versao.sh" || ok "Nenhuma atualização parada no meio"
[ -f "$RAIZ/versao-anterior" ] && info "ponto de volta registrado (versao-anterior)"

# ---------------------------------------------------------------- 10. Logs
secao "10. Logs"
for l in /var/log/filapro-*.log; do [ -f "$l" ] && info "$(basename "$l"): $(du -h "$l" | cut -f1)"; done
GRANDE=$(find /var/log "${HOME:-/root}/.pm2/logs" -maxdepth 2 -type f -size +500M 2>/dev/null | head -3)
[ -n "$GRANDE" ] && falha "Log(s) com mais de 500 MB: $(echo "$GRANDE" | tr '\n' ' ')" || ok "Nenhum log com mais de 500 MB"
ROT=$(ls /etc/logrotate.d 2>/dev/null | grep -iE 'filapro|pm2' | tr '\n' ' ')
[ -d "${HOME:-/root}/.pm2/modules/pm2-logrotate" ] && ROT="$ROT pm2-logrotate"
if [ -n "$ROT" ]; then ok "Rotação de logs configurada: $ROT"; else aten "Nenhuma rotação de logs do FilaPro/pm2: os logs crescem até encher o disco"; fi

# ---------------------------------------------------------------- Resumo
echo
echo "== RESUMO =="
echo "  OK: $N_OK   ATENCAO: $N_ATEN   FALHA: $N_FALHA"
[ "$N_FALHA" -gt 0 ] && echo "  Há FALHAS: mande a tela inteira para o desenvolvedor (ela não mostra senhas nem chaves)."
[ "$N_FALHA" -eq 0 ] && [ "$N_ATEN" -gt 0 ] && echo "  Sem falhas, mas há pontos de ATENÇÃO: mande a tela inteira para o desenvolvedor."
[ "$N_FALHA" -eq 0 ] && [ "$N_ATEN" -eq 0 ] && echo "  Tudo em ordem."
exit 0
