-- Categoria dos planos (decisão #183): aba do popup Planos
CREATE TYPE "CategoriaPlano" AS ENUM ('INDIVIDUAL', 'BUSINESS', 'REDES', 'REDES_DISPAROS');
ALTER TABLE "Plano" ADD COLUMN "categoria" "CategoriaPlano" NOT NULL DEFAULT 'INDIVIDUAL';
-- Planos atuais: os do módulo Empresarial viram Business; Free e Individual continuam em Individual
UPDATE "Plano" SET "categoria" = 'BUSINESS' WHERE "modulo" = 'EMPRESARIAL';
