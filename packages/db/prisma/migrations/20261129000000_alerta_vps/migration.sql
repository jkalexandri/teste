-- Avisos da VPS (decisão #171): controle de persistência, repetição e nível dos avisos
ALTER TABLE "AlertaServico" ADD COLUMN "contagem" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "ultimoAvisoEm" TIMESTAMP(3), ADD COLUMN "nivel" TEXT;
