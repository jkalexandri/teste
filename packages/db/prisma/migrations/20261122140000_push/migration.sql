-- Notificações no celular (decisão #99)
-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "avisoCelular" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PushInscricao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "aparelho" TEXT NOT NULL DEFAULT '',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushInscricao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushInscricao_endpoint_key" ON "PushInscricao"("endpoint");

-- CreateIndex
CREATE INDEX "PushInscricao_usuarioId_idx" ON "PushInscricao"("usuarioId");

