# CLAUDE.md — Contexto do projeto (leia antes de tudo)

Você (Claude Code) vai continuar o **Diny SaaS**: plataforma **multi-tenant** para locação de brinquedos de festa. Hoje atende 2 empresas (Dine Play + a da irmã) com **isolamento total de dados**, e a arquitetura está pronta pra virar produto no futuro. Trabalhe sempre respeitando as regras abaixo.

## Stack (TRAVADA — não troque sem pedir)
- Next.js 16 (App Router) · React 19 · TypeScript 5.9
- Tailwind CSS v4 · shadcn/ui (ainda NÃO instalado) · lucide-react
- **Clerk Organizations** (auth + tenants + roles + convites)
- **Supabase** (Postgres + RLS + Storage + Realtime)
- **Prisma 6** (acesso ao banco)
- **BullMQ + Redis** na VPS (workers/lembretes) · PM2
- Recharts · React Hook Form · Zod · date-fns
- Monorepo **pnpm workspaces** + Turborepo · Node 24

## Arquitetura (3 peças)
- `apps/web` — Next.js (Vercel). **Front + back juntos**: páginas, server actions, API routes, webhooks.
- `apps/worker` — processos BullMQ na VPS (lembretes/filas). Só executa; sem regra própria.
- `packages/core` — **toda a regra de negócio** (Prisma, services, withTenant, zod, cálculos). Web e worker importam daqui.
- Fonte da verdade = **Supabase Postgres**. Web↔Worker se comunicam **pelo banco** (não por Redis exposto).

## REGRAS INEGOCIÁVEIS (isolamento por tenant)
1. **Toda tabela operacional tem `tenantId`** + índice `@@index([tenantId])`.
2. **RLS `FORCE`** em todas as tabelas operacionais (ver `packages/core/prisma/rls.sql`). O isolamento é garantido pelo banco.
3. **Todo acesso ao banco passa por um service em `packages/core` + `withTenant()`**. NUNCA use `prisma` direto dentro de `apps/*` para dados de tenant.
4. `withTenant(tenantId, fn)` abre uma transação e faz `set_config('app.current_tenant', tenantId, true)`; as policies RLS leem esse valor. Fora dele, RLS retorna 0 linhas (fail-closed).
5. **Nunca confie em `tenantId` vindo do frontend.** No web, o tenant é resolvido por subdomínio (`getTenantByHost`) + membership do Clerk (`requireTenantAccess`). No worker/webhook, vem de origem confiável (linha do banco / identificador da integração).
6. Runtime conecta como role **`app_runtime` (NOBYPASSRLS)** via `DATABASE_URL` (pooler/pgbouncer). Migrations usam `DIRECT_URL` (owner). **Depois de todo `migrate`, rode `pnpm db:rls`.**
7. **Regra de negócio só em `packages/core`.** `apps/web` e `apps/worker` apenas chamam services. Não duplique lógica.
8. Clerk Organization = Tenant (`Tenant.clerkOrgId`). Roles: OWNER/ADMIN/STAFF. `SUPER_ADMIN` é flag de plataforma.
9. **Clerk + Supabase:** o Supabase é usado como Postgres (via Prisma) + Storage + Realtime. A RLS usa o GUC `app.current_tenant`, **não** o `auth.uid()` do Supabase Auth.
10. Bypass de RLS só em pontos controlados e auditáveis: `get_due_reminders()` (scheduler) e contexto de plataforma do super-admin. Tudo o mais é escopado.

## O que JÁ EXISTE (Fase 1 — fundação rodável)
> É um scaffold funcional e tipado; pode precisar de pequenos ajustes no primeiro `pnpm install`/`build`.

**`packages/core`**
- `prisma/schema.prisma` — entidades: Tenant, TenantSettings, Toy, Customer, Lead, Quote, Booking, BookingItem, Payment, Expense, Maintenance, BookingReminder, Notification, AuditLog (+ enums).
- `prisma/rls.sql` — ENABLE/FORCE RLS + policy `tenant_isolation` por tabela + grants p/ `app_runtime` + função `get_due_reminders`.
- `prisma/seed.ts` — cria 2 tenants (dineplay, irma) + settings + 3 brinquedos cada.
- `src/db/prisma.ts`, `src/db/withTenant.ts` (`withTenant`, `platformDb`, `Tx`).
- `src/tenant/resolve.ts` (`getTenantByHost`, `getTenantBySlug`, `slugFromHost`).
- `src/auth/permissions.ts` (`AuthContext`, `requireTenantAccess`, `requireRole`, `requireSuperAdmin`, `AccessError`).
- `src/schemas/index.ts` (zod: toy/customer/booking/lead).
- `src/calculations.ts` (lucro, payback, ticket médio, conversão).
- `src/services/*` — toy, customer, lead, booking (com `checkAvailability` + `BookingConflictError` + `confirm` que gera lembretes), payment (atualiza paymentStatus), expense, finance (`dashboard`, `monthSummary`), reminder, notification, tenant.

**`apps/web`**
- `src/middleware.ts` — Clerk + `auth.protect()` em `/admin` e `/super-admin`.
- `src/lib/tenant.ts` — `getAuthContext()` (do Clerk), `resolveTenant()`, `requireTenant()`.
- `src/app/layout.tsx` — ClerkProvider. `src/app/sign-in/...` — `<SignIn/>`.
- `src/app/(site)/page.tsx` — **site público mínimo por tenant** (headline/CTA/brinquedos do banco). NÃO é a landing premium ainda.
- `src/app/admin/*` — layout com guarda, dashboard (cards + próximas retiradas), brinquedos (lista+criar), clientes (lista+criar), reservas (lista+criar com checagem de conflito, confirmar, registrar sinal), financeiro (resumo + lançar custo).
- `src/app/super-admin/page.tsx` — lista de tenants (só SUPER_ADMIN).
- `src/app/api/webhooks/clerk/route.ts` — `organization.created` → cria Tenant.

**`apps/worker`**
- `src/index.ts` — fila BullMQ + "tick" repetível (60s).
- `src/reminder-worker.ts` — `get_due_reminders()` → processa cada um em `withTenant` → cria Notification → marca SENT.
- `ecosystem.config.cjs` — PM2.

**Testes:** `packages/core/src/__tests__/isolation.test.ts` (B não lê A, fail-closed, WITH CHECK).

## O que FALTA (gaps conhecidos — não assuma que está pronto)
- **shadcn/ui não instalado** (UI atual é Tailwind cru). Instalar e refazer os componentes com shadcn.
- **Site público é mínimo** — portar a landing premium da Diny como template do tenant (`SITE_BUILDER`), puxando cores/textos/brinquedos de `TenantSettings`.
- **Realtime das notificações** no dashboard (sino/badge/toast) ainda não ligado (Fase 2).
- **Editar reserva** (e recalcular lembretes via `reminderService.reschedule`) não tem tela.
- Faltam: agenda (calendário), conversas/WhatsApp, Google Calendar, n8n, manutenção+checklists, relatórios (Recharts), tela de configurações do tenant, upload de imagens (Supabase Storage).
- **Sem CI.** Testes de isolamento precisam de um banco de TESTE com `app_runtime` + rls aplicado.
- Storage/Realtime do Supabase ainda não usados em código.

## Como PROCEDER (nesta ordem)
1. Leia este arquivo e o `README.md`. Não quebre as REGRAS INEGOCIÁVEIS.
2. `pnpm install`. Resolva conflitos de versão/peer **sem trocar a stack travada**. Confirme as APIs do Clerk v6 (`auth()` → `userId/orgId/orgRole/sessionClaims`), Prisma 6 + pgbouncer, Tailwind v4 + Next 16, e `transpilePackages: ["@diny/core"]` (core exporta `.ts`).
3. Configure `.env` (peça as credenciais do Supabase/Clerk ao usuário; use placeholders se não tiver). Crie o role: `CREATE ROLE app_runtime LOGIN PASSWORD '...' NOBYPASSRLS;`.
4. `pnpm db:generate && pnpm db:migrate && pnpm db:rls && pnpm db:seed`.
5. `pnpm typecheck` e `pnpm --filter @diny/web build` — corrija erros de tipo.
6. Valide o caminho feliz: site público por tenant; `/admin` protegido; criar brinquedo/cliente/reserva; **conflito de brinquedo é bloqueado**; registrar sinal muda o `paymentStatus`; dashboard mostra números. Rode os testes de isolamento num banco de teste.
7. Só então continue pelo `ROADMAP` (terminar Fase 1: shadcn/ui, configurações do tenant, editar reserva + reschedule de lembretes; depois Fase 2).

## Convenções ao adicionar coisas
- Nova tabela operacional: `tenantId` + índice → adicione ao array de `rls.sql` → crie service em `packages/core` → use `withTenant`. Nunca consulte no app.
- Toda rota `/admin`: `requireTenant()`; ações sensíveis: `requireRole(ctx, [...])`.
- Valide entrada com Zod (`packages/core/src/schemas`).
- Mantenha `apps/*` finos; lógica em `packages/core`.
- Rode `pnpm db:rls` depois de cada `migrate`.

## Definition of done (tarefa imediata)
- `pnpm install`, `pnpm typecheck` e build do web/worker **verdes**.
- App roda local; cria reserva com prevenção de conflito; dashboard com números reais; site público por tenant.
- Testes de isolamento passam num banco de teste.
- Nenhuma query de dados de tenant fora de service/`withTenant`.
