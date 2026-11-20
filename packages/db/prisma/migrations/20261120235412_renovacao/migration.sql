-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "avisoRenovacao10Em" TIMESTAMP(3),
ADD COLUMN     "avisoRenovacao3Em" TIMESTAMP(3),
ADD COLUMN     "tokenRenovacao" TEXT;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "renovacao" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_tokenRenovacao_key" ON "Empresa"("tokenRenovacao");

