/*
  Warnings:

  - You are about to drop the `AgentConversation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AgentConversation" DROP CONSTRAINT "AgentConversation_tenantId_fkey";

-- DropTable
DROP TABLE "AgentConversation";
