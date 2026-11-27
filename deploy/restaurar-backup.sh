#!/usr/bin/env bash
# Restauração SEGURA e teste de restauração (decisão #170 — Passo 0, P0-4/P0-5).
# Regra de ouro: NUNCA apaga o banco antes de provar que o backup restaura.
# Uso:
#   restaurar-backup.sh --so-testar            teste semanal (cron de domingo): restaura o último backup diário num banco TEMPORÁRIO, confere e apaga o temporário.
#   restaurar-backup.sh --so-testar ARQUIVO    o mesmo, para um backup específico (não grava o estado do teste semanal).
#   restaurar-backup.sh                        lista os backups, você escolhe um número; confere; mostra a comparação e pede para digitar RESTAURAR.
#   restaurar-backup.sh ARQUIVO.sql.gz         igual, mas já com o arquivo escolhido.
# Opções: --arquivos (restaura também os arquivos enviados do mesmo backup), --chaves (abre o pacote de chaves numa pasta à parte, pede a senha do backup),
#         --confirmado (sem digitar RESTAURAR: usado pelo voltar-versao.sh, que já perguntou), --sem-reiniciar, --sem-migrar.
# Como a troca é feita: banco temporário restaurado e conferido -> dump de segurança do banco atual -> o banco atual é RENOMEADO (não apagado)
# -> o temporário vira o banco oficial -> migrações -> site e serviço sobem. Se algo falha, o banco antigo volta ao lugar.
# Os 2 últimos bancos antigos ficam guardados (<banco>_antes_DATA) até o dono apagar.
set -uo pipefail
umask 077
DIR="$(cd "$(dirname "$0")" && pwd)"
RAIZ="${FILAPRO_RAIZ:-/opt/filapro}"
BANCO="${FILAPRO_BANCO:-filaproleads}"
DONO="${FILAPRO_DONO:-filaproleads}"
PASTA="${FILAPRO_BACKUPS:-$RAIZ/backups}"
PSQL="${FILAPRO_PSQL:-sudo -u postgres psql}"
DUMP="${FILAPRO_PGDUMP:-sudo -u postgres pg_dump}"
PM2="${FILAPRO_PM2:-pm2}"
SENHA_ARQ="${FILAPRO_SENHA_ARQ:-/root/.filapro-backup-senha}"
LOCK="${FILAPRO_LOCK:-/var/lock/filapro-backup.lock}"
MIN_BYTES="${FILAPRO_MIN_BYTES:-10240}"
MIN_KB="${FILAPRO_LIVRE_MIN_KB:-102400}"
AGORA="${FILAPRO_AGORA:-$(date '+%Y-%m-%d %H:%M')}"
DATA="$(date -d "$AGORA" +%Y-%m-%d_%H%M)"
DATA_DB="${DATA//-/_}"
TEMP="${BANCO}_teste_restauracao"
ANTES="${BANCO}_antes_${DATA_DB}"
ENV_WORKER="$RAIZ/app/apps/worker/.env"
ESTADO="$PASTA/estado-restauracao.json"
MIGRAR_CMD="${FILAPRO_MIGRAR_CMD:-cd $RAIZ/app && set -a && . apps/web/.env.production && set +a && pnpm --filter @filapro/db migrate:deploy}"
SAUDE_CMD="${FILAPRO_SAUDE_CMD:-curl -fsS -m 10 -o /dev/null http://127.0.0.1:3000/login}"

SO_TESTAR=false; CONFIRMADO=false; SEM_REINICIAR=false; SEM_MIGRAR=false; COM_ARQ=false; COM_CHAVES=false; ARQUIVO=""
for a in "$@"; do
  case "$a" in
    --so-testar) SO_TESTAR=true ;; --confirmado) CONFIRMADO=true ;; --sem-reiniciar) SEM_REINICIAR=true ;;
    --sem-migrar) SEM_MIGRAR=true ;; --arquivos) COM_ARQ=true ;; --chaves) COM_CHAVES=true ;;
    --ajuda|-h) sed -n 2,14p "$0"; exit 0 ;;
    -*) echo "Opção desconhecida: $a (use --ajuda)"; exit 2 ;;
    *) ARQUIVO="$a" ;;
  esac
done

# Nomes de banco e de dono só com letras, números e _ (entram em comandos SQL)
for n in "$BANCO" "$DONO"; do [[ "$n" =~ ^[A-Za-z0-9_]+$ ]] || { echo "ERRO: nome inválido: $n"; exit 1; }; done

# Só uma operação por vez (compartilha o bloqueio com o backup)
exec 9>"$LOCK" || { echo "Não foi possível criar o bloqueio $LOCK"; exit 1; }
flock -n 9 || { echo "Há um backup ou restauração rodando agora: esta execução foi ignorada. Tente de novo em alguns minutos."; exit 0; }

mkdir -p "$PASTA/seguranca"; chmod 700 "$PASTA" "$PASTA/seguranca"
LOGTMP="$(mktemp)"; trap 'rm -f "$LOGTMP" "$PASTA"/seguranca/*.tmp' EXIT
pg() { $PSQL -qtA -v ON_ERROR_STOP=1 "$@"; }          # consulta simples
sem_aspas() { echo "$1" | tr -d '"\\' | tr '\n' ' '; }
ERRO_FINAL=""
falhar() {  # falhar "mensagem": registra no estado (se for o teste semanal) e sai com código 1
  echo "ERRO: $1"; ERRO_FINAL="$1"; escrever_estado false; derrubar_temp; exit 1
}
derrubar_temp() { pg -d postgres -c "DROP DATABASE IF EXISTS \"$TEMP\"" >/dev/null 2>&1 || true; }
T_TAB="?"; T_USU="?"; T_EMP="?"
escrever_estado() {  # só o teste semanal (sem arquivo escolhido) grava o estado
  $SO_TESTAR && [ -z "$ARQUIVO_PEDIDO" ] || return 0
  printf '{"quando":"%s","ok":%s,"arquivo":"%s","tabelas":"%s","usuarios":"%s","empresas":"%s","erros":"%s"}\n' \
    "$(date -d "$AGORA" '+%Y-%m-%dT%H:%M:%S')" "$1" "$(sem_aspas "$(basename "${ARQUIVO:-}")")" "$T_TAB" "$T_USU" "$T_EMP" "$(sem_aspas "$ERRO_FINAL")" > "$ESTADO.tmp" && mv "$ESTADO.tmp" "$ESTADO"
}
ARQUIVO_PEDIDO="$ARQUIVO"

# ---------------------------------------------------------------- 1. Escolher o backup
data_do_nome() { basename "$1" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{4}' | head -1; }
listar() {  # do mais novo para o mais antigo (pela data no NOME do arquivo)
  for f in "$PASTA"/diarios/banco-*.sql.gz "$PASTA"/6h/banco-*.sql.gz "$PASTA"/semanais/banco-*.sql.gz "$PASTA"/mensais/banco-*.sql.gz \
           "$PASTA"/filapro-*.sql.gz "$PASTA"/seguranca/antes-restauracao-*.sql.gz "$PASTA"/recuperado/banco-*.sql.gz; do
    [ -f "$f" ] && echo "$(data_do_nome "$f") $f"
  done | sort -r | awk '{print $2}'
}
if [ -z "$ARQUIVO" ]; then
  if $SO_TESTAR; then
    ARQUIVO="$(ls -1 "$PASTA"/diarios/banco-*.sql.gz 2>/dev/null | sort -r | head -1)"
    [ -n "$ARQUIVO" ] || falhar "não há nenhum backup diário em $PASTA/diarios para testar"
  else
    mapfile -t LISTA < <(listar)
    [ "${#LISTA[@]}" -gt 0 ] || { echo "ERRO: nenhum backup encontrado em $PASTA"; exit 1; }
    echo "Backups disponíveis (do mais novo para o mais antigo):"
    i=0
    for f in "${LISTA[@]}"; do
      i=$((i+1)); [ "$i" -le 25 ] || { echo "  ... (mostrando os 25 mais novos; para outro, informe o caminho do arquivo)"; break; }
      tipo="$(basename "$(dirname "$f")")"; [ "$tipo" = "backups" ] && tipo="antes de atualizar"
      printf '  %2d) %s  %6s  [%s]\n' "$i" "$(basename "$f")" "$(du -h "$f" | cut -f1)" "$tipo"
    done
    read -r -p "Número do backup a restaurar (Enter para cancelar): " N
    [[ "$N" =~ ^[0-9]+$ ]] && [ "$N" -ge 1 ] && [ "$N" -le "${#LISTA[@]}" ] || { echo "Cancelado. Nada foi alterado."; exit 0; }
    ARQUIVO="${LISTA[$((N-1))]}"
  fi
fi
[ -f "$ARQUIVO" ] || { echo "ERRO: o arquivo não existe: $ARQUIVO"; exit 1; }
ARQUIVO="$(readlink -f "$ARQUIVO")"
echo "Backup escolhido: $ARQUIVO ($(du -h "$ARQUIVO" | cut -f1))"

# ---------------------------------------------------------------- 2. Conferir o arquivo ANTES de tocar em qualquer banco
gunzip -t "$ARQUIVO" 2>/dev/null || falhar "o arquivo está corrompido (não abre). NADA foi alterado."
TAM="$(stat -c %s "$ARQUIVO")"
[ "$TAM" -ge "$MIN_BYTES" ] || falhar "o arquivo tem só $TAM bytes (esperado pelo menos $MIN_BYTES). NADA foi alterado."
TAB_ARQ="$(gunzip -c "$ARQUIVO" | grep -c '^CREATE TABLE public\.' || true)"
[ "$TAB_ARQ" -ge 1 ] || falhar "o arquivo não tem nenhuma tabela. NADA foi alterado."
echo "Arquivo confere: abre, tem $TAB_ARQ tabelas."

pg -d postgres -c "select 1" >/dev/null 2>&1 || falhar "não consegui falar com o PostgreSQL (parado ou sem permissão). NADA foi alterado."
pg -d postgres -c "select 1 from pg_database where datname='$BANCO'" | grep -q 1 || falhar "o banco '$BANCO' não existe neste servidor. NADA foi alterado."
$SO_TESTAR || pg -d postgres -c "select 1 from pg_roles where rolname='$DONO'" | grep -q 1 || falhar "o usuário '$DONO' do banco não existe. NADA foi alterado."

# Espaço: o banco temporário e o dump de segurança precisam de lugar
LIVRE_KB="$(df -Pk "$PASTA" | awk 'NR==2{print $4}')"
BASE_KB="$(( $(pg -d postgres -c "select pg_database_size('$BANCO')") / 1024 ))"
NEC_KB=$(( 3 * BASE_KB )); [ "$NEC_KB" -lt "$MIN_KB" ] && NEC_KB="$MIN_KB"
[ "$LIVRE_KB" -ge "$NEC_KB" ] || falhar "espaço livre insuficiente (${LIVRE_KB} KB livres, necessário ${NEC_KB} KB). NADA foi alterado."

# ---------------------------------------------------------------- 3. Restaurar num banco TEMPORÁRIO e conferir
echo "==> Restaurando num banco temporário ($TEMP) para provar que funciona"
derrubar_temp
pg -d postgres -c "CREATE DATABASE \"$TEMP\"" >/dev/null || falhar "não consegui criar o banco temporário. NADA foi alterado."
if ! gunzip -c "$ARQUIVO" | $PSQL -q -v ON_ERROR_STOP=1 -d "$TEMP" > /dev/null 2> "$LOGTMP"; then
  echo "--- últimas linhas do erro do PostgreSQL ---"; tail -n 5 "$LOGTMP" | cut -c1-200
  falhar "o backup NÃO restaura (erro ao carregar no banco temporário). O banco atual está INTACTO."
fi
contar() { pg -d "$1" -c "select count(*) from \"$2\"" 2>/dev/null || echo "?"; }
T_TAB="$(pg -d "$TEMP" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
T_USU="$(contar "$TEMP" Usuario)"; T_EMP="$(contar "$TEMP" Empresa)"
[ "$T_TAB" -ge 1 ] 2>/dev/null || falhar "o banco restaurado não tem tabelas. O banco atual está INTACTO."
[ "$T_USU" != "?" ] || falhar "o banco restaurado não tem a tabela de usuários: não parece um backup do FilaPro. O banco atual está INTACTO."
echo "Restauração de teste OK: $T_TAB tabelas, $T_USU usuários, $T_EMP empresas."

if $SO_TESTAR; then
  derrubar_temp
  escrever_estado true
  echo "Teste de restauração concluído com sucesso. O banco temporário foi apagado e o banco atual não foi tocado."
  exit 0
fi

# ---------------------------------------------------------------- 4. Comparar e pedir confirmação
V_TAB="$(pg -d "$BANCO" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
V_USU="$(contar "$BANCO" Usuario)"; V_EMP="$(contar "$BANCO" Empresa)"
echo
echo "==================== COMPARAÇÃO ===================="
printf '  %-12s %-14s %s\n' "" "BANCO ATUAL" "BACKUP"
printf '  %-12s %-14s %s\n' "Tabelas" "$V_TAB" "$T_TAB"
printf '  %-12s %-14s %s\n' "Usuários" "$V_USU" "$T_USU"
printf '  %-12s %-14s %s\n' "Empresas" "$V_EMP" "$T_EMP"
echo "===================================================="
echo "Tudo o que foi gravado DEPOIS desse backup (clientes, mensagens, leads) NÃO estará no banco restaurado."
echo "O banco atual será guardado (renomeado para $ANTES) e um dump de segurança será salvo antes."
echo "O site e o serviço 24/7 (WhatsApp) ficam parados durante a troca."
if ! $CONFIRMADO; then
  read -r -p "Para continuar, digite RESTAURAR (qualquer outra coisa cancela): " C
  if [ "$C" != "RESTAURAR" ]; then derrubar_temp; echo "Cancelado. Nada foi alterado."; exit 0; fi
fi

# ---------------------------------------------------------------- 5. Dump de segurança do banco atual
echo "==> Salvando um dump de segurança do banco atual"
SEG="$PASTA/seguranca/antes-restauracao-$DATA.sql.gz"
# shellcheck disable=SC2086
if ! $DUMP --no-owner "$BANCO" | gzip -9 > "$SEG.tmp" || ! gunzip -t "$SEG.tmp" 2>/dev/null || [ "$(stat -c %s "$SEG.tmp")" -lt "$MIN_BYTES" ]; then
  derrubar_temp; falhar "não consegui salvar o dump de segurança do banco atual. NADA foi alterado."
fi
mv "$SEG.tmp" "$SEG"
ls -1 "$PASTA"/seguranca/antes-restauracao-*.sql.gz 2>/dev/null | sort -r | tail -n +6 | xargs -r rm -f
echo "Dump de segurança: $SEG"

# Dono dos objetos: o dump não carrega o dono, então ajusta no banco temporário (sem mexer em outros bancos)
echo "==> Ajustando o dono das tabelas no banco restaurado"
$PSQL -q -v ON_ERROR_STOP=1 -d "$TEMP" > /dev/null 2> "$LOGTMP" <<SQL || { tail -n 3 "$LOGTMP" | cut -c1-200; derrubar_temp; falhar "não consegui ajustar o dono dos objetos. O banco atual está INTACTO."; }
DO \$\$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','S','v','m') LOOP
    EXECUTE format('ALTER %s public.%I OWNER TO ${DONO}', CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.relname);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t WHERE t.typnamespace = 'public'::regnamespace AND t.typtype = 'e' LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO ${DONO}', r.typname);
  END LOOP;
END \$\$;
SQL
pg -d postgres -c "ALTER DATABASE \"$TEMP\" OWNER TO \"$DONO\"" >/dev/null 2>&1 || true

# ---------------------------------------------------------------- 6. A troca
echo "==> Parando o site e o serviço 24/7"
$PM2 stop filapro-web filapro-worker >/dev/null 2>&1 || true
derrubar_conexoes() { pg -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$1' and pid<>pg_backend_pid()" >/dev/null 2>&1 || true; }
reiniciar() { $SEM_REINICIAR || $PM2 restart filapro-web filapro-worker --update-env >/dev/null 2>&1 || $PM2 start filapro-web filapro-worker >/dev/null 2>&1 || true; }
derrubar_conexoes "$BANCO"
if ! pg -d postgres -c "ALTER DATABASE \"$BANCO\" RENAME TO \"$ANTES\"" > /dev/null 2> "$LOGTMP"; then
  tail -n 2 "$LOGTMP" | cut -c1-200; reiniciar; derrubar_temp; falhar "não consegui separar o banco atual. Nada foi trocado; o site foi religado."
fi
if ! pg -d postgres -c "ALTER DATABASE \"$TEMP\" RENAME TO \"$BANCO\"" > /dev/null 2> "$LOGTMP"; then
  tail -n 2 "$LOGTMP" | cut -c1-200
  pg -d postgres -c "ALTER DATABASE \"$ANTES\" RENAME TO \"$BANCO\"" >/dev/null 2>&1
  reiniciar; derrubar_temp; falhar "não consegui colocar o banco restaurado no lugar. O banco antigo foi devolvido e o site religado."
fi
desfazer_troca() {  # devolve o banco antigo ao lugar e guarda o restaurado com defeito para análise
  derrubar_conexoes "$BANCO"
  pg -d postgres -c "ALTER DATABASE \"$BANCO\" RENAME TO \"${BANCO}_restauracao_falha_${DATA_DB}\"" >/dev/null 2>&1
  pg -d postgres -c "ALTER DATABASE \"$ANTES\" RENAME TO \"$BANCO\"" >/dev/null 2>&1
}
echo "Banco restaurado colocado no lugar. O banco antigo está guardado como $ANTES."

if ! $SEM_MIGRAR; then
  echo "==> Aplicando as migrações do código atual sobre o banco restaurado"
  if ! bash -c "$MIGRAR_CMD" > "$LOGTMP" 2>&1; then
    tail -n 5 "$LOGTMP" | cut -c1-200
    desfazer_troca; reiniciar
    falhar "as migrações falharam sobre o banco restaurado. O banco antigo foi DEVOLVIDO ao lugar e o site religado (o restaurado com defeito ficou como ${BANCO}_restauracao_falha_${DATA_DB})."
  fi
fi

# ---------------------------------------------------------------- 7. Arquivos enviados e chaves (opcionais)
data_banco="$(data_do_nome "$ARQUIVO")"
irmao() { # irmao PREFIXO SUFIXO — acha o pacote do mesmo backup (mesma data), na mesma pasta
  local f; f="$(dirname "$ARQUIVO")/$1-$data_banco$2"; [ -f "$f" ] && echo "$f"
}
if $COM_ARQ; then
  PA="$(irmao arquivos .tar.gz || true)"
  if [ -n "$PA" ] && tar -tzf "$PA" >/dev/null 2>&1; then
    DEST="$(grep -E '^PASTA_ARQUIVOS=' "$ENV_WORKER" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"; DEST="${DEST:-$RAIZ/arquivos}"
    TMPA="$(mktemp -d "$(dirname "$DEST")/.restaura-arquivos.XXXXXX")"
    if tar -xzf "$PA" -C "$TMPA" && [ -d "$TMPA/$(basename "$DEST")" ]; then
      [ -e "$DEST" ] && mv "$DEST" "$DEST.antes-$DATA"
      mv "$TMPA/$(basename "$DEST")" "$DEST"; rmdir "$TMPA" 2>/dev/null || true
      echo "Arquivos enviados restaurados de $(basename "$PA"). Os anteriores ficaram em $DEST.antes-$DATA"
    else rm -rf "$TMPA"; echo "ATENÇÃO: não consegui restaurar os arquivos enviados; os atuais não foram alterados."; fi
  else echo "ATENÇÃO: não achei (ou não abre) o pacote de arquivos do mesmo backup; os arquivos enviados não foram alterados."; fi
fi
if $COM_CHAVES; then
  PC="$(irmao chaves .tar.gz.enc || true)"
  if [ -n "$PC" ] && [ -f "$SENHA_ARQ" ]; then
    CD="${FILAPRO_CHAVES_DEST:-/root/chaves-restauradas-$DATA}"; mkdir -p "$CD"; chmod 700 "$CD"
    if openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:$SENHA_ARQ" -in "$PC" 2>/dev/null | tar -xz -C "$CD" 2>/dev/null; then
      echo "Chaves abertas em $CD (permissão 700). Nada foi sobrescrito: confira com os .env atuais e copie só se precisar. APAGUE a pasta depois."
    else rmdir "$CD" 2>/dev/null; echo "ATENÇÃO: não consegui abrir o pacote de chaves (senha do backup diferente?)."; fi
  else echo "ATENÇÃO: pacote de chaves do mesmo backup ou senha do backup não encontrados."; fi
fi

# ---------------------------------------------------------------- 8. Religar e conferir
if ! $SEM_REINICIAR; then
  echo "==> Religando o site e o serviço 24/7"
  reiniciar
  OKS=false; for _ in 1 2 3 4 5 6; do sleep 5; if bash -c "$SAUDE_CMD" >/dev/null 2>&1; then OKS=true; break; fi; done
  if $OKS; then echo "Site respondendo: OK"; else echo "ATENÇÃO: o site não respondeu depois da troca. Veja: pm2 logs filapro-web --lines 30 --nostream. O banco antigo continua guardado como $ANTES."; fi
fi

# Guarda só os 2 bancos antigos mais recentes (o de agora e o anterior)
pg -d postgres -c "select datname from pg_database" 2>/dev/null | grep -E "^${BANCO}_antes_[0-9_]+$" | sort -r | tail -n +3 | while read -r velho; do
  pg -d postgres -c "DROP DATABASE \"$velho\"" >/dev/null 2>&1 && echo "Banco antigo removido (passou de 2 guardados): $velho"
done
echo
echo "Restauração concluída. Banco antigo guardado: $ANTES (quando tiver certeza de que está tudo certo, apague com:  sudo -u postgres dropdb $ANTES)."
echo "Dump de segurança: $SEG"
exit 0
