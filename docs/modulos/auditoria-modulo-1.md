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
### S3 — Rotas que só conferem a sessão, sem olhar a situação da conta ✅ (reproduzido em 26/11/2026) — **FEITA na v1.46.6 (decisão #162)**
Varredura de todas as rotas e ações do servidor: tudo o que é privado confere a sessão; as que não conferem são públicas por desenho
(pedidos, planos, renovação por link, teste grátis, chat do visitante, webhook do Asaas, webhook de anúncios por token — este já recusa conta
vencida/inativa/bloqueada —, rotinas protegidas por segredo). Faltam só estas (conta de teste com sessão antiga aberta):
- **S3a — 4 rotas deixam passar conta inativa, vencida ou bloqueada:** `/api/arquivos/[id]` (baixar arquivo do próprio usuário; o Admin da
  Empresa vê os dos usuários dele), `/api/suporte/arquivo/[id]`, `/api/comunicados/[id]` (marcar como lido) e `/api/ajuda/prints/[nome]`.
  Nas 3 situações a resposta foi 404/200 (passou da sessão) em vez de 403. As três últimas também deixam passar uma **sessão em primeiro
  acesso** (senha temporária ainda não trocada); só `arquivos` recusa.
- **S3b — rotas só do Super Admin sem a checagem completa (defesa em profundidade):** `relatorios`, `financeiro/relatorios`,
  `financeiro/comprovante`, `logos` e a parte do Super Admin de `interessados/arquivo` conferem o cargo, mas não `motivoSemAcesso`
  (Super Admin bloqueado) e, no caso de `interessados/arquivo`, nem o primeiro acesso.
- **S3c — cancelar a cobrança automática do cartão (`conta/actions`):** não confere o primeiro acesso. Mantida a ideia de que conta vencida
  ou inativa **pode** desligar a cobrança (direito de cancelar assinatura). **Observação para o Módulo 3:** hoje, na prática, o cliente de plano
  vencido nem abre o sistema (a tela é bloqueada); desligar a cobrança automática dele só pelo suporte/Super Admin. Decisão de produto.

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

### S5 — Qualquer pessoa consegue trancar a conta de outra e lotar a caixa de e-mail dela ✅ (reproduzido em 26/11/2026) — **FEITA na v1.46.4 (decisão #160)**
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

### S6 — O código do app autenticador pode ser reutilizado e a verificação tem furos ✅ (reproduzido em 26/11/2026) — **FEITA na v1.46.5 (decisão #161)**
Teste no site de teste, com a verificação em duas etapas ativa no Super Admin:
- **S6a — reuso do código:** o **mesmo código de 6 dígitos foi aceito 3 vezes seguidas**, em entradas diferentes (a norma TOTP, RFC 6238, exige
  recusar o segundo uso). O sistema aceita o código de 30 s atrás, o atual e o de 30 s à frente (janela de ~90 s): quem vê ou intercepta um
  código (ombro, tela compartilhada, vírus) tem ~90 s para usá-lo, quantas vezes quiser.
- **S6b — código de recuperação "de uso único" usado várias vezes:** **6 entradas simultâneas com o mesmo código de recuperação: as 6 foram
  aceitas** (a lista só perdeu 1 código). A leitura e a gravação da lista são em passos separados.
- **S6c — erros do código não pesam contra a conta:** **20 códigos errados em 4 entradas seguidas** (com a senha certa) não geraram nenhum
  bloqueio nem alerta; só existe o limite de 20 verificações a cada 10 minutos por endereço de internet. Quem já descobriu a senha pode
  tentar adivinhar o código (1 em ~333 mil por tentativa) usando vários endereços sem ser notado.

### S7 — Verificação em duas etapas só existe para o Super Admin ✅ (mapeado em 26/11/2026)
Hoje a verificação (app autenticador + 10 códigos de recuperação, reforçada nas etapas S6) vale só para o Super Admin: a tela **Segurança**, o item
do menu, as ações de ativar/desativar e a condição do login (`cargo === SUPERADMIN`) são exclusivos dele. O **Admin da Empresa** vê os dados e as
conversas de todos os usuários da empresa, redefine acessos e é o alvo mais valioso depois do Super Admin; o **Usuário Individual** é dono de uma
conta paga com WhatsApp conectado. Senha vazada, reaproveitada ou capturada por phishing entrega a conta inteira.
O que muda para estender (esforço médio, sem migração): liberar a tela e o menu Segurança aos outros perfis, generalizar as ações e o login, alerta
por e-mail ao próprio usuário (em vez do alerta do Super Admin), e **botões de redefinir a verificação de quem perdeu o celular e os códigos** (Admin da
Empresa para os usuários dele; Super Admin para Admins e Individuais), com Logs, e-mail ao afetado e sessões encerradas.

### S8 — Limites por endereço de internet: confiança no cabeçalho, IPv6 e memória ✅ (reproduzido em 26/11/2026) — **FEITA na v1.46.7 (decisão #163)**
O site roda num único processo (pm2, sem cluster), então guardar o limite em memória é coerente. Reproduzido no site de teste (login, limite de
20 por 10 minutos por endereço; controle: o mesmo endereço 25 vezes = 5 bloqueados, como deve):
- **S8a — confia na primeira entrada do `X-Forwarded-For`:** com o cabeçalho `X-Forwarded-For: <qualquer>, <endereço real>`, a 1ª entrada
  mudando a cada pedido, **0 de 25 foram bloqueados**. Hoje o Caddy sobrescreve o cabeçalho (quem o envia não consegue forjar), mas
  se algum dia ele passar a acrescentar (outra versão ou configuração), todos os limites, os Logs e o alerta de "endereço novo do Super Admin"
  ficariam forjáveis. O código lê a 1ª entrada em 3 lugares (`limite-acesso.ts`, `logs.ts`, `alertas-seguranca.ts`).
- **S8b — IPv6:** **25 endereços IPv6 diferentes do mesmo bloco /64: 0 bloqueados.** Quem tem IPv6 recebe um bloco /64 inteiro (bilhões de
  endereços) e foge de qualquer limite por endereço. Só atinge se o site passar a ter registro AAAA (hoje só IPv4); vale corrigir antes.
- **S8c — memória sem teto firme:** o mapa de limites só é limpo (varrendo tudo) quando passa de 5 mil chaves e só remove as inativas há mais
  de 1 hora; uma inundação de endereços distintos pode crescer e gastar CPU na varredura.
- **S8d — reinício zera os limites:** acontece em cada atualização/queda do site. Por desenho; as proteções de alto valor (bloqueio de conta,
  recuperação de senha, verificação em duas etapas) já estão no banco desde as etapas S5 e S6.

### S9 — Senhas temporárias viajam em texto no e-mail ✅ (mapeado em 26/11/2026) — **Fase 1 (recuperação) FEITA na v1.46.8 (decisão #164); Fase 2 (contas novas, usuário criado pelo Admin, redefinir/reenviar acesso) pendente, prévia própria**
Hoje **5 lugares** geram uma senha temporária e a enviam em texto no e-mail (ou, no último caso, no terminal):
1. **Recuperação** ("Esqueci minha senha", `api/auth/recuperar`): pedido público, vale 24 h. É a superfície de ataque (qualquer pessoa dispara).
2. **Conta nova** (`contas.ts: criarConta` — compra, teste grátis, Super Admin cria empresa): e-mail de boas-vindas, vale 7 dias.
3. **Admin da Empresa cria usuário** (`criarUsuarioNaEmpresa`): e-mail de boas-vindas, 7 dias.
4. **Redefinir/reenviar acesso** (`usuarios: resetarSenha`, `usuarios-individuais: reenviarAcesso`): e-mail de boas-vindas, 7 dias.
5. **Instalação** (`seed`): senha do Super Admin mostrada no terminal (não passa por e-mail).
Problemas: a senha fica guardada na caixa de e-mail (histórico, cópias de segurança, aparelhos sincronizados, encaminhamentos) e continua
valendo por 24 h ou 7 dias, quantas vezes alguém a usar, até ser trocada. Link de uso único com validade curta não tem esses problemas.
Observações: há 7 arquivos de teste de ponta a ponta que leem a senha temporária do log do site (`login-regras`, `etapa27`, `etapa29`, `etapa30`,
`etapa4b`, `etapa4c`, `etapa5`), que precisarão ser adaptados.

### S9 — Fase 2 (levantamento em 26/11/2026) — **FEITA na v1.46.9 (decisão #165); falta só a Fase 3 (remover a senha temporária do código, versão futura)**
- Os 4 caminhos que ainda e-mailam senha temporária (conta nova por compra/teste grátis/Super Admin, usuário criado pelo Admin, redefinir/reenviar acesso)
  usam `enviarEmailBoasVindas(…, senhaTemporaria, …)` em 7 chamadas; `criarConta` e `criarUsuarioNaEmpresa` gravam `senhaTempHash` (7 dias).
- **Sobra da S4 (reproduzida):** conta nova que ainda não definiu senha (`senhaHash` vazio) responde ao login **mais rápido** (55 ms) que conta com
  senha (97 ms) ou e-mail inexistente (84 ms): `conferirSenha` sai cedo quando não há hash. Revela quem é conta recém-criada.
- **"Resetar senha" não invalida a senha atual:** só acrescenta uma senha temporária; quem tinha a conta comprometida continua entrando.
- Três testes de ponta a ponta (`etapa4b`, `etapa4c`, `etapa5`) leem a senha temporária do e-mail de boas-vindas e precisarão ser adaptados.

### S10 — A nova senha pode ser igual à temporária ✅ — **FEITA na v1.46.1 junto com a S1 (#157)**
`trocar-senha` só valida a força; aceita repetir a senha temporária que passou por e-mail. Tratado junto com a S1.

## Ordem sugerida das prévias
S1 ✅ → S2 ✅ → S4 ✅ → S5 ✅ → S6 ✅ → S3 ✅ → S8 ✅ (S7 só se o dono quiser). Itens ❓ serão reproduzidos antes de virar prévia; se não se confirmarem, saem da lista.
