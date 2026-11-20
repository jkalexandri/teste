# Decisões do projeto FilaPro Leads

| # | Decisão | Data |
|---|---|---|
| 1 | **Sem API oficial da Meta.** A API de WhatsApp é própria, criada neste projeto, com conexão por QR Code. | 20/11/2026 |
| 2 | **Feixes de luz do login:** cada um dos 5 feixes percorre o circuito em **4,2 s** (duração fixa), em trilha e direção aleatórias, em loop infinito. | 20/11/2026 |
| 3 | **Contas demo só para teste.** Criadas por script (seed) apenas nos ambientes local e de testes. Em produção não existem. Os botões "Entrar como Super Admin / Admin da Empresa / Usuário" do login aparecem **só no ambiente de testes**; em produção o card termina no botão "Entrar". | 20/11/2026 |
| 4 | **Envio 24/7:** o app (telas) roda na Vercel; a API, a fila de envio e as sessões do WhatsApp rodam num servidor sempre ligado em `api.imobfile.com.br`. Provedor a definir (ver abaixo). | 20/11/2026 |

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

## Fase 2 — IMPORTANTE, implementar depois do MVP
- **Teste grátis:** 7 dias ou 20 disparos, o que acontecer primeiro (regras completas em `especificacao-api-whatsapp.md`).
- **Cobrança automática por assinatura (Asaas):** PIX, boleto e cartão; troca de plano; compra de usuários extras.
- **Cadastro público** ligado ao teste grátis.
- O código do MVP deve ser estruturado para receber estes itens sem retrabalho (planos e limites no banco, não fixos no código).
