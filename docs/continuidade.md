# Continuidade — como seguir o projeto em outra sessão ou outro login do Claude

Tudo o que define o FilaPro Leads está **neste repositório** (GitHub `jkalexandri/teste`). Uma sessão nova do Claude Code,
em qualquer login, continua do mesmo ponto lendo estes arquivos:

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Regras de trabalho do dono (lido automaticamente pelo Claude Code) |
| `docs/decisoes.md` | **Todas as regras de negócio aprovadas** (#1 em diante). Em conflito, vale este |
| `docs/prompt_claude_code_filapro.md` | Especificação principal |
| `docs/login-referencia.md` | Tela de login (regra máxima: idêntica; mudanças só com decisão registrada) |
| `docs/manuais/*.md` | Manuais (usuário, admin, Super Admin, desenvolvedor) e **Novidades** (histórico das versões) |
| `docs/publicacao-vps.md` | Instalação e operação da VPS (produção) |
| `docs/continuidade.md` | Este arquivo: estado atual e pendências |

## Como começar a nova sessão

1. No login novo do Claude, conecte o GitHub com acesso ao repositório `jkalexandri/teste`
   (claude.ai → Configurações → Conectores/GitHub) e abra o Claude Code nesse repositório.
2. Primeira mensagem sugerida:
   > "Leia CLAUDE.md, docs/decisoes.md, docs/continuidade.md e docs/manuais/desenvolvedor.md e continue o projeto
   > FilaPro Leads de onde parou. Responda em português. Comece pela seção 'Em andamento' do continuidade.md."
3. **Segredos não estão no GitHub** (de propósito — o repositório é público). Eles ficam só na VPS
   (`/opt/filapro/app/apps/web/.env.production` e `/opt/filapro/app/apps/worker/.env`) e no seu bloco de notas.
   Nunca cole senhas, chaves ou tokens no chat.

## Como o dono gosta de trabalhar (combinado nas sessões anteriores)

- **Tudo em português do Brasil**, linguagem simples (o dono não é programador). Sem jargão; quando precisar, explique.
- **Perguntas com sugestão:** liste as dúvidas numeradas ou com letras — (a), (b), (c) — e uma **sugestão** em cada uma.
  O dono costuma responder "sugestão" (ou "(a) sugestão (b) …"): **"sugestão" = aceitar o que foi sugerido**.
  Respostas curtas como "ok", "feito", "deu certo" confirmam o passo anterior.
- **Regra nova ou mudança de regra:** registrar em `docs/decisoes.md` (número seguinte) antes ou junto com o código.
- **Passo a passo na VPS:** o dono usa o **terminal do navegador da Hostinger**. Dê comandos prontos para copiar,
  um por bloco, e diga o que deve aparecer no final. Ele responde com **prints** — leia o print e diga o próximo passo.
- **Nunca peça senha, chave ou token no chat** (nem do Asaas, nem da IA). Chaves vão nas telas do sistema (criptografadas).
  Se um print mostrar um segredo, avise e peça para gerar outro.
- **Cada entrega:** testar (teste da etapa + os afetados; regressão completa quando mexer em muita coisa), conferir o login
  com print, subir a versão no `package.json`, escrever em `docs/manuais/novidades.md` e nos manuais, commit e push.
  No final, dizer em poucas linhas o que mudou, o que foi testado e o comando para atualizar a VPS.
- **Commit e envio ao GitHub (autorizado pelo dono em 24/11/2026):** pode fazer commit e enviar ao `main` sempre que os
  testes passarem — sem perguntar. **Mudanças na tela de login só depois da aprovação do dono pelos prints** (antes/depois).
  A permissão fica em `.claude/settings.json` (libera `git add`, `git commit` e `git push origin main`). Na sessão nova, clone o
  repositório **com acesso de escrita** (peça ao dono, se o acesso não vier junto).
- **Login:** só muda com pedido expresso do dono (decisões #100, #107, #108, #114, #116…); comparar prints antes/depois.
- **Corrigir só o que foi pedido.** Se notar outro problema, avise e pergunte antes de mexer.
- **Quando algo do painel de terceiros (Asaas, Hostinger, Resend) não é achado pelo dono:** prefira fazer o sistema resolver
  sozinho (ex.: "Configurar aviso automaticamente" do Asaas) ou um script de diagnóstico (`deploy/diagnostico-asaas.sh`)
  em vez de mandar procurar menus.
- A conversa antiga foi exportada pelo dono (`conversa-filapro.md`, fora do GitHub); se ele anexar, procure só o trecho do assunto.

## Ambiente de teste (para a sessão nova conseguir testar)

Os testes **nunca** rodam na VPS de produção (criam e apagam dados). A sessão nova monta um ambiente de teste próprio:

- PostgreSQL de teste na porta 5433 (socket em `/var/tmp`), banco `filapro`, com `pnpm --filter @filapro/db migrate:deploy`
  e `pnpm --filter @filapro/db seed` **sem** `NEXT_PUBLIC_APP_ENV=production` (cria as contas de demonstração).
- `apps/web/.env.local`: `NEXT_PUBLIC_APP_ENV` (não "production"), `DATABASE_URL`, `WORKER_URL=http://127.0.0.1:4000`,
  `WORKER_TOKEN`, `CHAVE_CRIPTO`, `VAPID_PUBLIC_KEY` — valores **de teste**, gerados na hora (nunca os da produção).
- `apps/worker/.env`: o mesmo banco de teste, o mesmo `WORKER_TOKEN`/`CHAVE_CRIPTO` de teste e as chaves VAPID de teste.
- Site: `pnpm --filter web build` e `ASAAS_URL=http://127.0.0.1:4010 CRON_SECRET=segredo-teste pnpm --filter web start -p 3005` (o ASAAS_URL aponta para o Asaas de mentira dos testes, `apps/web/tests/asaas-falso.cjs`).
- Diagnóstico do Asaas na VPS (sem mostrar chave nem token): `bash /opt/filapro/app/deploy/diagnostico-asaas.sh`.
- Serviço 24/7: `cd apps/worker && set -a && . ./.env && set +a && DISPAROS=desligado npx tsx src/index.ts`.
- Regressão completa: `bash scripts/regressao.sh` (~40 min). Testes de uma etapa: `node apps/web/tests/<etapa>.e2e.cjs /tmp/prints`.

## Como uma mudança chega na produção

1. A sessão do Claude faz a mudança, testa (regressão + print do login) e envia ao GitHub (`main`), subindo a versão no
   `package.json` da raiz e escrevendo em `docs/manuais/novidades.md`.
2. Você, no terminal da VPS: `bash /opt/filapro/app/deploy/atualizar.sh`
   (se parar no meio e for rodado de novo, mantém o ponto de volta da 1ª tentativa — marca `/opt/filapro/atualizacao-em-andamento`, decisão #150)
   (backup, modo manutenção, atualiza, libera e mostra "Atualizado para a versão vX.Y.Z").
3. Se der problema: `bash /opt/filapro/app/deploy/voltar-versao.sh`.

### >>> ONDE PARAMOS (26/11/2026) — ler primeiro ao continuar
- Versão no GitHub: v1.46.4 (v1.46.4 = **S5 do Módulo 1**, #160: bloqueio por e-mail + endereço, proteção da conta, saída pela senha temporária, recuperação limitada, **migração nova `tentativas_login`** (a atualização da VPS aplica sozinha); v1.46.3 = **S4 do Módulo 1**, #159: login/recuperação sem revelar e-mails cadastrados; v1.46.2 = **S2 do Módulo 1**, #158: conta vencida/inativa/bloqueada pausa campanhas e IA no serviço 24/7 e volta sozinha, sessões encerradas, limpeza de sessões; v1.46.1 = **Módulo 1 em revisão**, S1 feita, #157: trocar senha só no primeiro acesso, sessões antigas encerradas, e-mail de aviso; v1.46.0 = suporte encerrado por inatividade, #156; **Módulo 4 🟢 Revisado**, #155: baixas B1–B5; v1.45.3 = M5 do Módulo 4, #154: reconexão aos poucos; v1.45.2 = M4 do Módulo 4, #153: Logs contam as quedas; v1.45.1 = M3 do Módulo 4, #152: mesmo número só em um espaço; v1.45.0 = M2 do Módulo 4, #151: aviso de serviço fora do ar na tela e por e-mail; falta o dono ligar a rotina de 5 min no agendador da VPS — comando em docs/publicacao-vps.md 6.1; v1.44.1 = correção do atualizar.sh, #150 — a atualização para a v1.44.0 parou no build por tipo velho de rota removida; v1.44.0 = semáforo e chaves dos 4 pontos de IA, #149; v1.43.0 = orientações do suporte + testar pergunta, #148; v1.42.1 = quadrinho do selo de vencimento fecha ao clicar fora, #147; fora da revisão do Módulo 4: v1.41.15 = caixa de escrever fixa no Atendimento, #145; **v1.42.0 = IA no suporte dos clientes, #146**, chave geral DESLIGADA — o dono liga em Atendimento → Clientes depois de testar; a atualização da VPS aplica a migração `ia_suporte`). Revisão do **Módulo 4 (WhatsApp)**: feitas C1, C2, A1–A7, M5 antiga e **M1 nova** (decisões #130–#144).
- **A7 FEITA** (#143, fila do número da plataforma) e **M1 FEITA** (#144: falha ao abrir a conexão agenda nova tentativa, mostra "Última falha", nunca apaga o login). Antes de atualizar a VPS: pôr `RESEND_API_KEY` e `EMAIL_FROM` no `apps/worker/.env` (alerta por e-mail da A7); depois `bash /opt/filapro/app/deploy/atualizar.sh` (aplica a migração da fila).
- **NOVA ORDEM DE REVISÃO (decisão #157, por risco):** Passo 0 backup restaurável + **Módulo 1 (em andamento: `docs/modulos/auditoria-modulo-1.md`; S1, S2, S4, S5 e S10 feitas; próximas prévias S6 → S3 → S8; S9 e S7 dependem do dono)** → 12 → 3 → 2 → 8 → 6 → 5 → 7 → 9 → 10 → 11. A ordem "8, 6, 5, 3" da linha abaixo está SUPERADA.
- **Módulo 4 (WhatsApp) revisado em 26/11/2026 (v1.45.4):** todas as falhas da auditoria (`docs/modulos/auditoria-modulo-4.md`) estão feitas. Próximos na ordem combinada: Módulo 8 (Conversas IA), 6 (Campanhas, decisão #128 passos 2–6), 5 (Leads), 3 (Pagamento), demais.
- Na fila: Módulo 6 (Campanhas, decisão #128, passos 2–6: salvamento automático com prévia aprovada, painel "Adicionar leads", Cancelar campanha…); Módulo 9 (decisão #135); Módulo 2 (excluir usuário apaga campanhas; o item "bloqueado/vencido com WhatsApp e IA" foi resolvido na #158); lembrar o "Enviar teste para meu número" na Prévia da campanha.
- Ambiente de teste: o banco de teste para entre as conversas — antes dos testes, subir Postgres (porta 5433, socket /var/tmp), site (porta 3005) e serviço 24/7 (`DISPAROS=desligado`), como na seção "Ambiente de teste" abaixo. `etapa6` precisa da porta 4000 livre; `etapa8b` precisa do serviço com disparos ligados.

## Estado atual (24/11/2026)

- **Versão no GitHub:** veja `"version"` no `package.json` da raiz e o topo de `docs/manuais/novidades.md`.
- **Produção:** VPS Hostinger KVM 1 (Ubuntu 26.04, Campinas) com site, serviço 24/7 e banco `filaproleads`; HTTPS pelo Caddy;
  DNS `@`, `www`, `api` apontando para a VPS; e-mails pelo Resend (domínio verificado).

### Em andamento — pagamento pelo Asaas (decisão #115, regras completas em `docs/decisoes.md`)
Plano em 6 etapas, uma por vez, testando e mostrando ao dono antes da próxima:
- **A — ligar o Asaas: FEITA e funcionando na VPS** (v1.34.2–1.34.4). Chave do **sandbox** conectada em Pagamento → Asaas;
  aviso (webhook) cadastrado pelo botão "Configurar aviso automaticamente"; aviso PAYMENT_CREATED chegou.
- **B — o cliente escolhe PIX, cartão ou boleto: FEITA (v1.35.0)**, enviada ao GitHub. Falta o dono atualizar a VPS, definir os
  juros em Pagamento → Parcelamento no cartão e testar uma compra no sandbox. A confirmação ainda é manual em Pedidos.
- **C — confirmação automática: FEITA (v1.36.0)**, regras na decisão #117. O aviso é guardado (`AvisoAsaas`), respondido com 200
  e processado em `lib/asaas-avisos.ts`: confirma o pedido, lança a taxa ("Taxas do Asaas"), estorno inativa a empresa, contestação e
  pedido cancelado só avisam. Teste `etapa19c-asaas-confirmacao` (28 verificações). Falta o dono atualizar a VPS e testar no sandbox.
- **D — cobrança automática no cartão: FEITA (v1.39.0)**, regras na decisão #124. Assinatura no Asaas (`lib/assinatura.ts`):
  1º pagamento liga na conta (`Empresa.asaasAssinaturaId`), cada período gera e confirma um pedido "Cartão (automática)", mudanças
  sincronizam valor/data, dono e Super Admin desligam. Teste `etapa19d-asaas-automatica` (30 verificações).
- **Upgrade de conta: FEITO (v1.40.0)**, decisão #125. Botão "Fazer upgrade" (selo do topo e aviso de vencimento) só para o dono;
  `lib/upgrade.ts` + `/api/upgrade` + `RenovarCliente` no modo "upgrade" (popup `PopupUpgrade`); regras de dias/disparos em
  `aplicarRenovacao` (pedido com `upgrade`). Teste `etapa20-upgrade` (17). **Falta a 2ª parte: Individual → Empresarial** (prévia própria).
- **E — cartão recusado (próxima; antes, o dono testa as etapas C e D no sandbox):** 3 dias com envio reduzido (Empresarial 100/dia para a empresa toda; Individual 20/dia); depois,
  bloqueia campanhas e respostas (IA e manuais), mas o cliente continua entrando para ver e pagar.
- **F — testes no sandbox real com o dono, manuais e versão final.**

Testes do Asaas usam o **Asaas de mentira** (`apps/web/tests/asaas-falso.cjs`, site de teste com `ASAAS_URL=http://127.0.0.1:4010`):
`etapa19a-asaas-config`, `etapa19b-asaas-pagamento` e `etapa19c-asaas-confirmacao`.

### Atendimento da IA no WhatsApp — FEITO (v1.41.0), decisão #127
Resposta pendente no banco + varredura, 8–15 s (teto 30 s), 3 tentativas e texto reserva, "não sei" não pausa, saída estruturada.
Falta o dono atualizar a VPS e testar com um lead. Melhoria futura possível: responder no mesmo endereço (jid/LID) de onde veio a mensagem.

### Revisão por módulos — decisão #129 (quadro em `docs/modulos/README.md`)
- Ordem: módulos 4 (WhatsApp) e 8 (Conversas IA) → 6 (Campanhas) → 5 (Leads) → 3 (Pagamento) → demais.
- Módulo 8, passo 1 FEITO (v1.41.2): resposta no endereço LID — **confirmado pelo dono na VPS em 25/11/2026** (mensagem chegou no lead 7836).
- Módulo 8: rolagem da tela Conversas IA (v1.41.6, decisão #136). Botão do suporte resolvido na v1.41.7 (decisão #137).
- Módulo 4: auditoria feita (decisão #130, 22 falhas). C1 FEITA (v1.41.3: protegerTela em todas as telas + teste etapa21).
  Encapsulamento (decisão #132): portas únicas + teste vigia, módulo a módulo. Item 5 (API do 24/7 só por dentro da VPS) logo após C2/A1; item 2 (dado por dono) começa no Módulo 5.
  C2 e A1 FEITAS (v1.41.4, decisão #133: serviço único + porta por número).
  Item 5 do encapsulamento FEITO (v1.41.5, decisão #134: Caddy libera só /saude).
  A3 FEITA (v1.41.8, decisão #138). Para o Módulo 2: bloqueado/vencido continua com WhatsApp e IA (decidir); excluir usuário apaga as campanhas dele.
  A2 FEITA (v1.41.9, decisão #139).
  A4 FEITA (v1.41.10, decisão #140). A5 FEITA (v1.41.11, decisão #141).
  Próximas, cada uma com prévia: A5, A6 (avisar com 3 min / na volta / "com problema" após 2 h), A7;
  Módulo 9 (quando chegar): decisão #135 — mensagens recebidas no número da plataforma (conhecido → conversa certa + aviso; desconhecido → só registrar, sem responder). depois A2, A4–A7; depois médias/baixas. A6: avisar com 3 min, avisar na volta, "com problema" após 2 h.
- Quadro "Módulos e revisões" na Ajuda (só Super Admin, decisão #131) FEITO (v1.41.3). **Em toda entrega:** atualizar `docs/modulos/README.md` (último ajuste, histórico com data e hora; módulo "Revisado" que for ajustado sem revisão completa vira "Sem revisão").

### Criação de campanha — decisão #128 (em andamento, um passo por vez com prévia)
- Passo 1 FEITO (v1.41.1): trava contra disparo duplicado + ir para Em andamento.
- Próximos: 2 salvamento automático · 3 painel "Adicionar leads" sem sair da tela · 4 Cancelar campanha · 5 IA com confirmação e validação no Avançar · 6 menores.
- **Lembrar o dono** (resposta (e)): oferecer "Enviar teste para meu número" quando a Prévia|envio for revisada.

### Pendências da publicação (`docs/publicacao-vps.md`)
- Parte 6.1 — backup diário e rotinas (crontab).
- Parte 6.2 — proteção da VPS (`deploy/seguranca-vps.sh`, depois de cadastrar a chave SSH).
- Parte 7 — primeiro acesso do Super Admin (trocar a senha temporária, ativar a verificação em duas etapas, dados legais,
  chave da IA, pagamento, planos, número da plataforma, avisos).
- Parte 8 — app no celular.
- O banco de teste antigo `filapro` na VPS pode ser apagado depois que tudo estiver funcionando.

### Pendências que dependem do dono
- Cloudflare na frente do domínio e proteção contra robôs (decisão #105, itens 5 e 6).
- Backup diário fora da VPS (decisão #105, item 7): escolher onde guardar.

### Próximas funcionalidades combinadas
- Integração direta com Facebook/Instagram Lead Ads (hoje entra pelo Make/Zapier).
- Fase 2: cobrança automática — em andamento pelo Asaas (acima).
