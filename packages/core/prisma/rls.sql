-- ============================================================
-- RLS — rode DEPOIS de `prisma migrate`.
-- PRÉ-REQUISITO (rode 1x, troque a senha):
--   CREATE ROLE app_runtime LOGIN PASSWORD 'senha-forte' NOBYPASSRLS;
-- Em seguida: pnpm db:rls
-- ============================================================

GRANT USAGE ON SCHEMA public TO app_runtime;

-- Tenant: registro de tenants, SEM isolamento por linha (precisa ser lido p/ resolver subdomínio).
-- OBS: o Supabase habilita RLS por padrão em tabelas do schema public. Sem policy, o
-- app_runtime (NOBYPASSRLS) enxergaria 0 linhas. Mantemos RLS ligada, mas com policy
-- permissiva RESTRITA ao role app_runtime (anon/authenticated não têm grant → sem acesso).
GRANT SELECT, INSERT, UPDATE ON "Tenant" TO app_runtime;
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_app_access ON "Tenant";
CREATE POLICY tenant_app_access ON "Tenant" FOR ALL TO app_runtime USING (true) WITH CHECK (true);

-- Demais tabelas: RLS FORCE + policy por tenant + grants.
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'TenantSettings','Toy','Customer','Lead','Quote','Booking','BookingItem',
  'Payment','Expense','Maintenance','BookingReminder','Notification','AuditLog'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("tenantId" = current_setting(''app.current_tenant'', true)) '
      'WITH CHECK ("tenantId" = current_setting(''app.current_tenant'', true))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_runtime', t);
  END LOOP;
END $$;

-- Scheduler de lembretes: bypass controlado, retorna só id + tenantId.
CREATE OR REPLACE FUNCTION get_due_reminders(p_now timestamptz)
RETURNS TABLE (id text, "tenantId" text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, "tenantId" FROM "BookingReminder"
  WHERE status = 'SCHEDULED' AND "fireAt" <= p_now
  ORDER BY "fireAt" LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION get_due_reminders(timestamptz) TO app_runtime;

-- (A função get_due_agent_conversations foi removida: o agente de IA roda inteiramente
--  no n8n agora, com contexto na própria tabela de memória do n8n.)
DROP FUNCTION IF EXISTS get_due_agent_conversations(int);
