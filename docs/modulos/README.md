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
| 1 | Acesso e segurança | 🟢 Revisado | 27/11/2026 11:00 | v1.47.0 | v1.47.0 — 27/11/2026 11:00 (revisão concluída: S1 a S10; falta só a limpeza S9 Fase 3) |
| 2 | Contas e usuários | 🔴 Sem revisão | nunca | — | v1.44.0 — 26/11/2026 18:30 (semáforo e chaves da IA em 4 pontos) |
| 3 | Planos, venda e pagamento | 🔴 Sem revisão | nunca | — | v1.40.0 — 25/11/2026 01:06 (upgrade de conta) |
| 4 | WhatsApp (conexão) | 🟢 Revisado | 26/11/2026 23:59 | v1.45.4 | v1.45.4 — 26/11/2026 23:59 (revisão concluída: baixas B1–B5) |
| 5 | Leads | 🔴 Sem revisão | nunca | — | v1.41.0 — 25/11/2026 02:31 (lead achado com ou sem o 9º dígito) |
| 6 | Campanhas e envio | 🟡 Em revisão | auditoria em 25/11/2026 (hora não registrada) | v1.41.0 | v1.41.1 — 25/11/2026 12:02 (trava contra disparo duplicado) |
| 7 | IA de mensagens | 🔴 Sem revisão | nunca | — | v1.38.0 — 24/11/2026 18:52 (Texto sugestão no Como qualificar) |
| 8 | Conversas IA (atendimento) | 🟡 Em revisão | iniciada em 25/11/2026 13:31 (auditoria a fazer) | v1.41.2 | v1.41.6 — 25/11/2026 19:08 (rolagem da tela: cabeçalho e caixa de escrever fixos) |
| 9 | Interessados (site) | 🔴 Sem revisão | nunca | — | anterior a 24/11/2026 (ver Novidades) |
| 10 | Relatórios e painéis | 🔴 Sem revisão | nunca | — | v1.40.1 — 25/11/2026 01:13 (selos do Dashboard) |
| 11 | Comunicação | 🔴 Sem revisão | nunca | — | v1.46.0 — 27/11/2026 00:30 (suporte encerrado por inatividade do cliente) |
| 12 | Operação (VPS) | 🟡 Em revisão | levantamento iniciado 27/11/2026 | — | v1.48.3 — 27/11/2026 (SSH só com chave) |

Ordem combinada: **4 e 8** → **6** (passos 2–6 da decisão #128) → **5** → **3** → demais.

## O que cada módulo cobre

| # | Módulo | O que cobre | Telas | Serviço 24/7 | Testes |
|---|---|---|---|---|---|
| 1 | Acesso e segurança | Login, primeiro acesso, 2 etapas, bloqueio, expiração, trava das telas | Login, Primeiro acesso, Verificação, Segurança | — | login-regras, 15, 16b, 21, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36 |
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
| v1.48.3 | 27/11/2026 | 12 Operação (VPS) | SSH só com chave: cadastro seguro da chave pública, travar com prova de login real e desfazer automático, diagnóstico da configuração efetiva (#174) | 1 Acesso e segurança | não |
| v1.48.2 | 27/11/2026 | 12 Operação (VPS) | Cópia do backup fora da VPS no Backblaze B2: criptografada na VPS, imutável, conferida por hash, com aviso no vigia, `--baixar` e roteiro de desastre (#173) | 1 Acesso e segurança (senhas de criptografia) | não |
| v1.48.1 | 27/11/2026 | 12 Operação (VPS) | Rotação de logs com o logrotate do sistema (logs do FilaPro e do pm2, journal limitado), permissão 600 e conferência no diagnóstico (#172) | — | não |
| v1.48.0 | 27/11/2026 | 12 Operação (VPS) | Avisos automáticos por e-mail (backup parado, teste de restauração, disco, memória, reinício pendente, relógio, certificado) via `vigia-vps.sh` a cada 15 min, e monitor externo (`/api/monitor?t=TOKEN`); reinício controlado documentado (#171) | 1 Acesso e segurança (e-mails aos Super Admins, `AlertaServico`) | não |
| v1.47.6 | 27/11/2026 | 12 Operação (VPS) | Restauração segura (`restaurar-backup.sh`: restaura num banco temporário, confere, pede RESTAURAR, guarda o banco antigo e devolve se a migração falhar) e teste de restauração semanal; `voltar-versao.sh` sem `dropdb` (#170) | 1 Acesso e segurança (backup dos dados) | não |
| v1.47.3 | 27/11/2026 13:00 | 12 Operação (VPS) | Backup completo em camadas: banco + arquivos enviados + chaves criptografadas; dumps do banco a cada 6 h; retenção 14 diários, 8 semanais, 6 mensais; arquivos 600 e conferência de cada peça; diagnóstico e rotinas ajustados (#169) | 1 Acesso e segurança (chaves), 4 WhatsApp (login guardado no banco) | não |
| v1.47.1 | 27/11/2026 12:00 | 12 Operação (VPS) | `deploy/diagnostico-vps.sh`: diagnóstico somente leitura da VPS (sistema, relógio, serviços, backup, arquivos, .env só os nomes, banco, aplicação, logs) (#168) | — | não |
| v1.47.0 | 27/11/2026 11:00 | 1 Acesso e segurança | **Revisão concluída (S1 a S10, decisões #157 a #166):** 14 testes de ponta a ponta e 13 unitários passando; pendente só a limpeza da senha temporária (S9 Fase 3, 8 dias ou mais depois da v1.46.9) (#167) | — | não |
| v1.47.0 | 27/11/2026 10:00 | 1 Acesso e segurança | S7: verificação em duas etapas opcional para Admin da Empresa, Individual e Usuário (menu Segurança, convite ao dono); redefinir a verificação de quem perdeu o celular (Admin/Super Admin); aviso por e-mail no congelamento (#166) | 2 Contas e usuários (menu e telas de gestão) | não |
| v1.46.9 | 27/11/2026 09:00 | 1 Acesso e segurança | S9 Fase 2: conta nova, usuário criado e Resetar/Reenviar acesso por link de uso único (7 dias); redefinir invalida a senha atual e encerra sessões; login de conta sem senha com o mesmo tempo (#165) | 2 Contas e usuários, 3 Planos (compra e teste grátis) | não |
| v1.46.8 | 27/11/2026 08:00 | 1 Acesso e segurança | S9 Fase 1: "Esqueci minha senha" envia link de uso único (30 min, hash no banco, código no fragmento); definir a senha encerra sessões e desfaz bloqueios; tela /definir-senha; 3 frases do painel de recuperação do login (#164) | 2 Contas e usuários (primeiro acesso) | não |
| v1.46.7 | 27/11/2026 07:00 | 1 Acesso e segurança | S8: endereço de internet = última entrada do X-Forwarded-For (Caddy define); IPv6 pelo bloco /64; teto de 20 mil chaves em memória; Caddyfile com header_up explícito (#163) | 12 Operação (VPS: Caddyfile) | não |
| v1.46.6 | 27/11/2026 06:00 | 1 Acesso e segurança | S3: rotas de arquivos, suporte, comunicados, manual e rotas do Super Admin conferem sessão, primeiro acesso e situação da conta (`sessaoDaRota`); cobrança automática recusa primeiro acesso e bloqueado (#162) | 3 Planos (cobrança automática), 11 Comunicação | não |
| v1.46.5 | 27/11/2026 05:00 | 1 Acesso e segurança | S6: código do app autenticador vale uma vez (atômico); código de recuperação de uso único mesmo simultâneo; 10 códigos errados congelam o código de 6 dígitos (recuperação segue valendo) com alerta ao Super Admin (#161) | — | não |
| v1.46.4 | 27/11/2026 04:00 | 1 Acesso e segurança | S5: bloqueio por e-mail + endereço (só quem errou); proteção da conta com 30 erros de vários endereços; senha temporária do e-mail sempre entra; recuperação 3/h e 10 min; e-mail de aviso ao dono (#160) | 2 Contas e usuários (primeiro acesso) | não |
| v1.46.3 | 27/11/2026 03:00 | 1 Acesso e segurança | S4: login com o mesmo tempo e as mesmas respostas para e-mail com ou sem conta; bloqueio por tentativas igual para qualquer e-mail; recuperação responde na hora; limite de 5/h nas respostas "e-mail já existe" da compra (#159) | 3 Planos (compra) | não |
| v1.46.2 | 27/11/2026 02:10 | 1 Acesso e segurança | S2: conta vencida, inativa ou bloqueada pausa campanhas e IA no serviço 24/7 (volta sozinha); sem avisos; sessões e notificações encerradas ao inativar/bloquear; limpeza de sessões vencidas (#158) | 2 Contas e usuários, 6 Campanhas e envio, 8 Conversas IA, 3 Planos (estorno e renovação) | não |
| v1.46.1 | 27/11/2026 01:15 | 1 Acesso e segurança | S1: trocar senha só no primeiro acesso; senha nova diferente da temporária; sessões antigas encerradas e token novo; e-mail de aviso e Logs; sessão de primeiro acesso de 30 min (#157) | 2 Contas e usuários (primeiro acesso) | não |
| v1.46.0 | 27/11/2026 00:30 | 11 Comunicação | Suporte: atendimento encerrado após 10 min de inatividade do cliente (selo "Encerrada", reabre ao escrever; nunca encerra com o cliente esperando o atendente) (#156) | 9 Interessados (Atendimento) | não |
| v1.45.4 | 26/11/2026 23:59 | 4 WhatsApp (conexão) | Revisão concluída (B1–B5): tela só consulta com a aba visível; "Conectado desde" mantém a data e mostra "Última reconexão"; chaves do WhatsApp medidas por semana; guardar o login com 3 tentativas; intervalo mínimo no Conectar/Tentar agora (#155) | 10 Relatórios e painéis (Logs) | **sim** |
| v1.45.3 | 26/11/2026 23:00 | 4 WhatsApp (conexão) | Porteiro das aberturas automáticas (2 por vez, 1,5 s entre elas), ordem plataforma → campanha em andamento → demais, variação de ±25% no intervalo e serviço que sobe na hora (M5) | 12 Operação (VPS) | não |
| v1.45.2 | 26/11/2026 22:00 | 4 WhatsApp (conexão) | Logs: uma linha por queda na volta (hora, motivo com código, tempo fora, tentativas), linhas extras aos 3 min e 2 h, e "reconectado depois do reinício do serviço" separado (M4) | 10 Relatórios e painéis (Logs) | não |
| v1.45.1 | 26/11/2026 21:00 | 4 WhatsApp (conexão) | Número já conectado em outro espaço: a conexão nova é recusada (a antiga segue); números já repetidos só nos Logs do Super Admin (M3) | 2 Contas e usuários, 10 Relatórios e painéis (Logs) | não |
| v1.45.0 | 26/11/2026 20:00 | 4 WhatsApp (conexão) | Serviço 24/7 fora do ar: selo "Serviço fora do ar" na tela (botões e QR desativados) e e-mail ao Super Admin (3 min sem sinal e na volta), vigia a cada 5 min na VPS (M2) | 12 Operação (VPS) | não |
| v1.44.1 | 26/11/2026 19:10 | 12 Operação (VPS) | `atualizar.sh` e `voltar-versao.sh`: apagam os tipos velhos antes do build; tentativa repetida mantém o ponto de volta e o backup da 1ª (#150) | — | não |
| v1.44.0 | 26/11/2026 18:30 | 7 IA de mensagens | Semáforo (verde/amarelo/vermelho) e chaves liga/desliga dos 4 pontos de IA (Leads, Campanhas, Suporte, Visitante); avisos de mudança; religar atende quem esperou (#149) | 8 Conversas IA, 9 Interessados, 10 Relatórios e painéis (Dashboard), 11 Comunicação | não |
| v1.43.0 | 26/11/2026 17:00 | 11 Comunicação | Orientações do suporte (texto do Super Admin lido só pela IA do suporte) e caixa "Testar uma pergunta" na tela Empresa \| IA (#148) | 7 IA de mensagens | não |
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
