-- Upgrade de conta dentro do sistema (decisão #125)
ALTER TABLE "Pedido" ADD COLUMN "upgrade" BOOLEAN NOT NULL DEFAULT false;
