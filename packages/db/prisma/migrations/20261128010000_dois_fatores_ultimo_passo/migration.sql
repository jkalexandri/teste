-- Código do app autenticador de uso único (decisão #161 — S6 do Módulo 1): guarda o último intervalo de 30 s aceito
ALTER TABLE "Usuario" ADD COLUMN "doisFatoresUltimoPasso" INTEGER;
