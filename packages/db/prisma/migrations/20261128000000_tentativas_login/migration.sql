-- Controle de tentativas de entrada e de recuperação de senha (decisão #160 — S5 do Módulo 1)
CREATE TABLE "TentativaLogin" (
    "chave" TEXT NOT NULL,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoAte" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TentativaLogin_pkey" PRIMARY KEY ("chave")
);
