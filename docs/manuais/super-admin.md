# Manual do Super Admin — FilaPro Leads

O Super Admin é o **dono da plataforma**: cria e cuida das contas (empresas e usuários individuais), dos planos e dos pagamentos,
configura a IA, as regras de envio e o número que envia os avisos, acompanha tudo pelos relatórios e logs — e também pode enviar
campanhas pelo próprio WhatsApp, como um usuário.

Para as funções de envio (leads, campanhas, Conversas IA, WhatsApp), veja também o **Manual do Usuário**. Para a parte técnica
(servidor, atualização, backup, código), veja o **Manual do Desenvolvedor**.

## Primeiro acesso e segurança

- O Super Admin é criado na instalação, com o e-mail definido no servidor (`SUPERADMIN_EMAIL`) e uma **senha temporária** (vale 7 dias).
- No primeiro acesso, crie a sua senha (pode usar **Gerar senha forte**).
- **Nunca** cole chaves ou senhas em conversas. As chaves de IA ficam guardadas **criptografadas** no menu Inteligência Artificial.
- Em produção não existem contas de demonstração nem os botões "Entrar como…" na tela de login.

## Primeiros passos depois de publicar

1. **Dados legais:** responsável, CPF/CNPJ, endereço, e-mail de privacidade, encarregado de dados (DPO) e foro. Aparecem na
   Política de Privacidade e nos Termos de Uso (páginas públicas).
2. **Pagamento:** chave PIX, nome e cidade do recebedor, e o contato do plano Personalizado.
3. **Planos:** preços, limites e o que cada plano inclui.
4. **Inteligência Artificial:** cole a chave da Anthropic e clique em **Testar** e **Salvar chave**.
5. **Número da plataforma:** conecte o WhatsApp que envia os avisos do sistema (pedidos, renovações, avisos aos usuários) e cadastre
   o seu WhatsApp para receber os avisos de novos pedidos.
6. **Regras de envio:** faixa global de horário e feriados.

## Dashboard

Totais da plataforma agrupados por empresa e por usuário individual: leads, enviados hoje, fila, bloqueados 24h, qualificados e a saúde dos números.

![Dashboard do Super Admin](prints/s-dashboard.png)

## Online

Quem está usando o sistema **agora** (ativo nos últimos 2 minutos), a **tela** aberta e o **aparelho** (Computador, Navegador do
celular ou App no celular). A tela atualiza sozinha a cada 20 segundos.

![Online](prints/s-online.png)

- Abas **Super Admin**, **Individual**, **Empresarial** (agrupado por empresa) e **Todos** (todas as contas, com busca e o
  **último acesso**).
- **Chamar:** abre o chat do suporte na tela do cliente. **Conversa:** abre o histórico em Atendimento.

## Atendimento (suporte em tempo real)

Os clientes (Usuários e Admins da Empresa) chamam pelo botão **Suporte**. As conversas chegam aqui, com o número de mensagens novas
também no menu.

![Atendimento](prints/s-atendimento.png)

- Escolha a conversa à esquerda e responda; pode anexar **imagem (JPG/PNG) ou PDF** até 15 MB.
- **Falar com um cliente:** busque qualquer cliente e abra a conversa. **Chamar cliente:** o chat abre sozinho na tela dele e chega
  uma notificação no celular (se ele ativou).
- Se nenhum Super Admin estiver online quando um cliente escrever, você recebe um aviso no **WhatsApp de avisos** (cadastrado em
  Número da plataforma) e no celular.
- Histórico de 365 dias. O Admin da Empresa não vê as conversas dos usuários com o suporte.

### Aba Interessados (quem ainda não é cliente)

Na tela de **Planos** (botão Planos do login) há o botão **💬 Fale conosco**. O visitante informa nome, WhatsApp (e e-mail, se
quiser), aceita a Política de Privacidade e conversa — só por texto.

![Interessados](prints/s-atendimento-interessados.png)

- **A IA responde primeiro**, como vendedora do FilaPro Leads, usando o **seu Empresa | IA** e os **planos visíveis**, e marca o
  interessado como Quente, Morno ou Frio.
- Se a IA não souber responder, ela **pausa** e você recebe aviso no WhatsApp e no celular.
- **Assumir conversa** (ou escrever uma mensagem) faz a IA parar; **Devolver para a IA** faz ela voltar. Você pode enviar imagem ou PDF.
- Se o visitante não estiver com o chat aberto, a sua resposta vai **também pelo WhatsApp** dele (pelo Número da plataforma).
- A conversa continua no mesmo aparelho do visitante por 30 dias. Se ele comprar (mesmo e-mail ou WhatsApp), a conversa vira o
  **suporte do novo cliente** (aba Clientes). Quem não compra fica guardado 180 dias.
- Proteção contra robôs: limite de mensagens por minuto.

## Mensagens aos usuários

Avisos que aparecem **em popup no centro da tela** do usuário e só fecham com **OK**. Quem estiver fora do sistema vê no próximo acesso.
Não vai cópia por WhatsApp nem e-mail.

![Mensagens aos usuários](prints/s-comunicados.png)

- **Título**, **mensagem**, **link** (opcional, começando com https://) e **vale até** (opcional — depois da data, não aparece mais
  para quem ainda não viu).
- **Quem recebe:** todos os clientes, Admins das empresas, usuários das empresas, usuários individuais, todos de uma empresa ou
  usuários escolhidos um a um.
- **Enviadas:** quantos leram de cada mensagem; abra para ver **quem leu** (com data e hora) e quem ainda não leu.

## Pedidos (vendas por PIX)

Toda compra feita no botão **Planos** da tela de login (ou renovação, ou WhatsApp extra) vira um pedido aqui, e você recebe um aviso no WhatsApp.

![Pedidos](prints/s-pedidos.png)

- Confira o PIX no seu banco (o **código do pedido** vai na identificação do PIX) e clique em **Confirmar pagamento**:
  - **compra nova:** a conta é criada e o acesso vai por e-mail;
  - **renovação:** o prazo é somado e o plano trocado, se mudou; os WhatsApps extras ficam como o cliente escolheu;
  - **WhatsApp extra:** o número é liberado na tela WhatsApp do cliente;
  - **disparos extras:** o saldo do período da conta aumenta e as campanhas pausadas por falta de saldo voltam sozinhas.
- **Cancelar** pedidos que não serão pagos. Pedidos vencidos (24 horas) também podem ser confirmados se o cliente pagou depois.

## Empresas

![Empresas](prints/s-empresas.png)

Para cada empresa: código, pacote, vencimento, usuários e leads. Ações:

- **Nova empresa** (sem pedido): nome, plano, Admin da Empresa.
- **Ver usuários**, **Alterar pacote** (quantidade de usuários), **Limite de leads** da empresa, **Prorrogar**, **Ativar/Inativar**.
- **IA: treino** — liga/desliga o treinamento da IA da conta, limites de materiais e de páginas por mês, e **Liberar agora**
  (zera o uso do mês/período).
- **Anúncios** — liga/desliga o recurso pago "Leads de anúncios" para a conta.

## Usuários Individuais

![Usuários Individuais](prints/s-individuais.png)

Cada usuário individual tem a própria conta e o próprio prazo. Ações: **Novo usuário**, **Prorrogar**, **Limite de leads**,
**Bloquear/Desbloquear**, **Reenviar acesso**, **IA: treino**, **Anúncios** e **WhatsApps** (números extras sem pedido;
ao diminuir, saem os mais recentes).

## Financeiro (faturamento e despesas)

Grupo **Financeiro** do menu, só para o Super Admin. Tudo em **regime de caixa**: receitas e despesas contam no dia em que foram pagas.

![Painel financeiro](prints/s-financeiro.png)

- **Painel:** receitas, despesas, lucro, **imposto previsto**, a receber e a pagar do mês; o mês anterior; gráfico de 12 meses;
  receita recorrente mensal, ticket médio, clientes ativos e pagantes; contas vencidas e dos próximos 7 dias.
- **O que entra sozinho:**
  - todo **pedido confirmado** vira receita paga (venda, renovação, WhatsApp extra ou pacote de disparos) — os antigos também;
  - as **despesas fixas** do mês (como pendentes);
  - no dia 1, a **despesa com IA** do mês anterior (dólar × cotação cadastrada em Inteligência Artificial).
- **Lançamentos:** receitas e despesas com filtros (período, tipo, categoria, conta, situação). **+ Novo lançamento** (pago ou
  pendente, com comprovante PDF/imagem opcional). Em cada linha: **Pagar/Receber**, **Anexar** comprovante, **Estornar** (receitas)
  e **Cancelar**.
- **Estorno:** devolve todo ou parte do valor de uma receita, ligado ao pedido, e abate do faturamento. Receita de pedido não se
  cancela — se estorna.
- **Contas a pagar e receber:** pendentes em Vencidas, Próximos 7 dias e Depois. Você recebe **aviso no WhatsApp e no celular**
  das vencidas e das que vencem em até 3 dias (1 vez por dia).
- **Despesas fixas:** descrição, valor, dia do vencimento, categoria e conta; **Pausar** quando acabar.
- **Relatórios:** resultado por mês, fluxo de caixa, faturamento por plano, receitas e despesas por categoria, receita recorrente e
  clientes ativos, cancelamentos (quem não renovou) e previsão de renovações (30/60/90 dias) — com **Baixar Excel** e **Imprimir**.
- **Configurações:** alíquota do **imposto previsto** (% sobre o recebido no mês, ex.: Simples Nacional), categorias (prontas e
  as suas) e contas bancárias.

![Lançamentos](prints/s-financeiro-lancamentos.png)

## Planos

![Planos](prints/s-planos.png)

**Duas formas de vender:** só por **prazo** (sem limite de envios) ou por **prazo + quantidade de disparos por período**. Na segunda:

- contam só as mensagens de campanha **enviadas com sucesso**; as respostas da IA não contam;
- acabou o saldo: as campanhas **pausam e o cliente é avisado**; a IA continua atendendo;
- o cliente dono da conta (Individual ou Admin da Empresa) compra **pacotes extras** pelo Dashboard, por PIX; você confirma em Pedidos;
- no Empresarial o saldo é da empresa inteira; tudo **zera na renovação**.

Os cartões do botão **Planos** da tela de login. Em cada plano:

- nome, preços (antigo riscado e atual), período, prazo, usuários, selo, frase, condições, oferta, recursos e texto do botão;
- **limite de leads**, **materiais da IA** e **páginas por mês** da IA;
- **Leads de anúncios incluído** (recurso pago);
- no plano Individual: **máximo de WhatsApps** e **preço do WhatsApp extra**;
- **disparos por período** (em branco = vendido só por prazo, sem quantidade), **disparos por pacote extra** e **preço do pacote**;
- no Free: dias e disparos do teste grátis;
- **Visível** no login, **destaque** e ordem.

## Pagamento

Chave PIX e dados do recebedor (aparecem no PIX copia e cola dos pedidos) e o contato do plano Personalizado.

![Pagamento](prints/s-pagamento.png)

## Inteligência Artificial

![Inteligência Artificial](prints/s-ia.png)

- **Chave da Anthropic para todas as tarefas:** cole uma vez; vale para todas as tarefas do Claude. Para trocar de conta da
  Anthropic, é só colar a chave nova.
- **Cada tarefa** (gerar mensagens, aprender sobre a empresa, qualificar, conversar) pode usar outro provedor ou modelo, sem mexer no
  código. Padrão: **Claude Haiku 5.5**, o mais barato. Use **Testar** antes de salvar.
- **Cotação do dólar:** para a tela de despesas mostrar também em reais.

### Despesas com IA

Gráfico atualizado a cada 15 segundos (hoje, 7 dias, mês, período), em dólar e em reais, e o ranking das 30 empresas e
20 usuários individuais que mais consomem.

![Despesas com IA](prints/s-despesas-ia.png)

## Regras de envio

**Faixa global de horário** (nenhuma conta envia fora dela), **sua janela** (para as suas campanhas) e **feriados** (inclui a
Sexta-feira Santa, calculada a cada ano).

![Regras de envio](prints/s-regras-envio.png)

## Número da plataforma

O WhatsApp que envia os avisos do sistema. Use um número só para isso (de preferência um chip dedicado). Se ele cair, os avisos param
de sair, mas o restante do sistema continua.

![Número da plataforma](prints/s-numero-plataforma.png)

## Disparos e campanhas

- **Todos os disparos** e **Disparos por usuários:** acompanhe os envios de todas as contas.
- **Campanhas, Leads, Conversas IA, Arquivos, Empresa | IA, Meu WhatsApp, Avisos e Leads de anúncios:** as suas próprias, para enviar
  como um usuário (o Super Admin segue as mesmas regras do Antibloqueio). Em Leads e Conversas IA você também vê os das contas,
  agrupados, e responde só as suas.

## Relatórios

Menu **Relatório**: **Empresarial**, **Individual**, **Leads Empresarial**, **Lead Individual** e **Relatório de campanhas**.

![Relatório de leads](prints/s-relatorio-leads.png)

- Escolha a conta (com busca) e os filtros (usuário, status, situação, período).
- **Baixar Excel:** planilha com os filtros aplicados.
- **Imprimir:** todas as linhas, com cabeçalho (logo, nome do relatório, **quem emitiu**, data e total), quebra de página e
  **"Página X de Y"** — escolha "Salvar como PDF" na janela de impressão para gerar o PDF.

![Relatório de campanhas](prints/s-relatorio-campanhas.png)

## Logs

O histórico dos últimos 90 dias de **todas as contas**: entradas, senhas erradas e bloqueios, usuários, leads, campanhas e WhatsApp,
com o IP. Filtre por conta, tipo e período.

![Logs](prints/s-logs.png)

## Logos

As 3 versões da logo, sem fundo, para baixar em **PNG** (alta resolução) ou **SVG**: letras vazadas (usada na impressão),
cores da marca e preto e branco.

![Logos](prints/s-logos.png)

## Dados legais

Responsável, documento, endereço, e-mails e foro usados na **Política de Privacidade** e nos **Termos de Uso**
(filaproleads.com.br/privacidade e /termos). Campos vazios aparecem como "[a preencher pelo responsável]" nas páginas.

![Dados legais](prints/s-dados-legais.png)

## Ajuda e versões

Menu **Ajuda**: todos os manuais (cada perfil vê o seu; o Super Admin vê todos) e **Novidades**, com o que mudou em cada versão.
A versão atual aparece no rodapé do menu e na tela de login (em teste). Todos os manuais podem ser impressos ou salvos em PDF.

![Ajuda](prints/s-ajuda.png)

## Operação do dia a dia

| O que | Como |
|---|---|
| Atualizar o sistema | Na VPS: `bash /opt/filapro/app/deploy/atualizar.sh` (faz backup, liga o **modo manutenção**, atualiza, libera e mostra a versão nova) |
| Avisar os usuários antes | `bash /opt/filapro/app/deploy/atualizar.sh --aviso 10` (mensagem em popup e espera 10 minutos) |
| Modo manutenção à mão | `bash /opt/filapro/app/deploy/manutencao.sh ligar` / `desligar` / `estado` — ou **Liberar o sistema** na faixa laranja do sistema |
| Voltar para a versão anterior | `bash /opt/filapro/app/deploy/voltar-versao.sh` |
| Backup do banco | Automático todo dia às 03:30 (Brasília), guardado por 14 dias em `/opt/filapro/backups` |
| Ver se está tudo no ar | `pm2 status` e https://api.filaproleads.com.br/saude |
| Mudar de servidor | Siga o Manual do Desenvolvedor, seção *Mudar de servidor* |
| Proteger a VPS (uma vez) | `bash /opt/filapro/app/deploy/seguranca-vps.sh` — SSH só com chave, fail2ban e atualizações de segurança automáticas |

## Segurança (verificação em duas etapas)

Menu **Segurança**: além da senha, a entrada passa a pedir o **código de 6 dígitos** do app autenticador do seu celular
(Google Authenticator, Microsoft Authenticator ou Authy). **Recomendado ativar.**

![Segurança](prints/s-seguranca.png)

1. Instale o app autenticador → clique em **Ativar** → leia o QR Code com o app.
2. Digite o código do app em **Confirmar e ativar**.
3. Guarde os **10 códigos de recuperação** (fora do celular). Cada um permite entrar uma vez se você perder o celular.

Depois de ativada: senha → tela do código. 5 códigos errados cancelam a tentativa (é preciso digitar a senha de novo). Para desativar
ou gerar novos códigos de recuperação, informe o código atual do app.

**Alertas de segurança** (no WhatsApp de avisos e no celular): a conta do Super Admin bloqueada por senha errada, 3 ou mais contas
bloqueadas na plataforma em 1 hora e entrada do Super Admin por um endereço de internet novo.

**Proteções automáticas:** limite de tentativas por endereço de internet (login, Esqueci minha senha, compra, teste grátis, renovação,
leads de anúncios e chat), o sistema não pode ser aberto dentro de outro site e o navegador só carrega arquivos do próprio sistema.

## Modo manutenção (atualizações)

Durante a atualização os clientes veem **"Sistema em atualização"** e o servidor não aceita nenhuma ação; campanhas, respostas da IA e
leads de anúncios ficam em espera e continuam depois. **Você continua entrando** (no login, clique em "Sou Super Admin — entrar para
conferir") e vê uma faixa laranja com **Liberar o sistema**. Se a atualização der erro, o sistema **fica em manutenção** até você
voltar a versão (`voltar-versao.sh`) ou liberar.

![Faixa de manutenção](prints/s-manutencao.png)

## Perguntas frequentes

**Um cliente pagou mas não recebeu o acesso.**
Confira em **Pedidos** se o pagamento foi confirmado e se o e-mail está certo; use **Reenviar acesso** em Usuários Individuais ou
peça ao Admin da Empresa para usar **Resetar senha**.

**A IA parou de responder em todas as contas.**
Veja em **Inteligência Artificial → Testar**. Normalmente é a chave ou o crédito da conta da Anthropic.

**Os avisos não chegam no WhatsApp.**
Confira se o **Número da plataforma** está conectado e use **Enviar mensagem de teste**.
