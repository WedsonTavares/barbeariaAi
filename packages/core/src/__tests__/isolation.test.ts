/**
 * Testes de ISOLAMENTO (integração). Requisitos:
 *  - DATABASE_URL apontando para um banco de TESTE com o role app_runtime (sem BYPASSRLS)
 *  - migrations + prisma/rls.sql aplicados nesse banco
 * Se rodar com um role superusuário/BYPASSRLS, o teste "fail-closed" vai falhar de propósito.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../db/prisma";
import { withTenant } from "../db/withTenant";

// A trava de "banco proibido" vive em `vitest.config.ts` (FORBIDDEN_DATABASES),
// não aqui: ela precisa valer para TODOS os testes que tocam o banco, não só
// para este arquivo. Havia uma segunda lista neste ponto e ela ficou
// desatualizada — sem o projeto do Diny Festas —, então os testes escreviam
// tenants "test-a"/"test-b" dentro do banco de outro produto.

let a: string;
let b: string;

beforeAll(async () => {
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

/**
 * Conexões de agenda com a conta de serviço da PLATAFORMA.
 *
 * No OAuth, o token era por empresa: um erro de código não alcançava a agenda
 * de outra, porque faltaria a credencial. Com a conta de serviço a credencial é
 * a mesma para todo mundo, e o que separa uma empresa da outra passa a ser o
 * `calendarId`. Estes testes existem para que essa fronteira quebre o build se
 * alguém a abrir — em vez de vazar agendamento de um cliente na agenda de outro.
 */
describe("isolamento das conexões de agenda", () => {
  beforeAll(async () => {
    await withTenant(a, (tx) =>
      tx.calendarConnection.create({
        data: {
          tenantId: a,
          provider: "GOOGLE_SERVICE_ACCOUNT",
          calendarId: "agenda-da-empresa-a@example.com",
          googleAccountEmail: "agenda-da-empresa-a@example.com",
          status: "ACTIVE",
        },
      })
    );
  });

  it("tenant B não enxerga o calendarId do tenant A", async () => {
    const seen = await withTenant(b, (tx) => tx.calendarConnection.findMany());
    expect(seen.every((c) => c.tenantId === b)).toBe(true);
    expect(seen.find((c) => c.calendarId === "agenda-da-empresa-a@example.com")).toBeUndefined();
  });

  it("fail-closed: sem contexto de tenant, nenhuma conexão é retornada", async () => {
    expect(await prisma.calendarConnection.findMany()).toHaveLength(0);
  });

  it("listGoogleConnections do tenant B não devolve a conexão do tenant A", async () => {
    const { calendarService } = await import("../services/calendar-service");
    const seen = await calendarService.listGoogleConnections(b);
    expect(seen.every((c) => c.tenantId === b)).toBe(true);
  });

  it("WITH CHECK impede gravar uma conexão no tenant do outro", async () => {
    await expect(
      withTenant(b, (tx) =>
        tx.calendarConnection.create({
          data: {
            tenantId: a,
            provider: "GOOGLE_SERVICE_ACCOUNT",
            calendarId: "sequestrada@example.com",
            status: "ACTIVE",
          },
        })
      )
    ).rejects.toThrow();
  });
});
