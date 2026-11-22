-- CreateTable
CREATE TABLE "Interessado" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "email" TEXT,
    "aceitouEm" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "iaPausada" BOOLEAN NOT NULL DEFAULT false,
    "iaPausaMotivo" TEXT,
    "temperatura" TEXT,
    "naoLidasSuporte" INTEGER NOT NULL DEFAULT 0,
    "naoLidasVisitante" INTEGER NOT NULL DEFAULT 0,
    "vistoEm" TIMESTAMP(3),
    "ultimoAvisoEm" TIMESTAMP(3),
    "ultimaMensagemEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interessado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteressadoMensagem" (
    "id" TEXT NOT NULL,
    "interessadoId" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorId" TEXT,
    "texto" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "arquivoNome" TEXT,
    "arquivoTipo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteressadoMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Interessado_tokenHash_key" ON "Interessado"("tokenHash");

-- CreateIndex
CREATE INDEX "Interessado_ultimaMensagemEm_idx" ON "Interessado"("ultimaMensagemEm");

-- CreateIndex
CREATE INDEX "Interessado_email_idx" ON "Interessado"("email");

-- CreateIndex
CREATE INDEX "Interessado_whatsapp_idx" ON "Interessado"("whatsapp");

-- CreateIndex
CREATE INDEX "InteressadoMensagem_interessadoId_criadoEm_idx" ON "InteressadoMensagem"("interessadoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "InteressadoMensagem" ADD CONSTRAINT "InteressadoMensagem_interessadoId_fkey" FOREIGN KEY ("interessadoId") REFERENCES "Interessado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

