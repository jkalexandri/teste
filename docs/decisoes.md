# Decisões do projeto FilaPro Leads

| # | Decisão | Data |
|---|---|---|
| 1 | **Sem API oficial da Meta.** A API de WhatsApp é própria, criada neste projeto, com conexão por QR Code. | 20/11/2026 |
| 2 | **Feixes de luz do login:** cada um dos 5 feixes percorre o circuito em **4,2 s** (duração fixa), em trilha e direção aleatórias, em loop infinito. | 20/11/2026 |
| 3 | **Contas demo só para teste.** Criadas por script (seed) apenas nos ambientes local e de testes. Em produção não existem. Os botões "Entrar como Super Admin / Admin da Empresa / Usuário" do login aparecem **só no ambiente de testes**; em produção o card termina no botão "Entrar". | 20/11/2026 |
| 4 | **Envio 24/7:** o app (telas) roda na Vercel; a API, a fila de envio e as sessões do WhatsApp rodam num servidor sempre ligado em `api.filaproleads.com.br`. Provedor: **VPS** (decidido em 20/11/2026). | 20/11/2026 |

## Arquitetura de hospedagem

```
Navegador ──> filaproleads.com.br (Vercel)          Next.js: login e telas
                    │
                    ▼
            api.filaproleads.com.br (servidor 24/7)
              ├─ API (TypeScript)               recebe pedidos do app
              ├─ Worker de envio                 fila + regras do Antibloqueio
              ├─ Sessões WhatsApp (QR Code)      uma conexão por usuário, sempre aberta
              ├─ PostgreSQL                      dados + sessões salvas (criptografadas)
              └─ Redis                           fila de envio
```

- O app na Vercel só cria e agenda campanhas. Quem envia é o worker no servidor 24/7.
- Fechar a página, sair do sistema ou desligar o computador não interrompe os envios.
- Se o servidor reiniciar, as sessões do WhatsApp reconectam sozinhas (sem novo QR Code) e as campanhas continuam de onde pararam.

### Opções de servidor 24/7
| Opção | Prós | Contras | Custo inicial aprox. |
|---|---|---|---|
| **Railway** (recomendado para começar) | Deploy direto do GitHub, Postgres e Redis em 1 clique, sem administrar servidor | Custo cresce com o uso | US$ 10–25/mês |
| **VPS** (Hetzner, Contabo, Hostinger) | Mais barato em escala, controle total | Exige administrar o servidor (Docker, atualizações, backup) | R$ 40–150/mês |

Cada sessão de WhatsApp conectada usa memória contínua; com muitos clientes, o servidor precisa crescer junto.

## Regras de negócio (20/11/2026)
| # | Decisão |
|---|---|
| 5 | **Cadastro, expiração e papéis seguem o prompt FilaPro:** sem cadastro público (Super Admin cria contas), expiração a cada 31 dias ou prazo do admin, papéis Super Admin / Admin da Empresa (não envia) / Usuário. |
| 6 | **Janela de horário de envio mantida** (padrão 8h–20h, ajustável pelo Admin da Empresa ou pelo usuário Individual). |
| 7 | **Login — card:** removidos o texto "Escolha o módulo. Individual e Empresarial não se comunicam..." e a linha "Módulo atual: ...". Esse espaço não deve ser usado para exibir informação. |
| 8 | **Banco de dados:** PostgreSQL pela **Vercel** (integração Neon) por enquanto. Pode migrar depois para Railway/VPS sem mudar código (só trocar `DATABASE_URL` e copiar os dados). Em desenvolvimento, Postgres local. |
| 9 | **E-mail transacional:** **Resend**, com o domínio filaproleads.com.br (senhas temporárias e recuperação de senha). |
| 10 | **Lembrar de mim:** guarda apenas o **e-mail** preenchido. **Não** mantém o usuário logado. A senha **não** é guardada pelo sistema — o usuário pode salvá-la no gerenciador de senhas do navegador, se preferir. A sessão dura **até fechar o navegador**. |
| 11 | **Abas de módulo no login:** usuário que entrar pela aba errada é bloqueado com "Este acesso pertence ao módulo X". **Super Admin entra por qualquer aba.** |
| 12 | **Primeiro acesso:** quem tem senha temporária é obrigado a criar uma senha nova antes de entrar. |
| 13 | **Expiração por pacote:** a empresa compra um pacote com X usuários e um prazo único; **todos os usuários da empresa expiram juntos**. Acesso expirado: "Acesso expirado. Fale com o administrador." e não entra. |
| 14 | **Senha errada:** após 5 tentativas erradas, bloqueio de 15 minutos. |
| 15 | **Super Admin:** criado automaticamente na instalação, com o e-mail definido na variável privada `SUPERADMIN_EMAIL` (não fica no código, o repositório é público). Recebe senha temporária e troca no primeiro acesso. |
| 16 | **Textos do login em produção:** "Senha mínima..." e "Sem cadastro público..." **não aparecem** no site real; o card termina no botão "Entrar". |
| 17 | **Menu por perfil** (grupos na ordem Principal, Vendas, Administrativo, Configurações, Sistema; grupo vazio fica oculto): **Usuário** — Principal: Dashboard · Vendas: Campanhas, Leads, Conversas IA, Arquivos · Configurações: Empresa \| IA (só leitura no Empresarial), WhatsApp. **Admin da Empresa** — Principal: Dashboard · Vendas: Todos os disparos · Administrativo: Usuários, Empresas (só a própria) · Configurações: Empresa \| IA, Configurações · Sistema: Logs. **Super Admin** — Principal: Dashboard · Vendas: Todos os disparos, Disparos por usuários, Campanhas, Leads · Administrativo: Empresas, Usuários Individuais e o subgrupo **Relatório** (Empresarial, Individual, Leads Empresarial, Lead Individual). |
| 18 | **Tela WhatsApp do usuário:** conexão por QR Code usando a **API própria** deste projeto (sem API oficial): QR Code, status da conexão e desconectar. |
| 19 | **Detalhes de segurança aprovados:** sessão expira no máximo em 24 h no servidor (mesmo com o navegador aberto); senha temporária de recuperação vale 24 h (a do Super Admin na instalação, 7 dias); a senha atual continua valendo após um pedido de recuperação até a pessoa usar a temporária; empresa inativa exibe "Empresa inativa. Fale com o administrador." |
| 20 | **Ordem das etapas aprovada:** 3 layout/menu/dashboards · 4 Super Admin (empresas, pacotes, individuais) · 5 usuários e expiração · 6 API própria do WhatsApp + QR Code (VPS) · 7 leads · 8 campanhas/antibloqueio/fila · 9 Empresa \| IA · 10 Conversas IA · 11 relatórios · 12 configurações, logs e deploy. |
| 21 | **Aviso de expiração** (popup de 10 s e chip no topo, a partir de 10 dias antes) vale também para o **Admin da Empresa**. |
| 22 | **Pacotes:** Free (teste grátis), Individual, Básico (3 usuários), Padrão (10), Premium (30), Elite (50) e Personalizado (quantidade definida pelo Super Admin). |
| 23 | **O Admin da Empresa não conta no limite do pacote** (ele só gerencia, não usa os recursos). O limite vale só para usuários. |
| 24 | **Diminuir o pacote:** usuários existentes continuam; o admin só pode criar usuários até o limite do pacote. |
| 25 | **Menu "Planos" na tela de login:** abre um popup com as opções de compra dos pacotes (modelo visual: `docs/referencias/modelo-popup-planos.png` — cartões lado a lado com selo de desconto, nome, descrição, preço antigo riscado, preço /mês, botão "Escolher plano", condições, destaque promocional e lista de recursos; um cartão em destaque). Conteúdo dos cartões: a definir. |
| 26 | **Plano em destaque** no popup: o de **10 usuários (Padrão)** — padrão inicial, alterável pelo Super Admin. |
| 27 | **Planos 100% configuráveis pelo Super Admin** (novo item de menu): nome, usuários, preços, selo de desconto, frase, condições, caixa de oferta, recursos, plano em destaque, ordem e **quais planos aparecem no popup** (o popup se ajusta à quantidade escolhida). |
| 28 | **Login — botão Planos:** o botão de tema fica **só com o ícone** (sem texto "Tema escuro/claro"); o botão **"Planos"** vem **antes** dele, com cor de destaque já existente na tela. (Alteração do login ordenada pelo dono.) |
| 29 | **"Escolher plano" leva à forma de pagamento.** Por enquanto só **PIX**; outras formas configuráveis depois. |
| 30 | **Criar empresa:** o Super Admin informa nome e e-mail do Admin da Empresa, que recebe senha temporária por e-mail. |
| 31 | **Criar Usuário Individual:** o Super Admin informa nome, e-mail, WhatsApp e prazo (padrão 31 dias); a pessoa recebe senha temporária por e-mail. |
| 32 | **Compra:** o comprador informa nome, e-mail, WhatsApp e (planos de empresa) nome da empresa. Quem compra plano de empresa vira o **Admin da Empresa**. |
| 33 | **PIX com confirmação manual (opção A):** o sistema gera QR Code e "copia e cola" com a chave PIX configurada; o pedido entra em **Pedidos**; o Super Admin confere e clica em "Confirmar pagamento"; a conta é criada e a senha temporária vai por e-mail. Na fase 2 troca para confirmação automática (Asaas/Mercado Pago). |
| 34 | **Plano Free:** conta criada na hora após informar os dados; **1 teste por e-mail**; vale **7 dias ou 20 disparos**, o que acontecer primeiro. |
| 35 | **Plano Personalizado:** o contato (ex.: WhatsApp) é definido pelo Super Admin. |
| 36 | **Renovação:** o cliente recebe um **link de renovação**; se não renovar até o vencimento, renova pela tela de Planos. |
| 37 | **Pedido PIX vale 24 h**; depois disso fica como expirado. |
| 38 | **Aviso de novo pedido pelo WhatsApp** do Super Admin. Depende da API própria do WhatsApp (etapa 6): até lá, os pedidos aparecem com contador no menu **Pedidos**. |
| 39 | **Tela após o PIX:** "Assim que confirmarmos o pagamento, você receberá por e-mail o acesso com uma senha temporária." |
| 40 | **Prorrogar pacote:** soma o prazo do plano (ex.: +31 dias) a partir do vencimento atual; se já venceu, a partir de hoje. |
| 41 | **Detalhes aprovados da compra:** senha temporária de conta nova vale 7 dias; pedido vencido (24 h) ainda pode ser confirmado (pagamento atrasado); no máximo 3 pedidos em aberto por e-mail; o PIX leva o código do pedido como identificador. |
| 42 | **Link de renovação** enviado **10 dias antes** do vencimento e lembrete **3 dias antes**. Recebe: Admin da Empresa (Empresarial) ou o próprio usuário (Individual). Por e-mail; pelo WhatsApp após a etapa 6. Envio diário automático (Vercel Cron). |
| 43 | **Na renovação o cliente pode trocar de plano.** |
| 44 | **Cliente que compra pela tela de Planos com e-mail já cadastrado** (Admin da Empresa ou usuário Individual): a compra **renova a conta existente**, mantendo usuários, leads e histórico. |
| 45 | **Renovação não troca de módulo:** Individual renova com plano Individual; Empresarial com plano Empresarial. Trocar de módulo exige conta nova. |
| 46 | **Usuário de empresa vence junto com o pacote** — o Admin não define prazo individual. |
| 47 | **Permissões por usuário** (definidas pelo Admin da Empresa): Leads, Campanhas, Conversas IA, Arquivos, Empresa \| IA. Dashboard e WhatsApp sempre liberados. |
| 48 | **Sem campo "Observações"** no cadastro de usuário. |
| 49 | **O Admin pode excluir um usuário**; antes, **transfere os dados dele (leads, campanhas, conversas) para outro usuário** da empresa. |
| 50 | **Usuário desativado não ocupa vaga.** Se a vaga for preenchida por outro, o desativado **só pode ser reativado quando houver vaga** disponível. |
| 51 | **Número da plataforma:** o Super Admin conecta, por QR Code no painel dele, um WhatsApp da plataforma. É esse número que envia os avisos do sistema (novo pedido, links de renovação) para o **WhatsApp do Super Admin** (campo próprio no painel) e para os clientes. |
| 52 | **Domínio do sistema inteiro: `filaproleads.com.br`** (substitui imobfile.com.br). Comprado e com DNS na **Hostinger**. Site/telas na Vercel em `filaproleads.com.br`; serviço 24/7 na VPS em `api.filaproleads.com.br`; e-mails saem de `nao-responda@filaproleads.com.br` (domínio verificado no Resend). |
| 53 | **Entrada de leads:** manual (um a um, ou colando vários — um por linha, formato `Nome; telefone`) **e** por arquivo **Excel (.xlsx) ou CSV**, verificando se o arquivo tem cabeçalho. |
| 54 | **Telefone repetido:** no mesmo usuário é ignorado (com aviso). Na **empresa**, o número fica com **quem cadastrou primeiro**; o outro usuário vê só "já cadastrado por outro usuário da empresa" (sem o nome). Contas individuais são separadas entre si. |
| 55 | **Números de outros países são aceitos** (com + e código do país). Número com 10 ou 11 dígitos é tratado como do Brasil (+55). |
| 56 | **Quem altera leads:** **Usuário de empresa** edita só o nome, inativa e reativa. **Admin da Empresa** ganha a tela **Leads** com os leads de todos os usuários da empresa e pode cadastrar, importar, alterar (inclusive telefone), inativar e reativar, mas **não exclui** (nas empresas, só o Super Admin exclui). **Usuário Individual** é o próprio admin: altera, inativa e reativa, mas **não exclui**. **Super Admin**: acesso total. Lead inativo não recebe campanhas. |
| 57 | **"Não quero receber" (SAIR / PARAR / STOP):** o lead fica como **"Pediu para sair"** e o envio fica **bloqueado por 45 dias**. Depois disso, se o usuário colocar o lead numa campanha, o sistema avisa ("pediu para sair em dd/mm") e pergunta se quer **retirar** (opção padrão) ou manter. |
| 58 | **Limite de leads** (ilimitado ou um máximo): no **Individual**, o Super Admin define no plano. No **Empresarial**, o Super Admin define o limite **da empresa** e o Admin da Empresa define o limite **de cada usuário**. |
| 59 | **Status do lead** (Novo, Em conversa, Qualificado, Objeção, Venda concluída, Bloqueado 24h, Pediu para sair) muda principalmente pela conversa, e o usuário **pode alterar manualmente**. |
| 60 | **Super Admin sem restrições:** pode tudo, **inclusive enviar mensagens** (substitui o "sem enviar mensagem" da decisão #5 e do prompt, seção do Super Admin). |
| 61 | **Arquivo sem cabeçalho:** o sistema identifica sozinho a coluna do telefone (a que tem mais números válidos) e a do nome (a que tem mais textos). Sem coluna de nome, o lead entra com o **nome em branco**. Com cabeçalho, as colunas são achadas pelo nome, em qualquer posição. |
| 62 | **Super Admin faz o mesmo que os usuários para enviar** (Meu WhatsApp, leads, campanhas). Todos os textos dizendo que o Super Admin não envia são removidos. O **Admin da Empresa continua sem enviar**. |
| 63 | **Códigos legíveis (gravados em coluna própria, nunca se repetem no sistema):** Super Admin `S00001` · Empresa `E00001` · Conta/usuário individual `00001` · Usuário de empresa, inclusive o Admin, `EU00001` · Lead individual `L00001` · Lead de empresa `EL00001`. Uma sequência por tipo para o sistema inteiro; começa com 5 dígitos e cresce até 10. O lead guarda também o código do usuário e da empresa, para leitura direta no banco. |
| 64 | **Antibloqueio — boas práticas adotadas (todas):** aquecimento de número novo (até 20/dia nos dias 1–3, 50 nos dias 4–7, 100 na semana 2, depois o limite normal); limite por número **Conservador 200/dia e 40/h · Equilibrado 350/dia e 60/h · Rápido 500/dia e 90/h**; blocos com tamanho variável; "digitando…" antes de cada envio; conferir se o número tem WhatsApp antes de enviar; aviso de link na 1ª mensagem; variação da saudação; pausa automática por sinais de risco (falhas seguidas, mais de 30% sem WhatsApp, desconexão/restrição); no máximo 2 mensagens sem resposta por lead em 30 dias; quem responde sai da fila da campanha; "saúde do número" no dashboard. |
| 65 | **Janela de envio:** segunda a sábado (domingo não envia); **feriados nacionais pausam**. O **Super Admin controla os limites globais** (horário mínimo e máximo, padrão 7h–21h, e a lista de feriados); usuário Individual e Admin da Empresa ajustam dentro dessa faixa. |
| 66 | **Texto de descadastro padrão:** _"Se não quiser mais receber nossas mensagens, responda *SAIR*."_ (editável, com Restaurar). |
| 67 | **Anexos na campanha:** **um anexo por campanha**, enviado junto com o texto (o texto vira a legenda). Tipos: **imagem (JPG/PNG) até 5 MB, PDF até 15 MB, vídeo curto e áudio**. Arquivos guardados **na VPS**. |

## Fase 2 — IMPORTANTE, implementar depois do MVP
- **Teste grátis:** 7 dias ou 20 disparos, o que acontecer primeiro (regras completas em `especificacao-api-whatsapp.md`).
- **Cobrança automática por assinatura (Asaas):** PIX, boleto e cartão; troca de plano; compra de usuários extras.
- **Cadastro público** ligado ao teste grátis.
- O código do MVP deve ser estruturado para receber estes itens sem retrabalho (planos e limites no banco, não fixos no código).
