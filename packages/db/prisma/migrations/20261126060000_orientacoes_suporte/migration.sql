-- Orientações do suporte (decisão #148): texto do Super Admin lido só pela IA do suporte dos clientes
ALTER TABLE "FichaEmpresa" ADD COLUMN "orientacoesSuporte" TEXT NOT NULL DEFAULT '';
