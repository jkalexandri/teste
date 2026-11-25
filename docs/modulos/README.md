# Módulos do FilaPro Leads — quadro de revisão

A plataforma é revisada **por módulo** (combinado com o dono em 25/11/2026). Cada revisão segue o mesmo roteiro:

1. **Mapa** — o que o módulo faz, telas, botões e regras (com as decisões aprovadas), em linguagem simples.
2. **Auditoria** — código comparado com as decisões; falhas classificadas em CRÍTICA / MÉDIA / BAIXA.
3. **Respostas do dono** — perguntas com sugestão.
4. **Correções** — um passo por vez, com prévia, teste e versão.
5. **Ficha do módulo** (`docs/modulos/<nome>.md`) — funcionamento, regras, testes e pendências; base da próxima revisão.

| # | Módulo | O que cobre | Telas | Serviço 24/7 | Testes | Estado |
|---|---|---|---|---|---|---|
| 1 | Acesso e segurança | Login, primeiro acesso, 2 etapas, bloqueio, expiração | login, primeiro-acesso, verificacao, seguranca | — | login-regras, 15, 16b | não revisado |
| 2 | Contas e usuários | Empresas, usuários, individuais, menu por perfil | empresas, usuarios, usuarios-individuais, conta | — | 3, 4c, 5, 18b | não revisado |
| 3 | Planos, venda e pagamento | Planos, compra, Asaas, pedidos, renovação, upgrade, financeiro | planos, pagamento, pedidos, renovar, financeiro | — | 4a, 4b, 4d, 16, 17, 18, 19a–d, 20 | não revisado |
| 4 | WhatsApp (conexão) | QR Code, reconexão, vários números, número da plataforma | whatsapp, numero-plataforma | sessoes, queda, numeros | 6, 10c | **em revisão** |
| 5 | Leads | Cadastro, importação, status, pediu para sair, leads de anúncios | leads, leads-anuncios | — | 7, leads-unit | não revisado |
| 6 | Campanhas e envio | Criação, antibloqueio, fila, disparos, painéis | campanhas, arquivos, regras-envio, disparos | disparos | 8a, 8b, 8c | **em revisão** (decisão #128, passo 1 feito) |
| 7 | IA de mensagens | Gerar mensagem, Empresa \| IA, chaves e modelos, custos | empresa-ia, inteligencia-artificial, despesas-ia | aprender | 9a, 9b | não revisado |
| 8 | Conversas IA (atendimento) | Resposta automática, assumir/devolver, avisos ao usuário | conversas | conversas, avisos, push | 10, 10b | **em revisão** (decisões #127 e #129) |
| 9 | Interessados (site) | Chat do site, teste grátis, vendedor IA | atendimento | interessados | 14b | não revisado |
| 10 | Relatórios e painéis | Dashboard, relatórios, logs, online | dashboard, relatorios, logs, online | — | 11, 12, 13 | não revisado |
| 11 | Comunicação | Avisos, comunicados, suporte, ajuda, app no celular | avisos, comunicados, ajuda | push | 12b, 13, 17b | não revisado |
| 12 | Operação (VPS) | Atualizar, manutenção, backup, voltar versão | — | manutencao, api | 14 | não revisado |

Ordem combinada: **4 e 8** → **6** (passos 2–6 da #128) → **5** → **3** → demais.
Estados: *não revisado → em revisão → revisado em DD/MM/AAAA*.
