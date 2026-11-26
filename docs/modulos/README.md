# Módulos e revisões

A plataforma é revisada **por módulo** (decisões #129 e #131). Este quadro aparece também no sistema, em
**Ajuda → Módulos e revisões** (só para o Super Admin), e é atualizado em toda entrega.

**Status:**
- 🟢 **Revisado** — revisão completa concluída (data, hora e versão) e nenhum ajuste depois dela.
- 🟡 **Em revisão** — auditoria feita ou iniciada, correções em andamento.
- 🔴 **Sem revisão** — nunca teve revisão completa, **ou** foi ajustado depois da última revisão completa
  (veja a coluna "Último ajuste").

## Quadro

| # | Módulo | Status | Revisão (data e hora) | Versão da revisão | Último ajuste |
|---|---|---|---|---|---|
| 1 | Acesso e segurança | 🔴 Sem revisão | nunca | — | v1.41.3 — 25/11/2026 15:50 (trava de cada tela) |
| 2 | Contas e usuários | 🔴 Sem revisão | nunca | — | v1.42.1 — 26/11/2026 16:00 (quadrinho do selo de vencimento fecha ao clicar fora) |
| 3 | Planos, venda e pagamento | 🔴 Sem revisão | nunca | — | v1.40.0 — 25/11/2026 01:06 (upgrade de conta) |
| 4 | WhatsApp (conexão) | 🟡 Em revisão | auditoria em 25/11/2026 14:52 | v1.41.2 | v1.41.14 — 26/11/2026 14:20 (reabertura que falha tenta de novo: M1) |
| 5 | Leads | 🔴 Sem revisão | nunca | — | v1.41.0 — 25/11/2026 02:31 (lead achado com ou sem o 9º dígito) |
| 6 | Campanhas e envio | 🟡 Em revisão | auditoria em 25/11/2026 (hora não registrada) | v1.41.0 | v1.41.1 — 25/11/2026 12:02 (trava contra disparo duplicado) |
| 7 | IA de mensagens | 🔴 Sem revisão | nunca | — | v1.38.0 — 24/11/2026 18:52 (Texto sugestão no Como qualificar) |
| 8 | Conversas IA (atendimento) | 🟡 Em revisão | iniciada em 25/11/2026 13:31 (auditoria a fazer) | v1.41.2 | v1.41.6 — 25/11/2026 19:08 (rolagem da tela: cabeçalho e caixa de escrever fixos) |
| 9 | Interessados (site) | 🔴 Sem revisão | nunca | — | anterior a 24/11/2026 (ver Novidades) |
| 10 | Relatórios e painéis | 🔴 Sem revisão | nunca | — | v1.40.1 — 25/11/2026 01:13 (selos do Dashboard) |
| 11 | Comunicação | 🔴 Sem revisão | nunca | — | v1.42.0 — 26/11/2026 15:30 (IA no suporte dos clientes) |
| 12 | Operação (VPS) | 🔴 Sem revisão | nunca | — | v1.41.5 — 25/11/2026 18:28 (Caddy: só /saude pela internet) |

Ordem combinada: **4 e 8** → **6** (passos 2–6 da decisão #128) → **5** → **3** → demais.

## O que cada módulo cobre

| # | Módulo | O que cobre | Telas | Serviço 24/7 | Testes |
|---|---|---|---|---|---|
| 1 | Acesso e segurança | Login, primeiro acesso, 2 etapas, bloqueio, expiração, trava das telas | Login, Primeiro acesso, Verificação, Segurança | — | login-regras, 15, 16b, 21 |
| 2 | Contas e usuários | Empresas, usuários, individuais, menu por perfil | Empresas, Usuários, Usuários Individuais, Conta | — | 3, 4c, 5, 18b |
| 3 | Planos, venda e pagamento | Planos, compra, Asaas, pedidos, renovação, upgrade, financeiro | Planos, Pagamento, Pedidos, Renovar, Financeiro | — | 4a, 4b, 4d, 16, 17, 18, 19a–d, 20 |
| 4 | WhatsApp (conexão) | QR Code, reconexão, vários números, número da plataforma | WhatsApp, Número da plataforma | sessões, queda, números | 6, 10c |
| 5 | Leads | Cadastro, importação, status, pediu para sair, leads de anúncios | Leads, Leads de anúncios | — | 7, leads-unit |
| 6 | Campanhas e envio | Criação, antibloqueio, fila, disparos, painéis | Campanhas, Arquivos, Regras de envio, Disparos | motor de disparos | 8a, 8b, 8c |
| 7 | IA de mensagens | Gerar mensagem, Empresa \| IA, chaves e modelos, custos | Empresa \| IA, Inteligência Artificial, Despesas IA | aprendizado | 9a, 9b |
| 8 | Conversas IA (atendimento) | Resposta automática, assumir/devolver, avisos ao usuário | Conversas IA | conversas, avisos, notificações | 10, 10b |
| 9 | Interessados (site) | Chat do site, teste grátis, vendedor IA | Atendimento | interessados | 14b |
| 10 | Relatórios e painéis | Dashboard, relatórios, logs, online | Dashboard, Relatórios, Logs, Online | — | 11, 12, 13 |
| 11 | Comunicação | Avisos, comunicados, suporte, ajuda, app no celular | Avisos, Comunicados, Ajuda | notificações | 12b, 13, 17b |
| 12 | Operação (VPS) | Atualizar, manutenção, backup, voltar versão | — (terminal da VPS) | manutenção | 14 |

## Histórico de ajustes

Cada ajuste fica no módulo do **comportamento que muda para o usuário**; "Toca também" lista os outros módulos mexidos.

| Versão | Data e hora | Módulo | O que mudou | Toca também | Revisão completa? |
|---|---|---|---|---|---|
| v1.42.1 | 26/11/2026 16:00 | 2 Contas e usuários | Quadrinho do selo de vencimento fecha ao clicar fora ou com Esc (#147) | 3 Planos (upgrade) | não |
| v1.42.0 | 26/11/2026 15:30 | 11 Comunicação | IA responde o suporte dos clientes (chave geral desligada por padrão); passa para o atendente em assunto sensível, arquivo, pedido ou dúvida; limite de 20/dia (#146) | 7 IA de mensagens, 9 Interessados (Atendimento) | não |
| v1.41.15 | 26/11/2026 14:50 | 11 Comunicação | Atendimento (suporte): cabeçalho da conversa e caixa de escrever fixos; só as mensagens rolam; abre na mais recente | 9 Interessados (aba do Atendimento) | não |
| v1.41.14 | 26/11/2026 14:20 | 4 WhatsApp (conexão) | Falha ao abrir a conexão agenda nova tentativa, mostra o motivo e nunca apaga o login; Logs só com a 1ª falha e a recuperação (M1) | — | não |
| v1.41.13 | 26/11/2026 05:40 | 4 WhatsApp (conexão) | Número da plataforma: fila com cadência 5–10 s, limite de 200/dia, prioridade e validade de 6 h; alerta de queda ao Super Admin por celular e e-mail (A7) | 3 Planos (renovação), 9 Interessados, 11 Comunicação, 1 Acesso (alertas de segurança) | não |
| v1.41.12 | 26/11/2026 04:30 | 4 WhatsApp (conexão) | Aviso de número caído: 3 min fora, na volta, 2 h (selo "Com problema") e desconexão de vez com o motivo; cópia ao Admin da Empresa (A6) | 9 Avisos | não |
| v1.41.11 | 26/11/2026 01:03 | 4 WhatsApp (conexão) | Chip diferente no mesmo espaço recomeça o aquecimento; o mesmo chip mantém (A5) | 6 Campanhas e envio | não |
| v1.41.10 | 26/11/2026 00:53 | 4 WhatsApp (conexão) | Número que saiu do plano: o serviço não religa nem conecta; sai do WhatsApp e mantém as conversas (A4) | 3 Planos (renovação) | não |
| v1.41.9 | 25/11/2026 23:30 | 4 WhatsApp (conexão) | Estado "Reconectando…": quando caiu, tentativa, próxima; "Tentar agora" sem apagar o login (A2) | — | não |
| v1.41.8 | 25/11/2026 23:13 | 4 WhatsApp (conexão) | Usuário excluído: WhatsApp desconectado; o serviço nunca recria nem religa número sem dono (A3) | 2 Contas e usuários | não |
| v1.41.7 | 25/11/2026 19:27 | 11 Comunicação | Ícone do atendente (suporte) ao lado do Sair, que ficou menor | 2 Contas e usuários (menu), 8 Conversas IA | não |
| v1.41.6 | 25/11/2026 19:08 | 8 Conversas IA | Tela: só a lista e as mensagens rolam; busca, cabeçalho da conversa e caixa de escrever fixos | — | não |
| v1.41.5 | 25/11/2026 18:28 | 4 WhatsApp (conexão) | API do serviço 24/7 só por dentro da VPS; pela internet só /saude (M5) | 12 Operação (VPS) | não |
| v1.41.4 | 25/11/2026 18:22 | 4 WhatsApp (conexão) | Um serviço 24/7 por vez; "aberto em outro lugar" mantém o login; porta única por número (C2 e A1) | 12 Operação (VPS) | não |
| v1.41.3 | 25/11/2026 15:50 | 11 Comunicação | Ajuda → Módulos e revisões (só Super Admin) | — | não |
| v1.41.3 | 25/11/2026 15:50 | 1 Acesso e segurança | Cada tela confere quem pode abrir (falha C1 da auditoria do Módulo 4) | todos (trava em todas as telas); 4 em especial | não |
| v1.41.2 | 25/11/2026 13:31 | 8 Conversas IA | Resposta no endereço de onde o lead escreveu (contatos LID) | 4 WhatsApp | não |
| v1.41.1 | 25/11/2026 12:02 | 6 Campanhas e envio | A mesma campanha nunca sai duas vezes; abre Em andamento depois de iniciar | — | não |
| v1.41.0 | 25/11/2026 02:31 | 8 Conversas IA | IA responde sempre e mais rápido; tentativas, texto reserva, "não sei" não pausa | 4 WhatsApp, 5 Leads | não |

## Como cada módulo é revisado

1. **Mapa** — o que o módulo faz, telas, botões e regras (com as decisões aprovadas), em linguagem simples.
2. **Auditoria** — código comparado com as decisões; falhas classificadas em CRÍTICA / ALTA / MÉDIA / BAIXA.
3. **Respostas do dono** — perguntas com sugestão.
4. **Correções** — um passo por vez, com prévia, teste e versão.
5. **Ficha do módulo** (`docs/modulos/<nome>.md`) — funcionamento, regras, testes e pendências; base da próxima revisão.
6. **Encerramento** — revisão completa concluída: status 🟢 Revisado com data, hora e versão.
