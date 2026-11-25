# Novidades — FilaPro Leads

Histórico das versões. A versão atual aparece no rodapé do menu e na Ajuda.

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
