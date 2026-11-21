-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "permissoes" TEXT[] DEFAULT ARRAY['leads', 'campanhas', 'conversas', 'arquivos', 'empresa-ia']::TEXT[];

