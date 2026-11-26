-- Reconexão automática visível na tela (decisão #139)
ALTER TYPE "StatusWhatsapp" ADD VALUE 'RECONECTANDO';
ALTER TABLE "WhatsappSessao" ADD COLUMN "quedaEm" TIMESTAMP(3),
  ADD COLUMN "tentativaReconexao" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "proximaTentativaEm" TIMESTAMP(3);
