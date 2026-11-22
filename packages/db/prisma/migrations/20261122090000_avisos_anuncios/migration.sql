-- Etapa 10b: avisos e leads de anúncios (decisões #81, #82, #84, #90 e #94)
-- CreateEnum
CREATE TYPE "StatusAnuncio" AS ENUM ('RECEBIDO', 'AGUARDANDO_WHATSAPP', 'ATENDIDO', 'SEM_TELEFONE', 'SEM_RECURSO', 'ERRO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "leadsAnuncios" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Plano" ADD COLUMN     "leadsAnuncios" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "avisoAnuncio" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "avisoQuente" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "avisoRespondeu" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "numeroAvisos" TEXT,
ADD COLUMN     "tokenAnuncios" TEXT,
ADD COLUMN     "ultimoAvisoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AvisoPendente" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoPendente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAnuncio" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'outro',
    "nome" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "assunto" TEXT NOT NULL DEFAULT '',
    "dados" JSONB,
    "status" "StatusAnuncio" NOT NULL DEFAULT 'RECEBIDO',
    "leadId" TEXT,
    "erro" TEXT,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidoEm" TIMESTAMP(3),

    CONSTRAINT "LeadAnuncio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvisoPendente_usuarioId_idx" ON "AvisoPendente"("usuarioId");

-- CreateIndex
CREATE INDEX "LeadAnuncio_usuarioId_recebidoEm_idx" ON "LeadAnuncio"("usuarioId", "recebidoEm");

-- CreateIndex
CREATE INDEX "LeadAnuncio_status_idx" ON "LeadAnuncio"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_tokenAnuncios_key" ON "Usuario"("tokenAnuncios");

