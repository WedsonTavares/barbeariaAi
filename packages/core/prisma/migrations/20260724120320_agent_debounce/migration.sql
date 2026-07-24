-- AlterTable
ALTER TABLE "AgentConversation" ADD COLUMN     "lastMessageAt" TIMESTAMP(3),
ADD COLUMN     "pendingMessages" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "AgentConversation_lastMessageAt_idx" ON "AgentConversation"("lastMessageAt");
