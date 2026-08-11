-- Campos de PLATAFORMA sobre a loja (assinatura, links, notas do super admin).
-- Todos NULLABLE e sem default: a migration não toca em nenhuma linha existente
-- e não altera comportamento de nada que já roda.
--
-- Ficam em "Tenant" de propósito: é o único ponto de contexto de plataforma
-- sancionado (CLAUDE.md, regra 10). "Tenant" tem RLS habilitada, mas com policy
-- permissiva (tenant_app_access, USING true) e SEM FORCE — é assim porque a
-- tabela precisa ser lida antes de se saber qual é o tenant, para resolver o
-- subdomínio. As policies não referenciam coluna nenhuma, então acrescentar
-- colunas aqui não mexe na RLS.
ALTER TABLE "Tenant" ADD COLUMN "plan" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "monthlyFee" DECIMAL(10,2);
ALTER TABLE "Tenant" ADD COLUMN "paidUntil" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "lastPaymentAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "links" JSONB;
ALTER TABLE "Tenant" ADD COLUMN "adminNotes" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "setupSteps" JSONB;
