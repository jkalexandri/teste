-- CreateTable
CREATE TABLE "Manutencao" (
    "id" TEXT NOT NULL DEFAULT 'geral',
    "ligada" BOOLEAN NOT NULL DEFAULT false,
    "desde" TIMESTAMP(3),
    "motivo" TEXT,

    CONSTRAINT "Manutencao_pkey" PRIMARY KEY ("id")
);

