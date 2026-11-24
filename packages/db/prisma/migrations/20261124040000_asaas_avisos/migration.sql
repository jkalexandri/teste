-- CreateTable
CREATE TABLE "AvisoAsaas" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "cobrancaId" TEXT,
    "referencia" TEXT,
    "dados" JSONB NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),
    "resultado" TEXT,
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AvisoAsaas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvisoAsaas_eventoId_key" ON "AvisoAsaas"("eventoId");

-- CreateIndex
CREATE INDEX "AvisoAsaas_processadoEm_idx" ON "AvisoAsaas"("processadoEm");

-- CreateIndex
CREATE INDEX "AvisoAsaas_cobrancaId_idx" ON "AvisoAsaas"("cobrancaId");

