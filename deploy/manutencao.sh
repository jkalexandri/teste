#!/usr/bin/env bash
# Modo manutenção do FilaPro Leads (decisão #103).
# Uso: bash deploy/manutencao.sh ligar | desligar | estado
#      bash deploy/manutencao.sh avisar <minutos>   (Mensagem aos usuários: "o sistema será atualizado em N minutos")
# Ligado: clientes veem "Sistema em atualização" e nenhuma ação é aceita; campanhas e respostas da IA ficam em espera.
# O Super Admin continua entrando para conferir.
set -euo pipefail
sql() { sudo -u postgres psql -qtA filaproleads -c "$1"; }

case "${1:-estado}" in
  ligar)
    sql "insert into \"Manutencao\"(id,ligada,desde,motivo) values ('geral',true,now(),'Atualização') on conflict (id) do update set ligada=true, desde=now(), motivo='Atualização'" >/dev/null
    echo "Modo manutenção LIGADO." ;;
  desligar)
    sql "insert into \"Manutencao\"(id,ligada) values ('geral',false) on conflict (id) do update set ligada=false, desde=null" >/dev/null
    echo "Modo manutenção DESLIGADO: sistema liberado." ;;
  estado)
    E=$(sql "select case when ligada then 'LIGADO desde '||to_char(desde at time zone 'America/Sao_Paulo','DD/MM HH24:MI') else 'desligado' end from \"Manutencao\" where id='geral'" 2>/dev/null || true)
    echo "Modo manutenção: ${E:-desligado}" ;;
  avisar)
    MIN=${2:?informe os minutos}
    ID="atualizacao-$(date +%s)"
    sql "insert into \"Comunicado\"(id,titulo,texto,publico,\"autorId\",\"validoAte\") values ('$ID','Atualização do sistema','O FilaPro Leads será atualizado em $MIN minutos e ficará indisponível por alguns minutos. Salve o que estiver fazendo. Suas campanhas continuam depois, de onde pararam.','Todos os clientes (aviso de atualização)',(select id from \"Usuario\" where cargo='SUPERADMIN' order by \"criadoEm\" limit 1),now()+interval '$MIN minutes')" >/dev/null
    sql "insert into \"ComunicadoDestino\"(id,\"comunicadoId\",\"usuarioId\") select '$ID-'||id,'$ID',id from \"Usuario\" where cargo<>'SUPERADMIN' and status='ATIVO'" >/dev/null
    echo "Aviso enviado aos usuários. Aguardando $MIN minuto(s)…"
    sleep $((MIN * 60)) ;;
  *) echo "Uso: $0 ligar | desligar | estado | avisar <minutos>"; exit 1 ;;
esac
