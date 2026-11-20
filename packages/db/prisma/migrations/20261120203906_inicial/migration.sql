-- CreateEnum
CREATE TYPE "Modulo" AS ENUM ('INDIVIDUAL', 'EMPRESARIAL');

-- CreateEnum
CREATE TYPE "Cargo" AS ENUM ('SUPERADMIN', 'ADMIN_EMPRESA', 'USUARIO');

-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('ATIVO', 'BLOQUEADO');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modulo" "Modulo" NOT NULL,
    "pacote" TEXT NOT NULL,
    "limiteUsuarios" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "prazoDias" INTEGER NOT NULL DEFAULT 31,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cargo" "Cargo" NOT NULL,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ATIVO',
    "whatsapp" TEXT,
    "empresaId" TEXT,
    "senhaHash" TEXT,
    "senhaTempHash" TEXT,
    "senhaTempExpiraEm" TIMESTAMP(3),
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "ultimoAcesso" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "precisaTrocar" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Empresa_modulo_idx" ON "Empresa"("modulo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Usuario_empresaId_idx" ON "Usuario"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Sessao_tokenHash_key" ON "Sessao"("tokenHash");

-- CreateIndex
CREATE INDEX "Sessao_usuarioId_idx" ON "Sessao"("usuarioId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
