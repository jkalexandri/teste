-- CreateTable
CREATE TABLE "ConfigLegal" (
    "id" TEXT NOT NULL DEFAULT 'config',
    "responsavel" TEXT NOT NULL DEFAULT '',
    "documento" TEXT NOT NULL DEFAULT '',
    "endereco" TEXT NOT NULL DEFAULT '',
    "emailPrivacidade" TEXT NOT NULL DEFAULT '',
    "encarregadoNome" TEXT NOT NULL DEFAULT '',
    "encarregadoEmail" TEXT NOT NULL DEFAULT '',
    "foro" TEXT NOT NULL DEFAULT '',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigLegal_pkey" PRIMARY KEY ("id")
);

