-- Coluna "Interessado" no funil: quem a IA atendeu, quis marcar e não fechou.
-- Antes isso vivia numa aba separada (/admin/leads) e ninguém olhava; como etapa
-- da conversa, entra no mesmo quadro onde a equipe já trabalha.
--
-- Aditivo: nenhuma conversa existente muda de etapa.
ALTER TYPE "ConversationStage" ADD VALUE IF NOT EXISTS 'INTERESSADO';
