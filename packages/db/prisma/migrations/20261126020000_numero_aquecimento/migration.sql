-- Aquecimento por chip (decisão #141)
ALTER TABLE "WhatsappSessao" ADD COLUMN "numeroAquecimento" TEXT;
-- Números conectados hoje: a idade guardada é do número atual. Os sem número no cadastro ficam vazios
-- e recomeçam o aquecimento na próxima conexão (opção 1 aprovada pelo dono: na dúvida, envia devagar).
UPDATE "WhatsappSessao" SET "numeroAquecimento" = numero WHERE numero IS NOT NULL AND "primeiraConexaoEm" IS NOT NULL;
