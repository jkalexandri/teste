-- Decisão #102: planos por quantidade, Online, Suporte e Mensagens do Super Admin
-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "disparosExtras" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inicioPeriodo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "pacotesDisparos" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Plano" ADD COLUMN     "disparosPorPeriodo" INTEGER,
ADD COLUMN     "pacoteDisparos" INTEGER,
ADD COLUMN     "precoPacoteDisparos" INTEGER;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "aparelho" TEXT,
ADD COLUMN     "telaAtual" TEXT,
ADD COLUMN     "vistoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SuporteConversa" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "ultimaMensagemEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "naoLidasSuporte" INTEGER NOT NULL DEFAULT 0,
    "naoLidasCliente" INTEGER NOT NULL DEFAULT 0,
    "chamadoEm" TIMESTAMP(3),

    CONSTRAINT "SuporteConversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuporteMensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "arquivoNome" TEXT,
    "arquivoTipo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuporteMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comunicado" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "link" TEXT,
    "validoAte" TIMESTAMP(3),
    "publico" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comunicado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComunicadoDestino" (
    "id" TEXT NOT NULL,
    "comunicadoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "lidoEm" TIMESTAMP(3),

    CONSTRAINT "ComunicadoDestino_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuporteConversa_usuarioId_key" ON "SuporteConversa"("usuarioId");

-- CreateIndex
CREATE INDEX "SuporteConversa_ultimaMensagemEm_idx" ON "SuporteConversa"("ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "SuporteMensagem_conversaId_criadoEm_idx" ON "SuporteMensagem"("conversaId", "criadoEm");

-- CreateIndex
CREATE INDEX "SuporteMensagem_criadoEm_idx" ON "SuporteMensagem"("criadoEm");

-- CreateIndex
CREATE INDEX "ComunicadoDestino_usuarioId_lidoEm_idx" ON "ComunicadoDestino"("usuarioId", "lidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ComunicadoDestino_comunicadoId_usuarioId_key" ON "ComunicadoDestino"("comunicadoId", "usuarioId");

-- AddForeignKey
ALTER TABLE "SuporteMensagem" ADD CONSTRAINT "SuporteMensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "SuporteConversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComunicadoDestino" ADD CONSTRAINT "ComunicadoDestino_comunicadoId_fkey" FOREIGN KEY ("comunicadoId") REFERENCES "Comunicado"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contas existentes: o período atual começa na criação da conta (o teste grátis continua contando desde o início)
UPDATE "Empresa" SET "inicioPeriodo" = "criadoEm";
