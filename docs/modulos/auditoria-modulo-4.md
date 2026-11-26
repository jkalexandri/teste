# Módulo 4 (WhatsApp — conexão): auditoria das falhas médias e baixas

Refeita em **26/11/2026** (v1.41.13), a partir do código, porque o relatório original (25/11/2026) só ficou no chat e se perdeu.
A decisão #130 guarda só a contagem daquele relatório (7 médias e 6 baixas); os **códigos abaixo são novos** e não correspondem
necessariamente aos antigos. A antiga "M5" já estava feita e não foi recriada. As críticas e altas (C1, C2, A1–A7) estão feitas (#130–#143).

Regra do projeto: **cada item recebe uma prévia, o dono aprova e só então é implementado.** Esta lista é só o levantamento.

## Médias

### M1 — Reconexão que falha ao abrir não tenta de novo (CONFIRMADO em teste) — ✅ FEITA na v1.41.14 (decisão #144)
- **O problema:** se, ao reabrir a conexão, algo falhar antes do socket existir (banco fora do ar por instantes, login que não
  descriptografa, erro ao ler o login), o serviço só escreve no log. **Nenhuma nova tentativa é agendada.** O número fica em
  "Reconectando… tentando agora…" para sempre, até alguém tocar em "Tentar agora" ou o serviço reiniciar. O mesmo vale para o
  "Conectar" e para a abertura ao ligar o serviço (`iniciarTodas`).
- **Prova:** teste descartável — número cai (428); a leitura do login falha na reconexão; o banco volta; passados 6 s o estado é
  `RECONECTANDO`, `reconexaoAgendada = false`, 1 só conexão aberta.
- **Onde:** `apps/worker/src/sessoes.ts` (`conectar`, `aoFechar` → timer, `iniciarTodas`).
- **Efeito no usuário:** WhatsApp parado sem aviso (a A6 avisa depois de 3 min, mas a recuperação nunca acontece sozinha).

### M2 — A tela mostra "Conectado" com o serviço 24/7 parado — ✅ FEITA na v1.45.0 (decisão #151)
- **O problema:** o estado exibido vem só do banco. Se o serviço cair ou a VPS reiniciar, o banco continua dizendo "Conectado"
  (ou "Aguardando QR"/"Reconectando") até o serviço voltar. O usuário acha que está tudo bem e as campanhas não saem.
- **Onde:** `apps/web/lib/whatsapp.ts` (`lerEstado`) e `ConexaoWhatsapp.tsx`. O serviço já grava um batimento a cada 20 s em
  `ServicoInstancia.vistoEm` (decisão #133), que a tela não consulta.

### M3 — O mesmo número de WhatsApp pode ficar conectado em dois espaços — ✅ FEITA na v1.45.1 (decisão #152)
- **O problema:** nada impede ler o QR do mesmo chip no principal e num extra, ou em duas contas diferentes (`WhatsappSessao.numero`
  não é único e ninguém confere ao conectar). O WhatsApp aceita vários aparelhos ligados, então os dois funcionam: envios em
  duplicado, conversas misturadas, aquecimento e limites contados em separado (risco de bloqueio) e brecha para alguém
  conectar o número de outra pessoa.
- **Onde:** `apps/worker/src/sessoes.ts` (evento `open`).

### M4 — A tela Logs não registra as quedas, e cada reconexão vira "conectado" — ✅ FEITA na v1.45.2 (decisão #153)
- **O problema:** `aoFechar` só escreve nos Logs quando encerra de vez. Uma queda comum que volta gera apenas "WhatsApp conectado"
  de novo, sem dizer que caiu, por quê (código) nem quanto tempo ficou fora; e quedas repetidas enchem os Logs de "conectado".
- **Onde:** `apps/worker/src/sessoes.ts` (`aoFechar`, `registrarLogSessao`).

### M5 — Reinício do serviço (ou queda geral) reconecta todos os números ao mesmo tempo — ✅ FEITA na v1.45.3 (decisão #154)
- **O problema:** `iniciarTodas` abre todos os números em sequência rápida e o recuo da reconexão (2 s, 4 s … 5 min) não tem
  variação aleatória: depois de uma queda geral, todos tentam de novo no mesmo instante. Rajada de conexões do mesmo IP à
  WhatsApp (risco de limitação) e pico de memória/CPU na VPS (KVM 1).
- **Onde:** `apps/worker/src/sessoes.ts` (`iniciarTodas`) e `apps/worker/src/queda.ts` (`decidirQueda`).

## Baixas

- **B1 — Atualização a cada 3 s mesmo com a aba escondida:** a tela continua consultando o servidor (e gerando a imagem do QR)
  em aba em segundo plano. Pausar quando a aba não está visível. (`ConexaoWhatsapp.tsx`)
- **B2 — "Conectado desde" reinicia em cada reconexão curta:** uma oscilação de segundos mostra um horário novo. Melhor mostrar
  desde quando está estável, ou "reconectou às HH:MM". (`sessoes.ts`: `conectadoEm` gravado a cada `open`)
- **B3 — Chaves do WhatsApp sem acompanhamento de tamanho:** `WhatsappChave` cresce com o uso (uma linha por contato/sessão) e
  não há contagem nem limpeza de lixo; vale medir e, se preciso, limpar. (`auth-banco.ts`)
- **B4 — Falha ao salvar o login só vai para o log:** se a gravação do login falhar (ex.: banco fora do ar logo após ler o QR),
  o número parece conectado mas perde o login no próximo reinício, sem aviso. (`sessoes.ts`: `creds.update`)
- **B5 — Sem limite de frequência no "Conectar":** apertar Conectar/Cancelar repetidamente abre várias tentativas de QR do mesmo
  IP em sequência. Um intervalo mínimo entre tentativas protege o IP da VPS. (`api.ts` / `sessoes.ts: conectar`)

## Não é falha (conferido)
- Cookie de sessão `SameSite=Lax`: o POST de conectar/desconectar não passa de outro site.
- Apelido do número: limitado a 40 caracteres, dono conferido, texto escapado pela tela.
- Troca de chip, número bloqueado, usuário excluído, instância única, fila da plataforma: cobertos pelos testes vigia.

## Ordem sugerida
~~M1~~ (feita) → ~~M2~~ (feita) → ~~M3~~ (feita) → ~~M4~~ (feita) → ~~M5~~ (feita) → B1–B5 (agrupadas numa única prévia). Depois, marcar o Módulo 4 como 🟢 Revisado.
