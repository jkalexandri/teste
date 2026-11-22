-- Etapa 10c: vários WhatsApps no Individual (decisões #79, #80 e #95)
-- DropIndex
DROP INDEX "WhatsappSessao_usuarioId_key";

-- AlterTable
ALTER TABLE "Campanha" ADD COLUMN     "sessoes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "whatsappsExtras" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Envio" ADD COLUMN     "sessaoId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "sessaoId" TEXT;

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "sessaoId" TEXT;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "manterSessoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "somenteExtras" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappsExtras" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Plano" ADD COLUMN     "maxWhatsapps" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "precoWhatsappExtra" INTEGER;

-- AlterTable
ALTER TABLE "WhatsappSessao" ADD COLUMN     "apelido" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bloqueada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "WhatsappSessao_usuarioId_idx" ON "WhatsappSessao"("usuarioId");


-- Envios já feitos saíram pelo número principal (id = usuário)
UPDATE "Envio" e SET "sessaoId" = c."usuarioId" FROM "Campanha" c WHERE c.id = e."campanhaId" AND e."sessaoId" IS NULL AND e.status = 'ENVIADO';
