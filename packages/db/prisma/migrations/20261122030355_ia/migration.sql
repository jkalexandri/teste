-- AlterTable
ALTER TABLE "ConfigVenda" ADD COLUMN     "cotacaoDolar" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Plano" ADD COLUMN     "limiteIAUsd" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ConfigIA" (
    "tarefa" TEXT NOT NULL,
    "provedor" TEXT NOT NULL DEFAULT 'anthropic',
    "modelo" TEXT NOT NULL DEFAULT 'claude-haiku-5-5',
    "urlBase" TEXT NOT NULL DEFAULT '',
    "chave" TEXT,
    "precoEntrada" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "precoSaida" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigIA_pkey" PRIMARY KEY ("tarefa")
);

-- CreateTable
CREATE TABLE "UsoIA" (
    "id" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tarefa" TEXT NOT NULL,
    "provedor" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "empresaId" TEXT,
    "usuarioId" TEXT,
    "entrada" INTEGER NOT NULL DEFAULT 0,
    "saida" INTEGER NOT NULL DEFAULT 0,
    "cacheLeitura" INTEGER NOT NULL DEFAULT 0,
    "cacheEscrita" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "erro" TEXT,

    CONSTRAINT "UsoIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsoIA_criadoEm_idx" ON "UsoIA"("criadoEm");

-- CreateIndex
CREATE INDEX "UsoIA_empresaId_criadoEm_idx" ON "UsoIA"("empresaId", "criadoEm");

