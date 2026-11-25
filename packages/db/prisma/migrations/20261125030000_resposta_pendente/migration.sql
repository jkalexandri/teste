-- Resposta da IA pendente guardada no banco (decisão #127)
ALTER TABLE "Lead" ADD COLUMN "respostaPendenteDesde" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "responderEm" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "pendenteVersao" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "tentativasResposta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "avisoEsperaEm" TIMESTAMP(3);
CREATE INDEX "Lead_responderEm_idx" ON "Lead"("responderEm");
