-- IA no suporte dos clientes (decisão #146)
ALTER TABLE "SuporteConversa" ADD COLUMN "iaPausada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SuporteConversa" ADD COLUMN "iaPausaMotivo" TEXT;
ALTER TABLE "SuporteConversa" ADD COLUMN "ultimoAvisoEm" TIMESTAMP(3);
ALTER TABLE "ConfigVenda" ADD COLUMN "iaSuporteLigada" BOOLEAN NOT NULL DEFAULT false;
