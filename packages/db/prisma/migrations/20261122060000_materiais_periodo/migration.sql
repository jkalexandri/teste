-- Decisão #91: materiais enviados no período do plano ("Esquecer" não devolve; zera na renovação)
ALTER TABLE "FichaEmpresa" ADD COLUMN "materiaisPeriodo" INTEGER NOT NULL DEFAULT 0;
-- Contas que já têm materiais começam com a quantidade atual
UPDATE "FichaEmpresa" f SET "materiaisPeriodo" = (SELECT count(*) FROM "MaterialIA" m WHERE m."fichaId" = f.id);
