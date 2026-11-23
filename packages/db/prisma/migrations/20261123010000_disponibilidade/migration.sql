-- CreateTable
CREATE TABLE "Disponibilidade" (
    "hora" TIMESTAMP(3) NOT NULL,
    "minutos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Disponibilidade_pkey" PRIMARY KEY ("hora")
);

