-- AlterTable
ALTER TABLE "ConfigVenda" ADD COLUMN     "asaasAmbiente" TEXT NOT NULL DEFAULT 'sandbox',
ADD COLUMN     "asaasChave" TEXT,
ADD COLUMN     "asaasConta" TEXT,
ADD COLUMN     "asaasTestadoEm" TIMESTAMP(3),
ADD COLUMN     "asaasTokenWebhook" TEXT;

