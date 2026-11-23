# Novidades — FilaPro Leads

Histórico das versões. A versão atual aparece no rodapé do menu e na Ajuda.

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
