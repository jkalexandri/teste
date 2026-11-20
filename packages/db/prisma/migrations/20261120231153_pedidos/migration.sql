-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('AGUARDANDO', 'PAGO', 'CANCELADO', 'EXPIRADO');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "limiteDisparos" INTEGER,
ADD COLUMN     "planoId" TEXT;

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "status" "StatusPedido" NOT NULL DEFAULT 'AGUARDANDO',
    "planoId" TEXT NOT NULL,
    "planoNome" TEXT NOT NULL,
    "modulo" "Modulo" NOT NULL,
    "usuarios" INTEGER,
    "prazoDias" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "empresaNome" TEXT,
    "pixCopiaECola" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadoEm" TIMESTAMP(3),
    "confirmadoPor" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "empresaId" TEXT,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TesteGratisUsado" (
    "email" TEXT NOT NULL,
    "usadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TesteGratisUsado_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_codigo_key" ON "Pedido"("codigo");

-- CreateIndex
CREATE INDEX "Pedido_status_idx" ON "Pedido"("status");

-- CreateIndex
CREATE INDEX "Pedido_email_idx" ON "Pedido"("email");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
