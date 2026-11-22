-- AlterTable
ALTER TABLE "Sessao" ADD COLUMN     "pendente2fa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tentativas2fa" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "doisFatoresAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "doisFatoresCodigos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "doisFatoresSegredo" TEXT;

