-- Serviço 24/7: só um por vez (decisão #133)
CREATE TABLE "ServicoInstancia" (
    "id" TEXT NOT NULL,
    "dono" TEXT NOT NULL,
    "vistoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServicoInstancia_pkey" PRIMARY KEY ("id")
);
