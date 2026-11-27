-- Atendimentos do suporte numerados (decisão #177): a tela mostra só o atendimento atual; nada é apagado.
-- Todas as mensagens existentes entram no atendimento 1 (as conversas já encerradas passam a aparecer limpas e o histórico vai para "Atendimentos anteriores").
ALTER TABLE "SuporteConversa" ADD COLUMN "atendimentoAtual" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SuporteMensagem" ADD COLUMN "atendimento" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "SuporteMensagem_conversaId_atendimento_idx" ON "SuporteMensagem"("conversaId", "atendimento");
