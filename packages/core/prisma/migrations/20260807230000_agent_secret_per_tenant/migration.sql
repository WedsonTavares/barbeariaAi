-- Segredo do agente por tenant. Coluna anulável: os tenants existentes
-- continuam funcionando pelo AGENT_API_SECRET global até receberem o seu.
ALTER TABLE "TenantSettings" ADD COLUMN "agentApiSecret" TEXT;
