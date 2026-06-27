# Diny SaaS — Fase 1 (multi-tenant + RLS)

Monorepo: `apps/web` (Next.js/Vercel) · `apps/worker` (BullMQ/VPS) · `packages/core` (regra de negócio compartilhada).

## Pré-requisitos
- Node 24, pnpm 9, um projeto Supabase, uma app Clerk (com Organizations), e (Fase 2) Redis na VPS.

## Setup
```bash
pnpm install

# 1) Env: copie e preencha
cp .env.example packages/core/.env        # DATABASE_URL + DIRECT_URL (Prisma)
cp .env.example apps/web/.env.local       # Clerk + Supabase + domínio
cp .env.example apps/worker/.env          # DATABASE_URL + REDIS_URL

# 2) Banco
pnpm db:generate
pnpm db:migrate            # cria as tabelas (usa DIRECT_URL)
pnpm db:rls                # aplica RLS + função get_due_reminders
pnpm db:seed              # cria 2 tenants de exemplo + brinquedos

# 3) Rodar
pnpm --filter @diny/web dev      # http://dineplay.lvh.me:3000
pnpm --filter @diny/worker dev   # worker (Fase 2 liga lembretes reais)
```

> **IMPORTANTE:** antes do `db:rls`, crie o role no Supabase: `CREATE ROLE app_runtime LOGIN PASSWORD 'senha' NOBYPASSRLS;`. O `DATABASE_URL` do runtime usa `app_runtime`; o `DIRECT_URL` (owner) é só para migrations.

## Subdomínios em dev
Use `lvh.me`: `http://dineplay.lvh.me:3000` e `http://irma.lvh.me:3000`. O `/admin` exige login no Clerk com organização ligada ao tenant.

## Estrutura
- Regra de negócio: `packages/core/src/services` (web e worker importam daqui — nunca duplicar).
- Isolamento: `packages/core/src/db/withTenant.ts` + `packages/core/prisma/rls.sql`.
