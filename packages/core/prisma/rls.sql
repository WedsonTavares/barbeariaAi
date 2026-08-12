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

-- ProspectLead: carteira de prospecção da PLATAFORMA (empresas que queremos
-- vender). Não tem tenantId e por isso não entra no laço de isolamento abaixo —
-- não há tenant a que pertencer. Mesmo tratamento do `Tenant`: RLS ligada com
-- policy permissiva restrita ao app_runtime, para o Supabase não expor a tabela
-- via PostgREST para anon/authenticated.
-- ⚠️ Só o super admin lê e escreve aqui; a checagem é no app (requireSuperAdmin).
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProspectLead" TO app_runtime;
ALTER TABLE "ProspectLead" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospect_app_access ON "ProspectLead";
CREATE POLICY prospect_app_access ON "ProspectLead" FOR ALL TO app_runtime USING (true) WITH CHECK (true);

-- Metadados do Prisma. Não é tabela de tenant, mas fica em `public` e por isso
-- é exposta ao PostgREST — o linter do Supabase acusa como crítico e está certo.
-- Ninguém precisa lê-la pela API: as migrations rodam pelo DIRECT_URL como dono,
-- e o dono ignora RLS (não usamos FORCE aqui de propósito, senão quebraríamos o
-- próprio `prisma migrate`). Sem policy, qualquer outro papel enxerga 0 linhas.
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON "_prisma_migrations" FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON "_prisma_migrations" FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON "_prisma_migrations" FROM authenticated';
    END IF;
  END IF;
END $$;

-- Demais tabelas: RLS FORCE + policy por tenant + grants.
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'TenantSettings','Customer','Lead','Quote',
  'Service','Professional','ProfessionalService','Resource','WorkingSchedule',
  'TimeOff','Appointment','AppointmentService','CalendarConnection',
  'CalendarSubscription','Commission','WaitlistEntry',
  'Payment','Expense','AppointmentReminder','Notification','AuditLog',
  'Conversation','Message','PortfolioPhoto'
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
  SELECT id, "tenantId" FROM "AppointmentReminder"
  WHERE status = 'SCHEDULED' AND "fireAt" <= p_now
  ORDER BY "fireAt" LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION get_due_reminders(timestamptz) TO app_runtime;

-- (A função get_due_agent_conversations foi removida: o agente de IA roda inteiramente
--  no n8n agora, com contexto na própria tabela de memória do n8n.)
DROP FUNCTION IF EXISTS get_due_agent_conversations(int);
