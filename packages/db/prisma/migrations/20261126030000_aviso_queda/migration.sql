-- Aviso de número caído (decisão #142): marca de cada aviso, para avisar uma vez só por queda (mesmo após reiniciar)
ALTER TABLE "WhatsappSessao" ADD COLUMN "avisoQuedaEm" TIMESTAMP(3);
ALTER TABLE "WhatsappSessao" ADD COLUMN "avisoProblemaEm" TIMESTAMP(3);
