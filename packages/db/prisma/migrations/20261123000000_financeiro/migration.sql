-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('RECEITA', 'DESPESA');

-- CreateEnum
CREATE TYPE "SituacaoLancamento" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO');

-- AlterTable
ALTER TABLE "ConfigVenda" ADD COLUMN     "aliquotaImposto" DOUBLE PRECISION,
ADD COLUMN     "avisoFinanceiroEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "nome" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "categoriaId" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "pagoEm" TIMESTAMP(3),
    "situacao" "SituacaoLancamento" NOT NULL DEFAULT 'PENDENTE',
    "contaId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "chaveAuto" TEXT,
    "pedidoId" TEXT,
    "despesaFixaId" TEXT,
    "estornoDeId" TEXT,
    "observacao" TEXT,
    "comprovanteNome" TEXT,
    "comprovanteTipo" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DespesaFixa" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "categoriaId" TEXT,
    "contaId" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DespesaFixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_tipo_nome_key" ON "CategoriaFinanceira"("tipo", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_nome_key" ON "ContaBancaria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Lancamento_chaveAuto_key" ON "Lancamento"("chaveAuto");

-- CreateIndex
CREATE INDEX "Lancamento_tipo_situacao_vencimento_idx" ON "Lancamento"("tipo", "situacao", "vencimento");

-- CreateIndex
CREATE INDEX "Lancamento_pagoEm_idx" ON "Lancamento"("pagoEm");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_despesaFixaId_fkey" FOREIGN KEY ("despesaFixaId") REFERENCES "DespesaFixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespesaFixa" ADD CONSTRAINT "DespesaFixa_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespesaFixa" ADD CONSTRAINT "DespesaFixa_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

