-- AlterTable
ALTER TABLE "ConfigVenda" ADD COLUMN     "jurosParcelaMes" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "cpfCnpj" TEXT;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "asaasId" TEXT,
ADD COLUMN     "boletoLinha" TEXT,
ADD COLUMN     "cpfCnpj" TEXT,
ADD COLUMN     "forma" TEXT NOT NULL DEFAULT 'PIX_MANUAL',
ADD COLUMN     "linkPagamento" TEXT,
ADD COLUMN     "parcelas" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_asaasId_key" ON "Pedido"("asaasId");

