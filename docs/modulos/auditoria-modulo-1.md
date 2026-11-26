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

### S2 — Conta inativa, vencida ou bloqueada: o que continua funcionando ✅ (reproduzido em 26/11/2026) — **FEITA na v1.46.2 (decisão #158)**
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

### S4 — Dá para descobrir quais e-mails têm conta ✅ (reproduzido em 26/11/2026) — **FEITA na v1.46.3 (decisão #159)**
Medido no site de teste, com e-mail existente e inexistente:
- **S4a — tempo do login:** senha errada leva **73 ms** para e-mail existente e **15 ms** para inexistente (o sistema só calcula o hash da
  senha quando a conta existe). Quem tem senha temporária pendente leva ainda mais (dois hashes): revela até quem pediu recuperação.
- **S4b — bloqueio por tentativas:** a 6ª senha errada devolve "Muitas tentativas erradas. Tente novamente em 15 minutos." para e-mail
  existente e "E-mail ou senha incorretos." para inexistente. Com 6 tentativas, qualquer um descobre se a conta existe.
- **S4c — tempo da recuperação:** a resposta é igual, mas existente leva **52 ms** e inexistente **7 ms** (aqui sem o envio real do
  e-mail; na VPS o envio pelo Resend soma centenas de ms, tornando a diferença bem maior).
- **S4d — compra e teste grátis:** `/api/pedidos` responde 409 "Este e-mail já tem acesso…" e `/api/teste-gratis` responde 409 "já usou o
  teste grátis ou já tem acesso…". Sem login, quem quiser lista e-mails cadastrados (dado pessoal, LGPD). Há uma necessidade de negócio
  (não deixar a pessoa pagar por uma conta que não pode ser criada), por isso é decisão de produto.
- Conferido e correto: os botões de demonstração do login só aparecem fora de produção (#3); a recuperação responde igual para e-mail
  existente ou não; as mensagens "módulo errado/expirado/inativa" só aparecem depois de acertar a senha.

### S5 — Qualquer pessoa consegue trancar a conta de outra e lotar a caixa de e-mail dela ✅ (reproduzido em 26/11/2026)
Teste no site de teste, com endereços de internet diferentes:
- **S5a — bloqueio como arma:** um atacante errou 5 vezes de um endereço; a vítima, **de outro endereço e com a senha certa**, recebeu
  "Muitas tentativas erradas. Tente novamente em 15 minutos." O bloqueio é da conta inteira, não de quem errou.
- **S5b — sem saída:** a vítima pediu recuperação e tentou entrar com a **senha temporária** durante o bloqueio: também recusada.
- **S5c — alcance:** **um único endereço** trancou as **4 contas testadas em menos de 25 tentativas, inclusive o Super Admin**
  (limite por endereço: 20 tentativas a cada 10 minutos). Repetindo a cada 15 minutos, a conta fica fora do ar para sempre.
  Hoje o dono da conta nem é avisado (o alerta só existe para o Super Admin e para 3 bloqueios por hora na plataforma).
- **S5d — recuperação repetida:** 6 pedidos de 6 endereços diferentes contra a mesma vítima = **6 e-mails** e **6 senhas temporárias
  diferentes**; cada uma invalida a anterior (a vítima pode estar digitando a do e-mail anterior).
- Sobre a preocupação original ("vários endereços tentando a mesma conta"): o bloqueio da conta limita a 5 tentativas a cada 15 minutos
  e as senhas exigem 12+ caracteres com 4 tipos; o risco de adivinhar é baixo. O problema real é o bloqueio ser usado contra o dono.

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
S1 ✅ → S2 ✅ → S4 ✅ → S5 → S6 → S3 → S8 (S7 só se o dono quiser). Itens ❓ serão reproduzidos antes de virar prévia; se não se confirmarem, saem da lista.
