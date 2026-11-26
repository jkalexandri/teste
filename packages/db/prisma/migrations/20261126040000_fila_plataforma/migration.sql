-- Fila de saída do número da plataforma (decisão #143)
CREATE TABLE "MensagemPlataforma" (
    "id" TEXT NOT NULL,
    "para" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'NORMAL',
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "enviadaEm" TIMESTAMP(3),

    CONSTRAINT "MensagemPlataforma_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MensagemPlataforma_situacao_prioridade_criadoEm_idx" ON "MensagemPlataforma"("situacao", "prioridade", "criadoEm");
CREATE INDEX "MensagemPlataforma_enviadaEm_idx" ON "MensagemPlataforma"("enviadaEm");
