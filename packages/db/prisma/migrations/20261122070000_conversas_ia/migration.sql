-- Etapa 10: Conversas IA (decisão #92)
-- CreateEnum
CREATE TYPE "AutorMensagem" AS ENUM ('LEAD', 'IA', 'USUARIO', 'CAMPANHA');

-- AlterTable
ALTER TABLE "FichaEmpresa" ADD COLUMN     "comoQualificar" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "iaPausaMotivo" TEXT,
ADD COLUMN     "iaPausada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "naoLidas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resumidoAte" TIMESTAMP(3),
ADD COLUMN     "resumoConversa" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ultimaMensagemEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "iaConversas" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "autor" "AutorMensagem" NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "arquivoId" TEXT,
    "arquivoNome" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mensagem_leadId_criadoEm_idx" ON "Mensagem"("leadId", "criadoEm");

-- CreateIndex
CREATE INDEX "Mensagem_criadoEm_idx" ON "Mensagem"("criadoEm");

-- CreateIndex
CREATE INDEX "Lead_usuarioId_ultimaMensagemEm_idx" ON "Lead"("usuarioId", "ultimaMensagemEm");

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

