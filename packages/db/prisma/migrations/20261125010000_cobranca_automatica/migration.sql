-- Cobrança automática no cartão (decisão #124)
ALTER TABLE "Empresa" ADD COLUMN "asaasAssinaturaId" TEXT;
CREATE UNIQUE INDEX "Empresa_asaasAssinaturaId_key" ON "Empresa"("asaasAssinaturaId");
ALTER TABLE "Pedido" ADD COLUMN "automatica" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Pedido" ADD COLUMN "asaasAssinaturaId" TEXT;
