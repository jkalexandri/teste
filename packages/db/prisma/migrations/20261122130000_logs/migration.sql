-- Tela Logs (decisão #99)
-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empresaId" TEXT,
    "usuarioId" TEXT,
    "quem" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ip" TEXT,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Log_empresaId_criadoEm_idx" ON "Log"("empresaId", "criadoEm");

-- CreateIndex
CREATE INDEX "Log_criadoEm_idx" ON "Log"("criadoEm");

