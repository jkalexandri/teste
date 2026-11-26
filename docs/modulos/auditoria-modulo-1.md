# Módulo 1 (Acesso e segurança): levantamento

Feito em **26/11/2026** (v1.46.0), a partir do código. **Somente leitura: nada foi alterado.**
Regra do projeto: cada item recebe uma prévia, o dono aprova e só então é implementado.

Legenda: ✅ confirmado lendo o código · ❓ suspeita que ainda preciso reproduzir/conferir antes da prévia.

## O que foi conferido e está correto
- Isolamento por empresa/dono nas ações do servidor (leads, campanhas, conversas, arquivos, WhatsApp, usuários): todas validam o dono antes de agir.
- Rotas de arquivos (`arquivos`, `suporte/arquivo`, `interessados/arquivo`, `financeiro/comprovante`): conferem sessão e dono/cargo.
- `/api/whatsapp/[alvo]`: usa `sessaoDoAlvo` (sessão + `motivoSemAcesso` + dono do número).
- Rotas de Super Admin (`relatorios`, `suporte/[usuarioId]`, `ia/pontos`, `interessados/[id]`, `financeiro/*`): exigem Super Admin.
- Webhook do Asaas: token comparado com `timingSafeEqual`; aviso repetido não é processado de novo.
- Rotas públicas (`pedidos`, `renovacao`, `teste-gratis`): limite por IP; pedidos abertos limitados por e-mail/empresa.
- `X-Content-Type-Options: nosniff` já é enviado em todas as respostas (`next.config.mjs:30`) — **não é falha** (suspeita inicial descartada).
- Caddy: o `api.` só expõe `/saude`; o resto é negado. O site repassa o IP real no `X-Forwarded-For`.
- Desativar usuário apaga as sessões dele (`usuarios/actions.ts`).

## Médias
### S1 — "Trocar senha" não confere se é mesmo o primeiro acesso ✅ — **FEITA na v1.46.1 (decisão #157)**
`/api/auth/trocar-senha` só exige estar logado. Não checa `precisaTrocar` nem pede a senha atual. Quem estiver com uma
sessão aberta (computador emprestado, cookie roubado) troca a senha da conta e a tranca para o dono.
Também **não encerra as outras sessões** ao trocar. Correção: só aceitar quando `precisaTrocar` for verdadeiro; apagar as demais sessões.

### S2 — Conta inativa, vencida ou bloqueada: o que continua funcionando ✅ (reproduzido em 26/11/2026)
Teste: sessão aberta de um usuário de empresa; depois a empresa foi inativada, vencida e o usuário bloqueado.
- **Telas e ações do servidor: corretas.** A checagem é feita ao vivo a cada clique (`obterSessao` lê usuário e empresa do banco e
  `motivoSemAcesso` confere); a sessão antiga cai na hora ("Empresa inativa", "Acesso expirado", "Acesso bloqueado").
- **S2a — rotas que ignoram a situação da conta (baixa):** `/api/presenca`, `/api/suporte` e `/api/push` seguem respondendo 200
  para conta inativa, vencida ou bloqueada (marca "online", conversa do suporte, cadastra aparelho de notificação).
- **S2b — sessões não são apagadas ao inativar/vencer (baixa):** hoje só "bloquear usuário" apaga as sessões. Inativar empresa não
  apaga; se a empresa for reativada dentro de 24 h, a sessão antiga volta a valer. E **nada limpa sessões vencidas**: a conta de
  teste tem 193 linhas acumuladas.
- **S2c — o serviço 24/7 não confere a conta (ALTA):** o motor de campanhas (`disparos.ts`) e a IA de conversas (`conversas.ts`) não
  olham empresa inativa, plano vencido nem usuário bloqueado. Com o WhatsApp conectado, **a conta "bloqueada" continua enviando
  campanhas e a IA continua respondendo** (gastando a chave de IA da plataforma). Atinge estorno (#117 inativa a empresa),
  plano vencido e usuário bloqueado por abuso. A `continuidade.md` já guardava isso como "bloqueado/vencido com WhatsApp e IA (decidir)".

## Baixas
### S3 — Várias rotas só usam `obterSessao`, sem `motivoSemAcesso` ✅
`arquivos/[id]`, `suporte`, `push`, `comunicados/[id]`, `presenca`. Conta vencida/bloqueada ainda baixa os próprios arquivos
e usa o suporte. Em parte é desejado (o bloqueado precisa falar com o suporte); definir a regra por rota.

### S4 — Login e recuperação: enumeração de e-mail e diferença de tempo ❓
Conferir se "e-mail não existe" e "senha errada" respondem igual e no mesmo tempo (hash falso quando o usuário não existe).

### S5 — Limite só por IP; falta limite por e-mail ❓
Atacante com vários IPs pode tentar a mesma conta. O bloqueio de 5 tentativas/15 min por conta existe, mas também permite
**trancar a conta de outra pessoa** de propósito (negação de acesso).

### S6 — TOTP do Super Admin sem anti-reuso do código ❓
Um código válido pode ser usado de novo dentro da janela de validade.

### S7 — 2FA só para Super Admin ❓ (decisão de produto)
Admin da Empresa não tem 2FA. Não é falha de código; é uma decisão para o dono.

### S8 — Limite por IP guardado em memória ❓
Reiniciar o site zera os contadores. Aceitável com uma só instância; registrar como limitação.

### S9 — Senha temporária por e-mail pode ser repetida e vale 24 h ✅
`/api/auth/recuperar` envia a senha em texto no e-mail e cada pedido sobrescreve a anterior (sem limite por e-mail: S5). Um atacante
pode invalidar a senha temporária que a vítima acabou de receber (negação de acesso) e lotar a caixa dela. Melhor: link de uso único
com validade curta (30–60 min). Decisão de produto: prévia própria.

### S10 — A nova senha pode ser igual à temporária ✅ — **FEITA na v1.46.1 junto com a S1 (#157)**
`trocar-senha` só valida a força; aceita repetir a senha temporária que passou por e-mail. Tratado junto com a S1.

## Ordem sugerida das prévias
S1 ✅ → S2 (a, b, c) → S4 → S5 → S6 → S3 → S8 (S7 só se o dono quiser). Itens ❓ serão reproduzidos antes de virar prévia; se não se confirmarem, saem da lista.
