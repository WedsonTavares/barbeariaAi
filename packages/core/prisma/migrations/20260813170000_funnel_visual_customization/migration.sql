-- Personalização visual do funil por tenant, sem alterar os estágios funcionais.
ALTER TABLE "TenantSettings" ADD COLUMN "funnelConfig" JSONB;
ALTER TABLE "Conversation" ADD COLUMN "funnelColumnId" TEXT;
