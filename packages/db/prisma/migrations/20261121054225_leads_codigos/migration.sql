-- CreateEnum
CREATE TYPE "StatusLead" AS ENUM ('NOVO', 'EM_CONVERSA', 'QUALIFICADO', 'OBJECAO', 'VENDA_CONCLUIDA', 'BLOQUEADO_24H', 'PEDIU_SAIR');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "limiteLeads" INTEGER;

-- AlterTable
ALTER TABLE "Plano" ADD COLUMN     "limiteLeads" INTEGER;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "codigo" TEXT,
ADD COLUMN     "limiteLeads" INTEGER;

-- CreateTable
CREATE TABLE "Contador" (
    "tipo" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Contador_pkey" PRIMARY KEY ("tipo")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL DEFAULT '',
    "telefone" TEXT NOT NULL,
    "status" "StatusLead" NOT NULL DEFAULT 'NOVO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "pediuSairEm" TIMESTAMP(3),
    "qualificacao" TEXT,
    "qualificacaoMotivo" TEXT,
    "qualificacaoEm" TIMESTAMP(3),
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT,
    "codigoUsuario" TEXT NOT NULL,
    "codigoEmpresa" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_codigo_key" ON "Lead"("codigo");

-- CreateIndex
CREATE INDEX "Lead_usuarioId_idx" ON "Lead"("usuarioId");

-- CreateIndex
CREATE INDEX "Lead_empresaId_idx" ON "Lead"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_empresaId_telefone_key" ON "Lead"("empresaId", "telefone");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_usuarioId_telefone_key" ON "Lead"("usuarioId", "telefone");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_codigo_key" ON "Empresa"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_codigo_key" ON "Usuario"("codigo");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== Códigos legíveis para os registros que já existem (decisão #63) =====
-- Formato: prefixo + número com no mínimo 5 dígitos.
UPDATE "Usuario" u SET "codigo" = 'S' || lpad(x.n::text, 5, '0')
FROM (SELECT id, row_number() OVER (ORDER BY "criadoEm", id) AS n FROM "Usuario" WHERE cargo = 'SUPERADMIN') x
WHERE u.id = x.id;

UPDATE "Empresa" e SET "codigo" = 'E' || lpad(x.n::text, 5, '0')
FROM (SELECT id, row_number() OVER (ORDER BY "criadoEm", id) AS n FROM "Empresa" WHERE modulo = 'EMPRESARIAL') x
WHERE e.id = x.id;

UPDATE "Empresa" e SET "codigo" = lpad(x.n::text, 5, '0')
FROM (SELECT id, row_number() OVER (ORDER BY "criadoEm", id) AS n FROM "Empresa" WHERE modulo = 'INDIVIDUAL') x
WHERE e.id = x.id;

-- Usuários de empresa (inclusive o Admin): EU + número
UPDATE "Usuario" u SET "codigo" = 'EU' || lpad(x.n::text, 5, '0')
FROM (SELECT u2.id, row_number() OVER (ORDER BY u2."criadoEm", u2.id) AS n
      FROM "Usuario" u2 JOIN "Empresa" e ON e.id = u2."empresaId" WHERE e.modulo = 'EMPRESARIAL') x
WHERE u.id = x.id;

-- Usuário individual: mesmo número da sua conta
UPDATE "Usuario" u SET "codigo" = e."codigo"
FROM "Empresa" e WHERE e.id = u."empresaId" AND e.modulo = 'INDIVIDUAL';

INSERT INTO "Contador" (tipo, valor) VALUES
  ('superadmin', (SELECT count(*) FROM "Usuario" WHERE cargo = 'SUPERADMIN')),
  ('empresa', (SELECT count(*) FROM "Empresa" WHERE modulo = 'EMPRESARIAL')),
  ('individual', (SELECT count(*) FROM "Empresa" WHERE modulo = 'INDIVIDUAL')),
  ('usuario_empresa', (SELECT count(*) FROM "Usuario" u JOIN "Empresa" e ON e.id = u."empresaId" WHERE e.modulo = 'EMPRESARIAL')),
  ('lead_individual', 0),
  ('lead_empresa', 0)
ON CONFLICT (tipo) DO NOTHING;
