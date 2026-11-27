-- Link de uso único para definir a senha, no lugar da senha temporária na recuperação (decisão #164 — S9 do Módulo 1)
ALTER TABLE "Usuario" ADD COLUMN "linkSenhaHash" TEXT, ADD COLUMN "linkSenhaExpiraEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "Usuario_linkSenhaHash_key" ON "Usuario"("linkSenhaHash");
