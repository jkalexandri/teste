-- CreateTable
CREATE TABLE "Plano" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modulo" "Modulo" NOT NULL,
    "usuarios" INTEGER,
    "gratis" BOOLEAN NOT NULL DEFAULT false,
    "personalizado" BOOLEAN NOT NULL DEFAULT false,
    "precoAntigo" INTEGER,
    "precoAtual" INTEGER,
    "periodo" TEXT NOT NULL DEFAULT 'mês',
    "prazoDias" INTEGER NOT NULL DEFAULT 31,
    "testeDias" INTEGER,
    "testeDisparos" INTEGER,
    "selo" TEXT NOT NULL DEFAULT '',
    "frase" TEXT NOT NULL DEFAULT '',
    "condicoes" TEXT NOT NULL DEFAULT '',
    "ofertaTexto" TEXT NOT NULL DEFAULT '',
    "recursos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "textoBotao" TEXT NOT NULL DEFAULT 'Escolher plano',
    "visivel" BOOLEAN NOT NULL DEFAULT false,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigVenda" (
    "id" TEXT NOT NULL DEFAULT 'config',
    "formasPagamento" TEXT[] DEFAULT ARRAY['PIX']::TEXT[],
    "chavePix" TEXT NOT NULL DEFAULT '',
    "nomeRecebedor" TEXT NOT NULL DEFAULT '',
    "cidadeRecebedor" TEXT NOT NULL DEFAULT '',
    "contatoPersonalizado" TEXT NOT NULL DEFAULT '',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigVenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plano_slug_key" ON "Plano"("slug");
