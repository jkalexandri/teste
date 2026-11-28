-- Texto do "Sobre" do login, editável pelo Super Admin (decisão #189)
ALTER TABLE "ConfigVenda" ADD COLUMN "sobreTexto" TEXT NOT NULL DEFAULT '';
