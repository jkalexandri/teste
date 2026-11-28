# Plano de arquivos — Categorias de planos + Redes Sociais (para aprovação)

Layout aprovado: **Opção A** (4 abas). Nenhum código foi alterado ainda.

## Etapa 1 — Categorias e nome Business (sem regra nova)
- `packages/db/prisma/schema.prisma` + migração: enum `CategoriaPlano` (INDIVIDUAL, BUSINESS, REDES, REDES_DISPAROS); `Plano.categoria`. Planos atuais: Free/Individual → INDIVIDUAL; Empresarial → BUSINESS.
- Nome "Business": o valor interno `EMPRESARIAL` do banco **continua** (renomear no banco mexeria em ~41 arquivos sem ganho); todo texto visível passa a "Business" por um único ponto (`lib/planos.ts`: `nomeModulo`).
- `components/planos/PopupPlanos.tsx`: 4 abas por categoria; Individual e Business mostram mensais + por disparos juntos (some a sub-aba "Mensal / Por disparo").
- `app/(app)/planos/EditorPlanos.tsx` + `actions.ts`: campo "Categoria" no cadastro.
- Textos "Empresarial" → "Business" em telas, e-mails e manuais; ajustar testes e2e que procuram o texto.

## Etapa 2 — Funções dos planos de Redes Sociais
- `Plano.redesSociais` (recebe e qualifica leads das redes) e `Plano.permiteDisparos` (Redes Sociais puro = não; os demais = sim).
- Bloqueio de campanhas/disparos para plano sem `permiteDisparos` (`lib/campanhas.ts`, `worker/disparos.ts`, telas de Campanhas).
- Leads das redes: usam o caminho que já existe (endereço de recebimento dos leads de anúncios, `lib/anuncios.ts`), agora liberado também pelo plano `redesSociais`.
- Cadastro dos 4 planos novos (invisíveis até você ligar), preços definidos por você.

## Etapa 3 — Roleta (só Business)
- Tabela nova `RoletaParticipante` (empresa, usuário, ativo). Tela para o Admin da Empresa escolher os participantes.
- Distribuição **aleatória** entre participantes **logados** (usa a presença já existente: `api/presenca`, `Usuario.ultimoAcesso`). O lead qualificado passa a ser do usuário sorteado (`Lead.usuarioId`).
- Registro em Logs de cada distribuição.

## Etapa 4 — Fechamento
- Testes e2e e unitários, regressão, print do login, manuais, decisões (#183+), `docs/comercial/fale-conosco.md` (planos novos), novidades, continuidade.

## Pendência obrigatória (não esquecer)
- Integração direta Facebook/Instagram (mensagens diretas, comentários, todas as redes): etapa própria depois, já registrada em `docs/continuidade.md`.

## Perguntas abertas
1. Nenhum participante logado quando o lead chega: o lead espera numa fila e vai para o primeiro participante que logar?
2. Participante logado mas sem WhatsApp conectado: entra no sorteio ou é pulado?
3. Quem já é cliente de Individual/Empresarial ganha "Redes Sociais" automaticamente? (Sugestão: não; só contrata o plano novo.)
