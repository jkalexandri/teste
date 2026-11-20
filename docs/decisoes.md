# Decisões do projeto FilaPro Leads

| # | Decisão | Data |
|---|---|---|
| 1 | **Sem API oficial da Meta.** A API de WhatsApp é própria, criada neste projeto, com conexão por QR Code. | 20/11/2026 |
| 2 | **Feixes de luz do login:** cada um dos 5 feixes percorre o circuito em **4,2 s** (duração fixa), em trilha e direção aleatórias, em loop infinito. | 20/11/2026 |
| 3 | **Contas demo só para teste.** Criadas por script (seed) apenas nos ambientes local e de testes. Em produção não existem. Os botões "Entrar como Super Admin / Admin da Empresa / Usuário" do login aparecem **só no ambiente de testes**; em produção o card termina no botão "Entrar". | 20/11/2026 |
| 4 | **Envio 24/7:** o app (telas) roda na Vercel; a API, a fila de envio e as sessões do WhatsApp rodam num servidor sempre ligado em `api.imobfile.com.br`. Provedor: **VPS** (decidido em 20/11/2026). | 20/11/2026 |

## Arquitetura de hospedagem

```
Navegador ──> imobfile.com.br (Vercel)          Next.js: login e telas
                    │
                    ▼
            api.imobfile.com.br (servidor 24/7)
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
| 9 | **E-mail transacional:** **Resend**, com o domínio imobfile.com.br (senhas temporárias e recuperação de senha). |
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

## Fase 2 — IMPORTANTE, implementar depois do MVP
- **Teste grátis:** 7 dias ou 20 disparos, o que acontecer primeiro (regras completas em `especificacao-api-whatsapp.md`).
- **Cobrança automática por assinatura (Asaas):** PIX, boleto e cartão; troca de plano; compra de usuários extras.
- **Cadastro público** ligado ao teste grátis.
- O código do MVP deve ser estruturado para receber estes itens sem retrabalho (planos e limites no banco, não fixos no código).
