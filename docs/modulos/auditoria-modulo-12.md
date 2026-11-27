# Passo 0 (backup restaurável) e Módulo 12 (Operação — VPS): levantamento

Feito em **27/11/2026** (v1.47.0), **lendo os scripts e a documentação** (`deploy/*.sh`, `docs/publicacao-vps.md`). **Nada foi alterado.**
Limite importante: **não tenho acesso à VPS**; o que está abaixo é o que o código e a documentação garantem. O estado real da VPS (o backup
está agendado? os arquivos têm as permissões certas? o disco está cheio?) só se confirma lá. Por isso o primeiro item da prévia é um
**diagnóstico somente leitura** que você roda e me devolve.

Regra do projeto: cada item recebe uma prévia, o dono aprova e só então é implementado.

Legenda: ✅ confirmado lendo o código/documentação · ❓ depende do estado real da VPS (o diagnóstico responde).

## Passo 0 — backup restaurável

### P0-1 — O backup diário NÃO guarda os arquivos enviados (CRÍTICA) ✅
`backup-banco.sh` faz só `pg_dump` do banco. Os arquivos que os usuários enviam (anexos de campanha e de conversa, materiais de treino da IA,
comprovantes do financeiro, anexos do suporte e de interessados) ficam em `/opt/filapro/arquivos`, gerenciado pelo serviço 24/7, e **só entram no
pacote manual** `empacotar-servidor.sh`. Se o disco da VPS for perdido, o banco volta, mas os arquivos somem (as telas passam a mostrar "arquivo indisponível").

### P0-2 — As chaves do sistema não estão em nenhum backup automático (CRÍTICA) ✅
`CHAVE_CRIPTO` (e o resto dos `.env`) só vão no pacote manual. Essa chave criptografa dados **dentro do banco**: a chave da IA, a chave e o token do
Asaas, os segredos da verificação em duas etapas e **o login do WhatsApp de todos os números**. Restaurar o banco **sem** a chave deixa tudo isso ilegível:
todos os clientes precisariam ler o QR Code de novo e as chaves seriam digitadas de novo. Hoje a chave só existe nos dois `.env` da própria VPS.

### P0-3 — Nenhuma cópia fora da VPS (ALTA) ✅
Os backups ficam na mesma máquina e no mesmo disco que o banco (`/opt/filapro/backups`). Perda da VPS, disco corrompido ou invasão com apagamento levam banco e
backups juntos. Já é pendência registrada (decisão #105, item 7).

### P0-4 — Nunca se testa a restauração e o backup não é conferido (ALTA) ✅/❓
Depois do `pg_dump | gzip` o script não confere nada: nem se o arquivo abre (`gunzip -t`), nem se tem tamanho plausível, nem se o dump é legível. Uma restauração de
teste nunca é feita. Backup que nunca foi restaurado é uma esperança, não uma garantia.

### P0-5 — Restaurar apaga o banco ANTES de conferir o backup (ALTA) ✅
Tanto `voltar-versao.sh` quanto a seção "Restaurar um backup" de `publicacao-vps.md` fazem `dropdb` e só depois `gunzip | psql`. Se o arquivo estiver
corrompido, vazio ou truncado, **o banco de produção é destruído e a restauração falha**. O correto é restaurar num banco temporário, conferir e só então trocar,
e guardar uma cópia do banco atual antes (como segurança).

### P0-6 — Ninguém é avisado se o backup falhar ou parar (ALTA) ✅/❓
O resultado vai para `/var/log/filapro-backup.log`, que ninguém lê. Cron quebrado, disco cheio ou erro de permissão = sem backup, em silêncio, e depois de 14 dias o
`find -mtime +14 -delete` só apaga (não há alerta de "último backup com mais de 26 h"). O vigia do serviço 24/7 já manda e-mail (decisão #151) e pode ser estendido.

### P0-7 — Retenção curta e uniforme (MÉDIA) ✅
Só os últimos 14 dias, todos diários. Corrupção ou apagamento percebidos depois de 2 semanas não têm volta. Prática comum: 14 diários + 8 semanais + 6 mensais.

### P0-8 — Permissões dos backups e do pacote de mudança (MÉDIA) ✅/❓
`mkdir -p` e o `gzip > arquivo` usam a permissão padrão do sistema (normalmente legível por outros usuários da máquina). Os backups contêm todos os dados dos clientes,
hashes de senha e segredos criptografados. Deveria ser pasta `700` e arquivos `600` (o pacote de mudança já usa `600`).

### P0-9 — Intervalo entre backups = até 24 h de perda (decisão sua) ✅
Backup uma vez por dia (03:30). Uma falha às 20h perde o dia (leads, conversas, campanhas). Um dump a cada 6 horas é barato (banco pequeno) e reduz isso a 6 h.
É decisão sua (quanto perder é aceitável).

## Módulo 12 — Operação (VPS)

### O1 — Ninguém avisa se o SITE ou a VPS caírem por inteiro (ALTA) ✅
O vigia roda **dentro** da VPS e o alerta sai pelo **próprio site** (e-mail pelo Resend). Se a VPS cair, o site cair ou o `pm2` morrer, nada é enviado. Falta um monitor **externo**
(gratuito, ex.: verificação do `https://filaproleads.com.br/api/status` a cada 5 minutos com aviso por e-mail/celular). Ação sua (conta externa), com o endereço de verificação que eu preparo.

### O2 — Relógio da VPS: a verificação em duas etapas depende dele (MÉDIA) ❓
Os códigos TOTP (S6) valem por 30 s ±30 s. Se o relógio da VPS sair do horário, **todos** os códigos passam a ser recusados. Ubuntu mantém o relógio por padrão, mas nada confere. O diagnóstico verifica (`timedatectl`).

### O3 — Atualizações de segurança sem reinício programado (MÉDIA) ✅/❓
`unattended-upgrades` instala correções, mas com `Automatic-Reboot "false"`: correções de núcleo só valem depois de reiniciar, e nada avisa que um reinício está pendente (`/var/run/reboot-required`).
Proposta: o vigia avisa o Super Admin ("reinício pendente") e o manual traz o procedimento de reinício controlado (aviso, manutenção, reiniciar, conferir WhatsApp).

### O4 — Logs sem rotação (MÉDIA) ✅/❓
`/var/log/filapro-*.log` (a cada 5 minutos, para sempre) e os logs do `pm2` não têm rotação definida na documentação. Crescem até encher o disco (que é pequeno: KVM 1). O diagnóstico mede.

### O5 — Espaço em disco e memória sem vigia (MÉDIA) ❓
Disco cheio derruba o banco e o backup em silêncio; a VPS tem pouca memória (swap de 2 GB). Nada avisa "disco acima de 80%" ou "memória/swap no limite". O vigia pode checar.

### O6 — Rotação das chaves não está documentada (BAIXA) ✅
Não há procedimento para trocar `CHAVE_CRIPTO`, `CRON_SECRET`, `WORKER_TOKEN` ou a chave VAPID (o que fazer com os dados criptografados, o que reconfigurar). Importante principalmente se uma chave vazar.

### O7 — Verificação de dependências com falhas conhecidas (BAIXA) ✅
Não há rotina (`pnpm audit`) para listar dependências com vulnerabilidades conhecidas. Proposta: conferir a cada entrega e registrar o resultado.

### O8 — Documentação do reinício e da recuperação de desastre (BAIXA) ✅
Existem `restaurar-servidor.sh` (mudar de servidor) e a seção de emergência; falta um **roteiro de recuperação de desastre** de ponta a ponta (quem faz o quê, em que ordem, quanto tempo leva) e **um ensaio** registrado (a "restauração de teste" do P0-4).

## Não é falha (conferido)
- `atualizar.sh` faz backup antes, guarda o ponto de volta, liga a manutenção, monta o site em pasta separada e só troca depois; se algo falha, o sistema fica em manutenção (seguro).
- SSH só com chave, fail2ban, atualizações de segurança automáticas, firewall conferido (`seguranca-vps.sh`).
- `pm2 startup` está na documentação; o swap de 2 GB também.
- `.env` com permissão restrita está na documentação (4.3).

## Ordem sugerida das prévias
1. **Diagnóstico da VPS (somente leitura)** — confirma P0-4/6/8 e O2–O5 no estado real e mostra se há surpresas. (Você roda um comando e me devolve o resultado.)
2. **P0-1, P0-2, P0-7, P0-8** — backup completo (banco + arquivos + chaves), com retenção em camadas e permissões corretas.
3. **P0-4, P0-5** — conferência do backup, restauração de teste e restauração segura.
4. **P0-6, O1, O3, O5** — avisos (backup, disco/memória, reinício pendente) e monitor externo.
5. **P0-3, P0-9** — cópia fora da VPS e frequência (dependem de decisão e conta sua).
6. **O4, O6, O7, O8** — logs, chaves, dependências e roteiro de desastre.
