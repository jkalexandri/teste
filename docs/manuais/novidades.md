# Novidades — FilaPro Leads

Histórico das versões. A versão atual aparece no rodapé do menu e na Ajuda.

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
