-- CreateEnum
CREATE TYPE "ConversationStage" AS ENUM ('NOVO_LEAD', 'IA_ATENDENDO', 'SUPORTE_HUMANO', 'AGENDADO', 'POS_FESTA');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "stage" "ConversationStage" NOT NULL DEFAULT 'NOVO_LEAD';
