-- Atendimento do suporte encerrado por inatividade do cliente (decisão #156)
ALTER TABLE "SuporteConversa" ADD COLUMN "encerradaEm" TIMESTAMP(3);
