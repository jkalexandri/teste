-- CreateEnum
CREATE TYPE "StatusCampanha" AS ENUM ('RASCUNHO', 'AGENDADA', 'EM_ANDAMENTO', 'PAUSADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ModoAntibloqueio" AS ENUM ('CONSERVADOR', 'EQUILIBRADO', 'RAPIDO');

-- CreateEnum
CREATE TYPE "StatusEnvio" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU', 'PULADO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "janelaFim" INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN     "janelaInicio" INTEGER NOT NULL DEFAULT 480;

-- CreateTable
CREATE TABLE "ConfigEnvio" (
    "id" TEXT NOT NULL DEFAULT 'config',
    "horaMinima" INTEGER NOT NULL DEFAULT 420,
    "horaMaxima" INTEGER NOT NULL DEFAULT 1260,
    "feriados" TEXT[] DEFAULT ARRAY['01-01', 'SEXTA-SANTA', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']::TEXT[],
    "janelaInicioSuperAdmin" INTEGER NOT NULL DEFAULT 480,
    "janelaFimSuperAdmin" INTEGER NOT NULL DEFAULT 1200,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campanha" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT,
    "status" "StatusCampanha" NOT NULL DEFAULT 'RASCUNHO',
    "assunto" TEXT NOT NULL DEFAULT '',
    "referencia" TEXT NOT NULL DEFAULT '',
    "mensagem" TEXT NOT NULL DEFAULT '',
    "variacoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "modo" "ModoAntibloqueio" NOT NULL DEFAULT 'CONSERVADOR',
    "bloqueio24h" BOOLEAN NOT NULL DEFAULT true,
    "descadastro" BOOLEAN NOT NULL DEFAULT true,
    "textoDescadastro" TEXT NOT NULL DEFAULT '',
    "incluirDataHora" BOOLEAN NOT NULL DEFAULT false,
    "eliminarDuplicados" BOOLEAN NOT NULL DEFAULT true,
    "randomizar" BOOLEAN NOT NULL DEFAULT true,
    "selecaoTodos" BOOLEAN NOT NULL DEFAULT true,
    "selecaoStatus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "leadsEscolhidos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manterQuemSaiu" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "arquivoId" TEXT,
    "agendadaPara" TIMESTAMP(3),
    "iniciadaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "motivo" TEXT,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campanha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Envio" (
    "id" TEXT NOT NULL,
    "campanhaId" TEXT NOT NULL,
    "leadId" TEXT,
    "telefone" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "status" "StatusEnvio" NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "versao" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "enviadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arquivo" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campanha_usuarioId_status_idx" ON "Campanha"("usuarioId", "status");

-- CreateIndex
CREATE INDEX "Campanha_status_idx" ON "Campanha"("status");

-- CreateIndex
CREATE INDEX "Envio_campanhaId_status_ordem_idx" ON "Envio"("campanhaId", "status", "ordem");

-- CreateIndex
CREATE INDEX "Envio_telefone_enviadoEm_idx" ON "Envio"("telefone", "enviadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "Envio_campanhaId_telefone_key" ON "Envio"("campanhaId", "telefone");

-- CreateIndex
CREATE INDEX "Arquivo_usuarioId_idx" ON "Arquivo"("usuarioId");

-- AddForeignKey
ALTER TABLE "Campanha" ADD CONSTRAINT "Campanha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campanha" ADD CONSTRAINT "Campanha_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campanha" ADD CONSTRAINT "Campanha_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "Arquivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "Campanha"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arquivo" ADD CONSTRAINT "Arquivo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

