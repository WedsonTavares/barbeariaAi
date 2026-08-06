/**
 * Testes de ISOLAMENTO (integração). Requisitos:
 *  - DATABASE_URL apontando para um banco de TESTE com o role app_runtime (sem BYPASSRLS)
 *  - migrations + prisma/rls.sql aplicados nesse banco
 * Se rodar com um role superusuário/BYPASSRLS, o teste "fail-closed" vai falhar de propósito.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../db/prisma";
import { withTenant } from "../db/withTenant";

// Ref do projeto de PRODUÇÃO (Supabase) — os testes upsertam/criam linhas de
// verdade; rodar isto contra produção cria tenants "test-a"/"test-b" e um
// cliente fake lá. Trocar DATABASE_URL/DIRECT_URL em packages/core/.env para
// um banco de teste antes de rodar `pnpm test`.
const PRODUCTION_MARKERS = ["rzezilteejznqnmonhyi", "bfmhmmpkqgkjgrkpqjzv"];

function assertNotProductionDatabase() {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean).join(" ");
  if (PRODUCTION_MARKERS.some((m) => urls.includes(m))) {
    throw new Error(
      "DATABASE_URL/DIRECT_URL apontam para o banco de PRODUÇÃO. " +
      "Configure um banco de TESTE em packages/core/.env antes de rodar os testes de isolamento."
    );
  }
}

let a: string;
let b: string;

beforeAll(async () => {
  assertNotProductionDatabase();
  const ta = await prisma.tenant.upsert({ where: { slug: "test-a" }, update: {}, create: { slug: "test-a", name: "Empresa A", clerkOrgId: "org_test_a" } });
  const tb = await prisma.tenant.upsert({ where: { slug: "test-b" }, update: {}, create: { slug: "test-b", name: "Empresa B", clerkOrgId: "org_test_b" } });
  a = ta.id;
  b = tb.id;
  await withTenant(a, (tx) => tx.customer.create({ data: { tenantId: a, name: "Cliente A", phone: "16000000000" } }));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("isolamento por tenant (RLS)", () => {
  it("tenant B não enxerga clientes do tenant A", async () => {
    const seen = await withTenant(b, (tx) => tx.customer.findMany());
    expect(seen.every((c) => c.tenantId === b)).toBe(true);
    expect(seen.find((c) => c.name === "Cliente A")).toBeUndefined();
  });

  it("fail-closed: sem contexto de tenant, nada é retornado", async () => {
    const seen = await prisma.customer.findMany();
    expect(seen).toHaveLength(0);
  });

  it("WITH CHECK impede inserir em outro tenant", async () => {
    await expect(
      withTenant(b, (tx) => tx.customer.create({ data: { tenantId: a, name: "Invasor", phone: "1" } }))
    ).rejects.toThrow();
  });
});
