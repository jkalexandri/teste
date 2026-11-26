-- Chaves gerais e estado dos 4 pontos de atendimento por IA (decisão #149)
ALTER TABLE "ConfigVenda" ADD COLUMN "iaLeadsLigada" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ConfigVenda" ADD COLUMN "iaCampanhasLigada" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ConfigVenda" ADD COLUMN "iaVisitanteLigada" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "EstadoIAPonto" (
    "ponto" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstadoIAPonto_pkey" PRIMARY KEY ("ponto")
);
