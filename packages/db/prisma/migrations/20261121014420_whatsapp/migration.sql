-- CreateEnum
CREATE TYPE "StatusWhatsapp" AS ENUM ('DESCONECTADO', 'CONECTANDO', 'AGUARDANDO_QR', 'CONECTADO');

-- AlterTable
ALTER TABLE "ConfigVenda" ADD COLUMN     "numeroAvisos" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "WhatsappSessao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "status" "StatusWhatsapp" NOT NULL DEFAULT 'DESCONECTADO',
    "numero" TEXT,
    "qr" TEXT,
    "qrEm" TIMESTAMP(3),
    "creds" TEXT,
    "erro" TEXT,
    "conectadoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappChave" (
    "sessaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chaveId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "WhatsappChave_pkey" PRIMARY KEY ("sessaoId","tipo","chaveId")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappSessao_usuarioId_key" ON "WhatsappSessao"("usuarioId");

-- AddForeignKey
ALTER TABLE "WhatsappSessao" ADD CONSTRAINT "WhatsappSessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappChave" ADD CONSTRAINT "WhatsappChave_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "WhatsappSessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

