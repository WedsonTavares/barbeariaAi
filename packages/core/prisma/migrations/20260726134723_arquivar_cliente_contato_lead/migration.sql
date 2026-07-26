-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Conversation_tenantId_archivedAt_idx" ON "Conversation"("tenantId", "archivedAt");

-- CreateIndex
CREATE INDEX "Customer_tenantId_archivedAt_idx" ON "Customer"("tenantId", "archivedAt");

-- CreateIndex
CREATE INDEX "Lead_tenantId_archivedAt_idx" ON "Lead"("tenantId", "archivedAt");
