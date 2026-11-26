-- Aviso de serviço 24/7 fora do ar (decisão #151)
CREATE TABLE "AlertaServico" (
    "id" TEXT NOT NULL,
    "foraDesde" TIMESTAMP(3),
    "avisouEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertaServico_pkey" PRIMARY KEY ("id")
);
