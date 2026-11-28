# Novidades — FilaPro Leads

Histórico das versões. A versão atual aparece no rodapé do menu e na Ajuda.

## v1.53.1 — Pulso no plano em destaque (28/11/2026)
- O plano em destaque do popup de Planos agora tem uma luz de cometa correndo em volta do cartão.

## v1.53.0 — Sobre editável (28/11/2026)
- Em **Planos**, o Super Admin agora edita o texto do botão **Sobre** do login. Vazio = texto padrão.

## v1.52.2 — Pulso do login mais lento (28/11/2026)
- A luz que corre na borda da barra de menu do login ficou 50% mais lenta (uma volta a cada 8 segundos).

## v1.52.1 — Visual da barra de menu do login (28/11/2026)
- A barra do login ficou como no modelo aprovado: sem fundo, borda cinza fina e nomes em azul-ciano, no topo da tela (no computador).

## v1.52.0 — Barra de menu no login (28/11/2026)
- O login ganhou a barra **Planos e Preços | Fale conosco | Sobre**, com um pulso de cometa azul correndo na borda e os nomes pulsando.
- **Sobre** mostra o resumo do FilaPro Leads e os links dos Termos de uso e da Política de privacidade.

## v1.51.0 — Planos de Redes Sociais (28/11/2026)
- Já existem os planos das categorias **Redes Sociais** (só mensal, sem disparos) e **Redes Sociais + Disparos** (cópia dos mensais com as informações das redes). Eles nascem **ocultos**: defina os preços e ligue em Planos.
- Quem tem plano só de Redes Sociais vê, em Campanhas, o aviso com o caminho do **upgrade para Redes Sociais + Disparos**.
- A aba do login agora é **Módulo Business**.
- A roleta da equipe (Business) vem na próxima etapa.

## v1.50.1 — Tela de planos em 4 grupos (28/11/2026)
- A tabela de **Planos** agora é separada nas 4 categorias, cada uma com o seu destaque. As setas de ordem movem o plano dentro da categoria.

## v1.50.0 — Planos em 4 categorias e nome Business (28/11/2026)
- O popup **Planos** agora tem 4 abas: **Individual**, **Business**, **Redes Sociais** e **Redes Sociais + Disparos**. Mensais e por disparo aparecem juntos dentro de cada aba.
- **"Empresarial" passou a se chamar "Business"** nas telas, relatórios e pedidos.
- No cadastro de planos (Super Admin) há o campo **Categoria**; o destaque vale por categoria.
- Os planos de Redes Sociais aparecem na aba, mas as funções deles (recepção, qualificação e roleta) chegam nas próximas etapas.

## v1.49.8 — Fale conosco: script protegido contra sumiço (28/11/2026)
O script do Fale conosco agora guarda a **versão anterior** (botão "Restaurar a versão anterior"), mantém uma cópia neste navegador e não deixa uma atualização atrasada da tela zerar o campo. Salvar vazio nunca apaga: só o botão "Apagar script".

## v1.49.7 — aviso de colchetes mais preciso (28/11/2026)

- Nos campos de texto grande com **Texto sugestão**, o aviso amarelo "Troque os textos entre colchetes [ ]" agora só aparece para os colchetes **do modelo** que ainda não foram trocados, e **mostra quais são**. Colchetes que você mesmo escreveu não disparam mais o aviso.

## v1.49.6 — Fale conosco: o script não se perde mais por engano (28/11/2026)

- A tela **Script do Fale conosco** mostra se há script salvo ("Script salvo: N caracteres") e **não deixa um salvamento com o campo vazio apagar** o script que já existe. Para apagar de propósito, use o botão **Apagar script**.

## v1.49.5 — Fale conosco: o script é lido com mais segurança (28/11/2026)

- Ajuste na leitura do script do Fale conosco no atendimento real e registro, no log do serviço 24/7, de onde ele veio (sem mostrar o conteúdo).

## v1.49.4 — Fale conosco: o script vale em todas as respostas (28/11/2026)

- A IA do Fale conosco agora segue o seu script **em toda resposta**, inclusive em conversas que já tinham respostas antigas (escritas antes do script).
- O serviço 24/7 registra no log, a cada resposta, o que a IA recebeu (tamanho do script e do material, planos e promoções), para você conferir.

## v1.49.3 — Fale conosco: a IA agora segue o seu script (28/11/2026)

- **Correção:** a IA do Fale conosco não estava seguindo o **Script do Fale conosco** nem o material comercial. Agora ela tem um roteiro próprio de consultora e **segue o seu script** (e usa as suas respostas prontas), com os valores e promoções dos planos sempre como cadastrados.
- Em **Testar uma mensagem**, a tela agora mostra **o que a IA recebeu**: o seu script (quantos caracteres), o material comercial e quantos planos e promoções.
- Se o script foi salvo por outro Super Admin, a IA também o usa.

## v1.49.2 — Fale conosco: script de atendimento, material comercial e promoções dos planos (27/11/2026)

- Novo cartão **Script do Fale conosco** em **Configurações → Empresa | IA** (só Super Admin): escreva (ou comece pelo **Texto sugestão**) o roteiro que a IA do Fale conosco segue ao conversar com quem ainda não é cliente. Dá para **testar uma mensagem** antes de valer.
- A IA do Fale conosco agora **conhece o sistema** (material comercial: o que o FilaPro Leads faz, como começar, objeções comuns, o que nunca prometer) e lê os **valores e as promoções dos planos direto do cadastro**: preço antigo e atual, oferta, condições, descontos por quantidade, teste grátis.
- Ela **nunca inventa preço nem desconto**, não promete resultado nem "100% sem bloqueio" e não pede dados de pagamento no chat; negociação, contrato e nota fiscal vão para você.

## v1.49.1 — suporte: a tela limpa quando o atendimento termina (27/11/2026)

- Quando o atendimento do suporte é **encerrado** (10 minutos sem o cliente escrever), a **tela do chat fica limpa** na próxima vez que o cliente abrir o suporte. Se ele escrever de novo, começa um **atendimento novo**, sem as mensagens do anterior.
- No **Atendimento** (Super Admin), o chat do cliente também mostra só o atendimento atual. O botão **Atendimentos anteriores** abre o histórico dos atendimentos já encerrados (só leitura), com data e hora.
- A **IA do suporte** começa o atendimento novo **sem** o contexto do anterior.
- **Nada é apagado:** o histórico fica guardado (e segue a regra de 365 dias). As conversas que já estavam encerradas ficam limpas também; as que nunca foram encerradas continuam como estão.

## v1.47.0 — verificação em duas etapas para todos (26/11/2026)

- **Admin da Empresa, Usuário Individual e Usuário** agora podem proteger a conta com a **verificação em duas etapas** (app autenticador, como o Super Admin): menu **Segurança** → Ativar. É **opcional**; quem é dono da conta vê um convite discreto no topo.
- Quem ativa passa a digitar também o **código do app** depois da senha. Cada código vale uma vez; 10 erros em 15 minutos bloqueiam o código por 15 minutos (os **códigos de recuperação** continuam funcionando) e você recebe um **e-mail de aviso**. Recuperar a senha por e-mail **não dispensa** o código.
- **Perdeu o celular e os códigos?** O **Admin da Empresa** redefine a verificação dos usuários dele (botão **Redefinir verificação**, em Usuários); o **Super Admin** redefine a dos Admins (Empresas → Ver usuários) e a dos Individuais. A pessoa é avisada por e-mail, os aparelhos dela saem e ela volta a entrar só com a senha. **Confirme quem é a pessoa por outro canal antes de redefinir.**
- Na lista, quem usa a verificação aparece com **"2 etapas"**.

## v1.46.9 — segurança: contas novas e redefinição de acesso por link, sem senha por e-mail (26/11/2026)

- **Contas novas** (compra, teste grátis, criadas pelo Super Admin ou pelo Admin da Empresa) recebem por e-mail um **link para criar a senha** (vale 7 dias e só pode ser usado uma vez), em vez de uma senha escrita no e-mail. Ao criar a senha, é só entrar; não há mais a tela de "primeiro acesso".
- **Resetar senha** (Admin da Empresa) e **Reenviar acesso** (Super Admin) agora **redefinem de verdade**: a senha antiga deixa de valer, os aparelhos conectados saem e a pessoa recebe um link para criar a nova.
- Se o link expirar, a pessoa pede outro em **"Esqueci minha senha"**.
- Na lista de usuários, quem ainda não criou a senha aparece como **"Aguardando criar a senha"**.
- Corrigida uma diferença de tempo no login que deixava descobrir contas recém-criadas.
- Quem já recebeu uma senha temporária por e-mail pode usá-la até ela vencer (no máximo 7 dias).

## v1.46.8 — segurança: recuperar a senha por link, não por senha no e-mail (26/11/2026)

- **"Esqueci minha senha"** agora envia um **link para criar a nova senha** (vale 30 minutos e só pode ser usado uma vez), em vez de uma senha escrita no e-mail. Nada de senha guardada na caixa de e-mail.
- Abrir o link não o gasta; só quando você **salva a nova senha**. Se a senha for fraca, o link continua valendo para você tentar de novo.
- Ao criar a nova senha, **os outros aparelhos conectados saem** e você recebe o aviso "Sua senha foi alterada". Depois é só entrar com a nova senha (o Super Admin continua precisando do código do app autenticador).
- Pediu um link novo? O anterior deixa de valer.
- Na tela de login, o painel "Recuperar senha" tem os textos novos (só as frases mudaram).
- As **contas novas** ainda recebem a senha temporária de boas-vindas por e-mail; isso muda numa próxima etapa.

## v1.46.7 — segurança: os limites por endereço de internet não têm mais contorno (26/11/2026)

- O endereço de quem acessa passa a ser sempre o que o **servidor de entrada (Caddy)** informa; um cabeçalho inventado não engana mais os limites, os Logs nem o alerta de "endereço novo" do Super Admin.
- **IPv6:** quem tem IPv6 conta pelo bloco inteiro dele, então não dá mais para fugir do limite trocando de endereço dentro do bloco.
- A memória usada pelos limites tem **teto**, mesmo sob um ataque com milhares de endereços.
- Os **Logs e e-mails** continuam mostrando o endereço completo.
- **Na VPS:** o `atualizar.sh` também ajusta a configuração do Caddy (com conferência antes; se falhar, mantém a antiga e avisa).

## v1.46.6 — segurança: arquivos, avisos e manual só para quem tem acesso (26/11/2026)

- Baixar **arquivos**, abrir os anexos do **suporte**, marcar **comunicados** como lidos e ver as imagens do **manual** agora valem só para quem tem a conta em dia e já trocou a senha temporária. Uma sessão antiga de conta vencida, inativa ou bloqueada não passa mais.
- Os **relatórios, o financeiro e os logos** do Super Admin também conferem isso (se um Super Admin for bloqueado, a sessão dele cai na hora).
- **Desligar a cobrança automática do cartão** continua permitido para plano vencido ou empresa inativa (é um direito do cliente), mas não para quem ainda não trocou a senha temporária nem para usuário bloqueado.
- Para quem tem conta normal, nada muda.

## v1.46.5 — segurança: cada código do app autenticador vale uma vez (26/11/2026)

- **Super Admin:** o código de 6 dígitos da verificação em duas etapas **só entra uma vez**. Se alguém vir ou copiar o código, não consegue usá-lo de novo. Ao entrar duas vezes seguidas em menos de 30 segundos, espere o **próximo código** do app.
- Os **códigos de recuperação** valem uma vez de verdade, mesmo se usados ao mesmo tempo.
- **10 códigos errados em 15 minutos** congelam a verificação por código por 15 minutos e você recebe um **alerta** no WhatsApp e no celular. **Os códigos de recuperação continuam funcionando**, então você nunca fica sem entrar.
- Tentativas de repetir um código aparecem nos **Logs**.

## v1.46.4 — segurança: ninguém tranca a sua conta de propósito (26/11/2026)

- As **5 senhas erradas** agora bloqueiam **só quem errou** (aquele endereço de internet, naquele e-mail) por 15 minutos. Antes, bastava alguém errar 5 vezes para trancar a conta inteira, mesmo com o dono usando outro aparelho.
- Se **muitos endereços diferentes** errarem a senha da mesma conta (30 erros em 15 minutos), a conta entra em **proteção** por 15 minutos e você recebe um **e-mail de aviso** (no máximo 1 por hora).
- **Você nunca fica sem saída:** a **senha temporária** enviada ao seu e-mail ("Esqueci minha senha") entra na hora, mesmo com a conta em proteção, e libera tudo.
- A recuperação de senha tem limite de **3 pedidos por hora** e só gera outra senha depois de **10 minutos** (acaba a enxurrada de e-mails e a senha do e-mail não é mais anulada por outros pedidos).
- Para o dia a dia nada muda: mesma tela, mesmas mensagens.

## v1.46.3 — segurança: ninguém descobre quais e-mails têm conta (26/11/2026)

- O **login** leva o mesmo tempo e dá as mesmas respostas, o e-mail tenha conta ou não. O bloqueio por tentativas (5 erros, 15 minutos) agora é igual para qualquer e-mail, então não dá mais para descobrir contas errando a senha.
- A **recuperação de senha** responde na hora e sempre igual; a senha temporária é enviada logo depois, só para quem tem conta.
- Na **compra de plano**, quem insistir com e-mails que já têm conta é limitado a 5 respostas por hora (por endereço de internet). A mensagem clara continua para o cliente de verdade.
- Para você, que tem conta, nada muda: o login, a senha temporária e a recuperação funcionam como antes.

## v1.46.2 — segurança: conta vencida, inativa ou bloqueada para de verdade (26/11/2026)

- **Campanhas:** se o plano vencer, a empresa for inativada (por exemplo, estorno) ou o usuário for bloqueado, as campanhas em andamento **pausam sozinhas** e **voltam sozinhas** quando o acesso voltar (renovação, ativação ou desbloqueio). Nada é enviado nesse meio-tempo.
- **IA:** a IA **não responde** mais conversas de contas sem acesso. As mensagens dos leads continuam sendo guardadas.
- **Avisos:** contas sem acesso não recebem avisos de leads nem de queda do WhatsApp. Os avisos de renovação continuam.
- O WhatsApp **continua conectado**: ao renovar, não precisa ler o QR Code de novo.
- Ao inativar uma empresa ou bloquear um usuário, **as sessões abertas e as notificações do celular são encerradas** na hora.
- Rotas de presença, suporte e notificações deixam de responder para contas sem acesso.
- Sessões vencidas são **limpas automaticamente**.

## v1.46.1 — segurança: trocar a senha só no primeiro acesso (26/11/2026)

- A troca de senha da tela de **primeiro acesso** passou a valer **somente** para quem entrou com a senha temporária. Quem já tem senha definitiva não consegue mais trocá-la por essa porta.
- A nova senha **não pode ser igual à temporária** enviada por e-mail.
- Ao definir a senha, **todos os outros aparelhos conectados na conta são desconectados** e a sessão é renovada.
- Você recebe um **e-mail "Sua senha foi alterada"** com data, hora e endereço de internet (sem a senha). Se não foi você, use "Esqueci minha senha" e avise o suporte.
- A sessão de primeiro acesso vale **30 minutos**; passou disso, é só entrar de novo com a senha temporária.
- A troca aparece nos **Logs** (Entradas).

## v1.46.0 — atendimento do suporte encerrado por inatividade (26/11/2026)

- Se, depois da resposta do suporte (ou da IA), o **cliente ficar 10 minutos sem escrever**, o atendimento é **encerrado** automaticamente, com a mensagem
  "Atendimento encerrado por inatividade. Se precisar, é só escrever de novo." No **Atendimento** (Super Admin) a conversa ganha o selo **"Encerrada"**; o histórico continua lá.
- Se o cliente escrever de novo, o atendimento **reabre sozinho** e a IA volta a atender (se estiver ligada).
- **Nunca** encerra enquanto o cliente espera o atendente. Conversas antigas não são encerradas em massa na atualização.

## v1.45.4 — ajustes finais do WhatsApp; Módulo 4 revisado (26/11/2026)

- A tela do **WhatsApp** só atualiza sozinha com a aba **visível** (economiza o servidor) e atualiza na hora quando você volta para ela.
- **"Conectado desde"** agora mostra a data da conexão de verdade; depois de uma queda aparece também **"Última reconexão"**.
- Se você apertar **Conectar** ou **Tentar agora** várias vezes seguidas, a tela pede para **aguardar alguns segundos** (10 s para gerar o QR, 5 s para tentar de novo). Desconectar nunca é limitado.
- O sistema tenta **3 vezes** guardar o login do WhatsApp; se não conseguir, avisa nos **Logs**.
- **Super Admin:** nos Logs aparece, uma vez por semana, o **tamanho das chaves do WhatsApp** de cada número, com aviso se crescer demais.

## v1.45.3 — reconexão dos WhatsApps aos poucos (26/11/2026)

- Ao **reiniciar o serviço** (por exemplo, a cada atualização) ou depois de uma queda geral, os números de WhatsApp agora **reconectam aos poucos** — no máximo 2 por vez,
  um a cada 1,5 segundo — em vez de todos ao mesmo tempo. Isso protege a VPS e reduz o risco de o WhatsApp limitar as conexões.
- O serviço **sobe na hora**; o número da plataforma volta primeiro, depois quem tem campanha em andamento, depois os demais.
- As tentativas depois de uma queda têm intervalos um pouco diferentes para cada número, então não tentam todas juntas.
- Clicar em **Conectar** ou **Tentar agora** continua imediato.

## v1.45.2 — Logs mostram as quedas do WhatsApp (26/11/2026)

- Na tela **Logs** (tipo WhatsApp), cada queda agora vira **uma linha**: quando voltou, quando e por que caiu (com o código), quanto tempo ficou fora e quantas tentativas foram.
- Quedas longas geram uma linha extra aos **3 minutos** ("ainda não voltou") e às **2 horas** ("está com problema").
- Quando o serviço é reiniciado, a linha diz **"reconectado depois do reinício do serviço"**, separada de uma queda. "WhatsApp conectado" passa a valer só para a primeira conexão.

## v1.45.1 — o mesmo número só em um WhatsApp (26/11/2026)

- Um número de WhatsApp agora só pode estar conectado em **um** lugar. Se você ler o QR Code de um chip que já está em outro dos seus WhatsApps (ou em outra conta),
  a conexão **nova é recusada** com uma mensagem na tela; a que já estava conectada continua funcionando.
- **Super Admin:** números que **já estavam repetidos** não foram desconectados. Eles aparecem na tela **Logs** ("Número repetido: …") para você decidir qual manter.

## v1.45.0 — aviso quando o serviço do WhatsApp para (26/11/2026)

- Se o serviço 24/7 parar, a tela **WhatsApp** (e o **Número da plataforma**) mostra o selo vermelho **"Serviço fora do ar"** com uma explicação, em vez de
  continuar mostrando "Conectado". Os botões ficam desativados e o QR Code antigo some. Quando o serviço volta, a tela atualiza sozinha.
- **Super Admin:** você recebe um **e-mail** quando o serviço fica mais de 3 minutos sem sinal e outro quando ele volta (um por queda). Não avisa durante a atualização do sistema.
  Para ligar o aviso, a VPS precisa da rotina a cada 5 minutos (passo na documentação de publicação).

## v1.44.1 — atualização da VPS mais segura (26/11/2026)

- A atualização agora **limpa os tipos gerados do build anterior** antes de montar o site, o que evita o erro "Cannot find module … route.js"
  quando uma tela ou rota é removida. O mesmo vale para **voltar a versão**.
- Se uma atualização **parar no meio** e você rodar de novo, o **ponto de volta** e o **backup** de antes da atualização continuam os da primeira tentativa.

## v1.44.0 — semáforo e chaves da IA em 4 pontos (26/11/2026)

- **Super Admin:** o **Dashboard** mostra os 4 pontos onde a IA atende — **Leads, Campanhas, Suporte e Visitante não Cliente** — com bolinha
  **verde** (ligado), **amarela** (atenção: manutenção, falta de chave ou falhas da IA) e **vermelha** (desligado).
- As **chaves liga/desliga** ficam todas no menu **Inteligência Artificial → Atendimento por IA**. Desligada a IA de um ponto, ela para para a plataforma
  toda; ao **religar**, a IA responde quem ficou esperando (últimas 48 horas).
- Você recebe um **aviso** (WhatsApp de avisos e celular) quando um ponto **fica amarelo, é desligado ou volta ao normal**.
- Usuários veem um aviso nas **Conversas IA** quando a IA dos leads está desligada pela plataforma.

## v1.43.0 — orientações do suporte e teste da IA (26/11/2026)

- **Super Admin:** em **Configurações → Empresa | IA** há o cartão **Orientações do suporte**: escreva horário, respostas prontas e regras de
  atendimento que **só a IA do suporte dos clientes** lê. Vale mais que o manual do sistema, mas nunca mais que as regras de segurança
  (pagamento, cobrança, cancelamento, bloqueio e reclamação continuam indo para você). Há um **Texto sugestão** para começar.
- **Testar uma pergunta:** escreva como se fosse o cliente e veja o que a IA responderia (ou "isso iria para o atendente"). Não cria conversa
  nem avisa ninguém; usa IA (10 testes por hora).

## v1.42.1 — quadrinho do vencimento fecha ao clicar fora (26/11/2026)

- O quadrinho que abre ao tocar em **"Expira em X dias"** (com o botão **Fazer upgrade**) agora **fecha ao clicar fora** dele ou com a tecla **Esc**.
  Antes ele ficava na tela até você tocar de novo no selo.

## v1.42.0 — IA no suporte dos clientes (26/11/2026)

- **Super Admin:** a IA pode responder primeiro quem escreve pelo botão **Suporte**. A chave fica no topo de **Atendimento → Clientes**
  e **começa desligada**: ligue depois de testar. Ela usa a ficha do Empresa | IA, o manual do perfil do cliente e os dados da própria conta dele.
- Quando **você escreve**, a IA para naquela conversa (botão **Devolver para a IA** para reativar). Pagamento, cobrança, cancelamento, conta
  bloqueada, reclamação, arquivo, pedido de atendente e dúvidas que ela não souber **passam para você**, com aviso no WhatsApp e no celular.
- Limite de 20 respostas da IA por conversa por dia. As respostas dela aparecem como "Assistente virtual (IA)".
- **Cliente:** pode ser respondido por um assistente virtual; para falar com uma pessoa, é só pedir um atendente.

## v1.41.15 — caixa de escrever fixa no Atendimento (26/11/2026)

- **Super Admin:** na tela **Atendimento** (Clientes e Interessados) a caixa de escrever (texto, arquivo e Enviar) e o cabeçalho da
  conversa ficam **fixos**; só a lista de mensagens rola. Ao abrir uma conversa, a página já se posiciona nela, na mensagem mais
  recente. Funciona no computador e no celular.

## v1.41.14 — WhatsApp que não reconecta agora tenta de novo sozinho (26/11/2026)

- Se a conexão do seu WhatsApp falhar **ao ser reaberta** (por exemplo, o sistema ficou sem acesso ao banco por alguns instantes),
  o número continua "Reconectando…" e **tenta de novo sozinho**, em vez de ficar parado. A tela mostra "Última falha: …" com o motivo.
- Seu login **nunca é apagado** por causa disso. Se a falha continuar, toque em **Desconectar** e leia o QR Code de novo.
- A tela **Logs** registra só a primeira falha e a recuperação, sem encher a lista.

## v1.41.13 — fila e alerta do número da plataforma (26/11/2026)

- **Super Admin:** as mensagens do número da plataforma agora saem em fila, com 5 a 10 segundos de intervalo e limite de
  200 por dia. Pedidos, segurança e suporte nunca esperam o limite; avisos aos usuários e links de renovação esperam o dia
  seguinte se o limite acabar. Com o número fora do ar, as mensagens ficam guardadas e saem quando ele voltar (expiram em 6 horas).
- A tela **Número da plataforma** mostra "Enviadas hoje", "Na fila" e "Expiradas hoje".
- Se o número da plataforma cair, você recebe o alerta por **notificação no celular e e-mail** (3 minutos fora, quando volta,
  2 horas fora e desconexão de vez), e a tela mostra o selo **"Com problema"**.

## v1.41.12 — aviso quando seu WhatsApp cai (26/11/2026)

- Se o seu WhatsApp ficar **3 minutos** fora, você recebe um aviso (no celular e no WhatsApp de avisos). Quando voltar,
  avisamos de novo, dizendo quanto tempo ficou fora. Quedas mais curtas não geram aviso.
- Se ficar **2 horas** fora, a tela WhatsApp mostra o selo vermelho **"Com problema"** e você recebe um aviso com o que fazer.
- Se o WhatsApp for **desconectado de vez** (pelo celular, bloqueio ou aberto em outro lugar), o aviso sai na hora, com o motivo.
- O Admin da Empresa recebe uma cópia dos avisos dos usuários dele. Estes avisos ficam sempre ligados.

## v1.41.11 — chip novo começa devagar (26/11/2026)

- Se você trocar o chip de um dos seus WhatsApps, o número novo **recomeça o aquecimento** (20 envios por dia nos
  primeiros dias, aumentando aos poucos), para reduzir o risco de bloqueio. O mesmo chip reconectado não muda nada.

## v1.41.10 — número que saiu do plano fica desligado (26/11/2026)

- Número extra que saiu do plano não volta a funcionar sozinho depois de uma atualização do sistema.
  As conversas dele continuam guardadas, e a saída fica registrada em **Logs**.

## v1.41.9 — WhatsApp mostra quando está voltando sozinho (26/11/2026)

- Se a conexão do WhatsApp cair, a tela mostra **"Reconectando…"**: quando caiu, a tentativa e quanto falta para a próxima.
  Não precisa ler o QR Code. Use **Tentar agora** para reconectar na hora; **Desconectar** pede confirmação.

## v1.41.8 — usuário excluído sai do WhatsApp (26/11/2026)

- Ao **excluir um usuário**, o WhatsApp dele é desconectado do FilaPro Leads na hora (o aparelho some da lista
  "Dispositivos conectados" do celular dele). Fica registrado em **Logs**.

## v1.41.7 — novo ícone do suporte (25/11/2026)

- O botão **💬 Suporte** virou o **ícone do atendente** (verde): no computador fica ao lado do botão **Sair**, que ficou menor;
  no celular fica no canto de baixo e, em Conversas IA, acima da caixa de escrever (não cobre mais o "Escolher arquivo").

## v1.41.6 — Conversas IA mais fácil de usar (25/11/2026)

- Em **Conversas IA**, a busca, o nome do lead (com Assumir/Devolver) e a caixa de escrever ficam sempre à vista;
  só a lista de conversas e as mensagens rolam. A conversa abre já na mensagem mais recente.

## v1.41.5 — serviço do WhatsApp fechado para a internet (25/11/2026)

- Segurança: o endereço do serviço do WhatsApp (`api.filaproleads.com.br`) passa a responder pela internet só se está no ar;
  enviar mensagens, conectar números e ler anexos só funcionam por dentro do servidor. Nada muda no uso do sistema.

## v1.41.4 — WhatsApp mais estável (25/11/2026)

- Se, por engano, dois serviços do WhatsApp forem ligados ao mesmo tempo, o segundo espera e **nenhum número cai**.
- Quando o WhatsApp avisar "aberto em outro lugar", o número **não perde mais o login**: basta clicar em **Conectar**,
  sem ler o QR Code de novo.
- Clicar em Conectar ou Cancelar enquanto o número se reconecta sozinho não cria mais conexão duplicada nem QR Code fantasma.

## v1.41.3 — segurança em todas as telas e quadro de revisão dos módulos (25/11/2026)

- Correção de segurança: todas as telas passam a conferir, por conta própria, se o seu perfil pode abri-las.
  Antes, em um caso específico de navegação, telas do Super Admin podiam ser lidas por outros usuários.
- **Super Admin:** em **Ajuda → Módulos e revisões**, o quadro dos 12 módulos com o status da revisão de cada um
  (Revisado, Em revisão ou Sem revisão), a data, a hora e a versão da revisão e o histórico de ajustes.

## v1.41.2 — respostas chegam aos contatos do WhatsApp novo (25/11/2026)

- Alguns contatos escrevem pelo formato novo do WhatsApp, que esconde o número. Agora a IA e as suas mensagens
  respondem **no mesmo endereço de onde o lead escreveu**, e a resposta aparece na conversa dele.

## v1.41.1 — campanha nunca sai duas vezes (25/11/2026)

- Se a mesma campanha estiver aberta em duas abas, ou o botão for clicado de novo, ela **não é enviada duas vezes**:
  aparece "Esta campanha já foi iniciada ou agendada. Veja na aba Em andamento."
- Depois de **Iniciar disparo** ou **Agendar**, a tela abre direto na aba **Em andamento**.

## v1.41.0 — IA do WhatsApp responde sempre e mais rápido (25/11/2026)

- A IA responde **8 a 15 segundos** depois da última mensagem do lead (no máximo 30 s, mesmo que ele mande várias seguidas).
- Se o serviço reiniciar ou o WhatsApp cair, **nenhuma resposta se perde**: ela fica guardada e sai assim que possível.
- Se a IA falhar, o sistema tenta de novo (10 s e 30 s). Na 3ª falha, o lead recebe "Recebi sua mensagem! Já te respondo. 🙂"
  e **você é avisado** para assumir.
- WhatsApp desconectado com leads esperando resposta: você recebe um aviso depois de 5 minutos.
- Quando a IA não sabe algo, ela diz que vai confirmar com você e **continua a conversa** (não pausa mais); você recebe o aviso.
- Leads achados pelo número com ou sem o 9º dígito.

## v1.40.2 — quadro do menu de volta (25/11/2026)

- O quadro **Espaço individual** no fim do menu do usuário voltou (só com o título); saiu apenas o texto dele.

## v1.40.1 — menu fixo e telas mais limpas (25/11/2026)

- **Menu lateral:** o nome e o perfil (em cima) e o botão Sair e a versão (embaixo) ficam fixos; só a lista do menu rola.
- Saíram os avisos "Você está vendo apenas seus dados" (barrinha do topo, quadro do menu, selos do Dashboard e frase da tela Leads).
  Nada muda em quem vê o quê: cada usuário continua vendo só os próprios dados.

## v1.40.0 — fazer upgrade quando quiser (25/11/2026)

### Para o dono da conta (usuário Individual ou Admin da Empresa)
- Toque no selo **Expira em X dias** (ou **Renova em X dias**) no topo e em **Fazer upgrade**: escolha um plano igual ou maior,
  ou mais números de WhatsApp / mais usuários, e pague ali mesmo — sem esperar o link de renovação.
- Você paga o valor cheio do plano e **os dias que faltavam são somados**. Entre planos por disparo, **os disparos que sobraram
  passam** para o novo período. Vindo do teste grátis, o plano começa hoje.
- Antes de pagar aparece o resumo: valor, novo vencimento e o que passa para o novo período.
- Plano menor: só na renovação.

## v1.39.0 — cobrança automática no cartão (25/11/2026)

### Para quem compra ou renova
- Ao pagar com **Cartão**, a opção **Cobrar automaticamente a cada período** vem marcada: o cartão é cobrado sozinho no dia do
  vencimento e o acesso renova sem precisar fazer nada (planos mensais, trimestrais, semestrais e anuais; sempre à vista).
- O selo do topo mostra **Renova em X dias**; tocando nele, o dono da conta pode **desligar** a cobrança automática.
- Aviso 3 dias antes de cada cobrança.

### Para o Super Admin
- **Pedidos** mostra **Cartão (automática)**; cada renovação automática é confirmada sozinha, com receita e taxa no Financeiro.
- **Empresas** e **Usuários Individuais**: **Cobrança automática: ligada** e o botão para desligar.
- **Alterar pacote** e **Prorrogar** atualizam o valor e a data da próxima cobrança no Asaas.

## v1.38.3 — botão "Instalar app" instala direto no Android (25/11/2026)

- **Android:** o botão **Instalar app** do login agora só aparece quando dá para instalar direto, e instala na hora pela janela
  do Chrome, sem passo a passo. Quem já tem o app instalado não vê mais o botão no navegador.
- **iPhone:** a Apple não permite instalar direto; o passo a passo ficou mais curto, com o desenho do botão Compartilhar.

## v1.38.2 — login inteiro em celular pequeno (25/11/2026)

- Em celulares de tela bem baixa (ex.: iPhone SE antigo), a frase "Envios com ritmo…" do login não aparece, para o quadro de
  acesso caber inteiro, com o botão Entrar visível. Nos outros celulares e no computador nada muda.

## v1.38.1 — texto da lista de leads vazia (25/11/2026)

- Leads: com a lista vazia, a frase agora diz "Adicione no quadro **Adicionar leads**" (no celular o quadro fica embaixo, não ao lado).

## v1.38.0 — botão "Texto sugestão" no Como qualificar (24/11/2026)

### Para quem configura a IA (Empresa | IA)
- No editor grande do **Como qualificar os leads**, o botão **Texto sugestão** preenche um roteiro completo de atendimento
  (tom de voz, regras, perguntas de qualificação, objeções e exemplo de conversa).
- Uma **faixa amarela** lembra de trocar os textos entre colchetes, como [NOME DA IA], pelas informações reais.
- O campo agora aceita até **10.000 caracteres**.

### Para o Super Admin
- **Inteligência Artificial → Texto sugestão do "Como qualificar os leads"**: edite o texto que aparece para todos os clientes,
  ou clique em **Voltar ao texto padrão**.

## v1.37.0 — editor grande para "Como qualificar os leads" (24/11/2026)

- Empresa | IA: ao clicar em **Como qualificar os leads**, abre um **editor grande no meio da tela**, com contador de caracteres,
  **Salvar** e **Cancelar**. Fica muito mais fácil escrever orientações longas para a IA.

## v1.36.3 — botão Testar da IA usa a chave única (24/11/2026)

- Inteligência Artificial: o botão **Testar** de cada tarefa (Gerar, Aprender, Qualificar, Conversar) agora usa a
  **chave da Anthropic para todas as tarefas** quando a tarefa não tem chave própria. Antes ele dizia "chave não configurada"
  mesmo com a chave salva (o uso de verdade já funcionava; só o teste estava errado).

## v1.36.2 — abas dos Planos sempre visíveis no celular (24/11/2026)

- No celular, ao rolar a lista do botão **Planos**, as abas (Individual / Empresarial e Mensal / Por disparo) ficam **fixas no topo**:
  dá para trocar de aba sem voltar lá para cima. No computador nada muda.

## v1.36.1 — login centralizado no celular (24/11/2026)

- No celular (navegador e app instalado), o nome **FilaPro Leads**, a frase e o quadro de acesso ficam **centralizados na tela**,
  sem o espaço vazio no meio. O visual continua o mesmo; no computador nada muda.

## v1.36.0 — pagamento do Asaas confirmado sozinho (24/11/2026)

### Para quem compra ou renova
- Pagou pelo Asaas, o acesso chega sozinho: **PIX e boleto** assim que o pagamento cai; **cartão** assim que a compra é aprovada.

### Para o Super Admin
- **Pedidos do Asaas se confirmam sozinhos** pelo aviso do Asaas (conta criada, renovação, extras, e-mail ao cliente).
- A **taxa do Asaas** de cada cobrança entra no Financeiro na categoria nova **Taxas do Asaas**.
- **Estorno** no Asaas: entra como estorno no Financeiro e a **empresa é inativada**; você recebe um aviso.
- **Contestação no cartão** e **pagamento de pedido cancelado**: você é avisado e decide (nada é feito sozinho).
- **Logs** ganhou o tipo **Pagamentos (Asaas)** com tudo o que o Asaas confirmou, estornou ou recusou.

## v1.35.0 — pagar com PIX, cartão ou boleto pelo Asaas (24/11/2026)

### Para quem compra ou renova
- Com o Asaas ligado, o pagamento oferece **PIX**, **Cartão** (na página segura do Asaas) e **Boleto** (+2%).
- Planos **trimestrais e anuais** podem ser pagos em **até 6x no cartão**; o valor de cada parcela aparece antes de pagar.
- Pede o **CPF ou CNPJ** de quem paga (exigido pelo Asaas); nas próximas compras a conta já tem guardado.
- WhatsApp extra e pacotes de disparos usam o PIX do Asaas.

### Para o Super Admin
- **Pagamento → Parcelamento no cartão:** juros ao mês (vazio = só à vista; 0 = sem juros).
- **Pedidos** mostra a forma de pagamento; cancelar um pedido apaga a cobrança no Asaas.
- O PIX manual vira reserva (usado só com o Asaas desligado). A confirmação ainda é em Pedidos; a automática vem na próxima etapa.

## v1.34.4 — aviso do Asaas configurado sozinho (24/11/2026)

- Pagamento → Asaas: botão **Configurar aviso automaticamente** — o FilaPro cadastra (ou corrige) o aviso de pagamento no Asaas,
  sem passo manual no painel deles. **Verificar no Asaas** mostra se está ativo ou com a fila pausada.
- Quadro **Último aviso recebido**: mostra quando o Asaas avisou pela última vez, ou se o aviso foi recusado por token diferente.

## v1.34.3 — login fixo no celular (23/11/2026)

- A tela de login não rola mais nem "pula" no celular (navegador e app instalado). O visual continua o mesmo.
- No app instalado, as telas internas continuam rolando normalmente, sem o efeito elástico nem o "puxar para atualizar".

## v1.34.2 — ligar o Asaas (23/11/2026)

- Super Admin → **Pagamento → Asaas**: ambiente (Testes ou Produção), chave de API guardada criptografada (só é salva se o Asaas
  aceitar), **Testar conexão** e os dados do aviso automático (webhook) para cadastrar no Asaas, com botões Copiar.
- O endereço do aviso já responde ao Asaas (confere o token). A cobrança por cartão, PIX automático e boleto entra nas próximas etapas.

## v1.34.1 — cadastro de usuário individual por tipo (23/11/2026)

- Super Admin → **Usuários Individuais → Novo usuário individual**: novo campo **Tipo** (Mensal ou Por disparo); o campo Plano
  mostra só os planos daquele tipo, com os dias ou disparos do teste no nome (ex.: "Free (teste de 50 disparos)").
- Correção: o Free por dias era criado com limite de 20 disparos, e o plano pago por disparo ficava sem limite. Agora o limite
  vem do plano escolhido.

## v1.34.0 — planos Individual | Empresarial e preço por quantidade (23/11/2026)

### Para quem visita
- O botão **Planos** separa **Individual** e **Empresarial** e, em cada um, **Mensal** (sem limite de disparos) e **Por disparo**.
- Dois testes grátis no Individual: **por dias** (Mensal) e **por disparos** (Por disparo); um teste por e-mail.
- **Escolha a quantidade no cartão:** números de WhatsApp (Individual, até 4) ou usuários (Empresarial — ex.: Padrão 10 a 50).
  Cada item a mais tem desconto pela posição (2º −10%, 3º −15%…) e o preço muda na hora; dá para trocar no pagamento.
- O plano **Personalizado** saiu.

### Para clientes
- Renovação: escolha de novo a quantidade. Com menos números, você escolhe quais ficam; com menos usuários, os mais recentes ficam
  bloqueados até o Admin escolher quem reativar.
- Número extra no meio do período: preço com o desconto da posição, proporcional aos dias que faltam.
- Nos planos com pacotes, disparos por mês e limite de leads acompanham a quantidade.

### Para o Super Admin
- Planos: **descontos por posição**, **máximo de números** (Individual) e **máximo de pacotes** (Empresarial), com tabela de preços ao vivo.
- **Empresas → Alterar pacote** escolhe também a quantidade de pacotes.
- **Meu WhatsApp:** até 10 números, sem pagamento.

### Tela de login
- Assinatura "by Jackson Alexandrino" abaixo do cartão de acesso.

## v1.33.3 — correção do app instalado (23/11/2026)

- O app instalado no celular abria em "localhost" (endereço interno da VPS) quando a pessoa ainda não tinha entrado.
  Agora abre no login do filaproleads.com.br.

## v1.33.2 — ajuste nos Planos (23/11/2026)

- Todos os planos cabem na mesma linha em telas de computador (cartões mais compactos quando há mais de 4); em telas
  estreitas eles quebram em linhas e, no celular, ficam um embaixo do outro. Nenhum cartão fica cortado.

## v1.33.0 — instalar o app pelo login (23/11/2026)

- No celular, o login mostra o botão **Instalar app** (ao lado de Planos): no Android abre a instalação do Chrome; no iPhone
  mostra o passo a passo do Safari. Some quando o app já está instalado.

## v1.32.0 — planos em duas abas (23/11/2026)

### Para quem visita
- O botão **Planos** mostra duas abas: **Sem limite de disparos** e **Por quantidade de disparos**; os cartões mostram os disparos
  por mês e o pacote extra.

### Super Admin
- **Novo plano**, **Duplicar** e **Excluir** na tela Planos, com a coluna **Aba** e um destaque por aba.
- Plano pago ainda sem preço aparece como **"Em breve"** (sem compra).
- Sugestão de 12 planos pronta para aplicar (visíveis como "Em breve", com preço zerado).

## v1.31.1 — bolinha da fila (23/11/2026)

- No login, a fila de envios ganhou a própria bolinha: verde (ativa), amarela (pausada ou em manutenção) ou vermelha (parada).

## v1.31.0 — status real no login (23/11/2026)

- A pílula do login mostra o **estado real**: verde "Sistema Online", amarelo "Em atualização", vermelho "Instabilidade";
  "Fila Ativa" conforme o motor de envios; e o **uptime medido** dos últimos 30 dias.

## v1.30.1 — ajustes no login (23/11/2026)

- O número da versão aparece no login do site publicado, também em telas mais baixas.
- Mais espaço entre os três destaques (Antibloqueio, IA e Online 24/7).

## v1.30.0 — gestão financeira (23/11/2026)

### Super Admin
- Novo grupo **Financeiro**: painel do mês, lançamentos de receitas e despesas, contas a pagar e receber com avisos, despesas fixas
  mensais, estornos, comprovantes, imposto previsto e 7 relatórios com Excel e impressão.
- Pedidos confirmados, despesas fixas e a despesa com IA entram sozinhos.

## v1.29.0 — segurança (22/11/2026)

### Super Admin
- **Verificação em duas etapas** (menu Segurança): código do app autenticador a cada entrada, com códigos de recuperação.
- **Alertas de segurança** no WhatsApp e no celular (bloqueios por senha errada e entrada por endereço novo).
- Limite de tentativas por endereço de internet, cabeçalhos de segurança no site e script de proteção da VPS
  (SSH só com chave, fail2ban e atualizações automáticas).

## v1.28.0 — modo manutenção e chat para interessados (22/11/2026)

### Para todos
- **Sistema em atualização:** durante as atualizações aparece uma tela de aviso e nada pode ser alterado; campanhas, respostas da IA
  e leads de anúncios continuam depois, sem perder nada.

### Super Admin
- **Atualização com modo manutenção automático**, aviso prévio opcional aos usuários e faixa **Liberar o sistema**.
- **Fale conosco** na tela de Planos: a IA atende quem ainda não é cliente; você acompanha e assume em **Atendimento → Interessados**.
  Quem compra passa a ter a conversa no suporte.

## v1.27.0 — suporte em tempo real e disparos por quantidade (22/11/2026)

### Para todos
- Botão **Suporte**: chat em tempo real com o suporte, com imagem ou PDF; o chat abre sozinho quando o suporte chama.
- **Mensagens do FilaPro Leads** em popup no centro da tela (fecham com OK).

### Usuário Individual e Admin da Empresa
- **Disparos do período** no Dashboard (planos vendidos por quantidade): usados, restantes e **compra de pacote extra** por PIX.
  Sem saldo, as campanhas pausam com aviso e a IA continua atendendo; o saldo zera na renovação.

### Super Admin
- Planos vendidos **só por prazo** ou por **prazo + disparos por período**, com pacote extra (quantidade e preço).
- Menu **Online**: quem está usando agora, em que tela e por qual aparelho (Super Admin, Individual, Empresarial e Todos).
- Menu **Atendimento**: conversas do suporte, chamar qualquer cliente, aviso no WhatsApp e no celular quando você estiver offline.
- Menu **Mensagens aos usuários**: para todos, grupos ou escolhidos, com link e validade opcionais e relatório de quem leu.

## v1.26.0 — primeira publicação (22/11/2026)

### Para todos
- **Ajuda** com os manuais de cada perfil, para ler, imprimir ou salvar em PDF.
- **App no celular:** instale pela tela inicial (Android e iPhone), com abertura animada e **notificações no celular**.
- **Gerar senha forte** na criação da senha.

### Usuário
- **Campanhas** com Antibloqueio (Conservador, Equilibrado, Rápido), aquecimento de número novo, janela de envio, feriados,
  "digitando…", anexos e mensagem escrita pela IA com variações.
- **Conversas IA:** a IA responde, qualifica (Quente, Morno, Frio) e trata objeções; Assumir e Devolver conversa.
- **Empresa | IA:** a IA aprende com site, texto, imagem e PDF.
- **Avisos** no WhatsApp e no celular (lead Quente, lead de anúncio, lead respondeu), com resumo a cada 10 minutos.
- **Leads de anúncios** (Google Ads e Facebook/Instagram via Make/Zapier) — recurso pago do plano.
- **Vários WhatsApps** no plano Individual, com rodízio na campanha e compra do número extra por PIX.

### Admin da Empresa
- Usuários com permissões e limite de leads, leads da equipe, conversas (somente leitura), janela de envio e **Logs**.

### Super Admin
- Empresas, usuários individuais, planos, pedidos por PIX, renovação, IA trocável e despesas com IA.
- **Relatórios** (Empresarial, Individual, Leads Empresarial, Lead Individual e Campanhas) com Excel e impressão
  (cabeçalho com logo e quem emitiu, "Página X de Y").
- **Logs** de todas as contas, **Logos** para baixar e **Dados legais** (Política de Privacidade e Termos de Uso).
- Publicação na VPS com backup diário e atualização com um comando.
