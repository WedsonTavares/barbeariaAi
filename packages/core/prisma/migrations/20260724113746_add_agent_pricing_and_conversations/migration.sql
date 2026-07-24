-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "minRentalHours" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "minRentalPrice" DECIMAL(10,2) NOT NULL DEFAULT 150;

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "leadId" TEXT,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentConversation_tenantId_idx" ON "AgentConversation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConversation_tenantId_phone_key" ON "AgentConversation"("tenantId", "phone");

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
