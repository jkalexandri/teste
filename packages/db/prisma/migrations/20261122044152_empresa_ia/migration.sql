-- CreateEnum
CREATE TYPE "TipoMaterial" AS ENUM ('LINK', 'TEXTO', 'IMAGEM', 'PDF');

-- CreateEnum
CREATE TYPE "StatusMaterial" AS ENUM ('LENDO', 'PRONTO', 'ERRO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "limiteMateriais" INTEGER,
ADD COLUMN     "limitePaginasMes" INTEGER,
ADD COLUMN     "treinarIA" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Plano" ADD COLUMN     "limiteMateriais" INTEGER,
ADD COLUMN     "limitePaginasMes" INTEGER;

-- CreateTable
CREATE TABLE "FichaEmpresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "superAdminId" TEXT,
    "nome" TEXT NOT NULL DEFAULT '',
    "endereco" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "atividade" TEXT NOT NULL DEFAULT '',
    "resumo" TEXT NOT NULL DEFAULT '',
    "resumoEm" TIMESTAMP(3),
    "montando" BOOLEAN NOT NULL DEFAULT false,
    "mesRef" TEXT NOT NULL DEFAULT '',
    "paginasMes" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FichaEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIA" (
    "id" TEXT NOT NULL,
    "fichaId" TEXT NOT NULL,
    "tipo" "TipoMaterial" NOT NULL,
    "origem" TEXT NOT NULL,
    "status" "StatusMaterial" NOT NULL DEFAULT 'LENDO',
    "conteudo" TEXT NOT NULL DEFAULT '',
    "resumo" TEXT NOT NULL DEFAULT '',
    "paginas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lidoEm" TIMESTAMP(3),

    CONSTRAINT "MaterialIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FichaEmpresa_empresaId_key" ON "FichaEmpresa"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "FichaEmpresa_superAdminId_key" ON "FichaEmpresa"("superAdminId");

-- CreateIndex
CREATE INDEX "MaterialIA_fichaId_idx" ON "MaterialIA"("fichaId");

-- AddForeignKey
ALTER TABLE "FichaEmpresa" ADD CONSTRAINT "FichaEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIA" ADD CONSTRAINT "MaterialIA_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "FichaEmpresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

