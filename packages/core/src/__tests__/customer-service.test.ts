import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { withTenant } from "../db/withTenant";
import { customerPhoneKey, toWhatsAppPhone } from "../phone";
import { customerService, CustomerDuplicateError } from "../services/customer-service";

const PRODUCTION_MARKERS = ["rzezilteejznqnmonhyi", "bfmhmmpkqgkjgrkpqjzv"];
const owner = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

let tenantId = "";
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

beforeAll(async () => {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean).join(" ");
  if (PRODUCTION_MARKERS.some((marker) => urls.includes(marker))) {
    throw new Error("Teste de clientes recusou executar contra produção.");
  }
  const tenant = await owner.tenant.create({
    data: {
      clerkOrgId: `org_customer_${suffix}`,
      slug: `customer-${suffix}`,
      name: "Teste de clientes",
    },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  if (tenantId) await owner.tenant.delete({ where: { id: tenantId } });
  await owner.$disconnect();
});

describe("diretório e segurança dos clientes", () => {
  it("trata número local e 55 como o mesmo WhatsApp", async () => {
    expect(customerPhoneKey("(16) 99999-1234")).toBe("16999991234");
    expect(customerPhoneKey("55 16 99999-1234")).toBe("16999991234");
    expect(toWhatsAppPhone("(16) 99999-1234")).toBe("5516999991234");

    const created = await customerService.create(tenantId, {
      name: "Cliente local",
      phone: "(16) 99999-1234",
      email: "",
    });
    expect(created.phone).toBe("5516999991234");
    await expect(
      customerService.create(tenantId, {
        name: "Duplicado",
        phone: "5516999991234",
        email: "",
      }),
    ).rejects.toBeInstanceOf(CustomerDuplicateError);
  });

  it("mostra conversa e leads ainda sem Customer uma única vez", async () => {
    await withTenant(tenantId, async (tx) => {
      await tx.conversation.create({
        data: {
          tenantId,
          phone: "5516999992234",
          contactName: ".",
          stage: "IA_ATENDENDO",
        },
      });
      await tx.lead.createMany({
        data: [
          {
            tenantId,
            phone: "16999992234",
            name: "Lead antigo",
            source: "WEBSITE",
            createdAt: new Date("2026-01-01T12:00:00Z"),
          },
          {
            tenantId,
            phone: "5516999992234",
            name: "Lead atual",
            source: "WHATSAPP",
            createdAt: new Date("2026-01-02T12:00:00Z"),
          },
          {
            tenantId,
            phone: "16999993334",
            name: "Lead sem conversa antigo",
            source: "WEBSITE",
            createdAt: new Date("2026-01-01T12:00:00Z"),
          },
          {
            tenantId,
            phone: "5516999993334",
            name: "Lead sem conversa atual",
            source: "WEBSITE",
            createdAt: new Date("2026-01-02T12:00:00Z"),
          },
        ],
      });
    });

    const entries = await customerService.directory(tenantId);
    const contact = entries.filter((entry) => customerPhoneKey(entry.phone) === "16999992234");
    const leadOnly = entries.filter((entry) => customerPhoneKey(entry.phone) === "16999993334");
    expect(contact).toHaveLength(1);
    expect(contact[0]).toMatchObject({ kind: "CONTACT", name: "Lead atual" });
    expect(leadOnly).toHaveLength(1);
    expect(leadOnly[0]).toMatchObject({ kind: "LEAD", name: "Lead sem conversa atual" });
  });

  it("abre na ficha uma conversa órfã gravada no formato com 55", async () => {
    const customer = await withTenant(tenantId, (tx) =>
      tx.customer.create({
        data: { tenantId, name: "Cliente legado", phone: "16999994444" },
      }),
    );
    const conversation = await withTenant(tenantId, (tx) =>
      tx.conversation.create({
        data: { tenantId, phone: "5516999994444", contactName: "Cliente legado" },
      }),
    );

    const history = await customerService.history(tenantId, customer.id);
    expect(history?.conversation?.id).toBe(conversation.id);
  });

  it("remove só cadastro descartável e preserva histórico ou dados divergentes", async () => {
    const disposable = await customerService.create(tenantId, {
      name: "Cadastro descartável",
      phone: "16999995555",
      email: "",
    });
    expect(await customerService.removeRegistration(tenantId, disposable.id)).toMatchObject({
      removed: true,
    });

    const withHistory = await customerService.create(tenantId, {
      name: "Com conversa",
      phone: "16999996666",
      email: "",
    });
    await withTenant(tenantId, (tx) =>
      tx.conversation.create({
        data: { tenantId, phone: "5516999996666", contactName: "Com conversa" },
      }),
    );
    expect(await customerService.removeRegistration(tenantId, withHistory.id)).toEqual({
      removed: false,
      reason: "HISTORY",
    });

    const [kept, conflicting] = await withTenant(tenantId, (tx) =>
      Promise.all([
        tx.customer.create({
          data: { tenantId, name: "Nome principal", phone: "5516999997777" },
        }),
        tx.customer.create({
          data: {
            tenantId,
            name: "Nome diferente",
            phone: "16999997777",
            email: "nao-perder@example.com",
          },
        }),
      ]),
    );
    expect(await customerService.removeRegistration(tenantId, conflicting.id)).toEqual({
      removed: false,
      reason: "DATA",
    });
    expect(await customerService.get(tenantId, kept.id)).not.toBeNull();
    expect(await customerService.get(tenantId, conflicting.id)).not.toBeNull();
  });

  it("não toma a conversa que já pertence a um terceiro cadastro duplicado", async () => {
    const [kept, discarded, third] = await withTenant(tenantId, (tx) =>
      Promise.all([
        tx.customer.create({
          data: {
            tenantId,
            name: "Mesmo cliente",
            phone: "5516999998888",
            createdAt: new Date("2026-01-01T12:00:00Z"),
          },
        }),
        tx.customer.create({
          data: {
            tenantId,
            name: "Mesmo cliente",
            phone: "16999998888",
            createdAt: new Date("2026-01-02T12:00:00Z"),
          },
        }),
        tx.customer.create({
          data: {
            tenantId,
            name: "Mesmo cliente",
            phone: "(16) 99999-8888",
            createdAt: new Date("2026-01-03T12:00:00Z"),
          },
        }),
      ]),
    );
    const [ownedByDiscarded, ownedByThird] = await withTenant(tenantId, (tx) =>
      Promise.all([
        tx.conversation.create({
          data: {
            tenantId,
            phone: "5516999998888",
            contactName: "Mesmo cliente",
            customerId: discarded.id,
          },
        }),
        tx.conversation.create({
          data: {
            tenantId,
            phone: "16999998888",
            contactName: "Mesmo cliente",
            customerId: third.id,
          },
        }),
      ]),
    );

    expect(await customerService.removeRegistration(tenantId, discarded.id)).toEqual({
      removed: true,
      replacementId: kept.id,
    });
    const conversations = await withTenant(tenantId, (tx) =>
      tx.conversation.findMany({
        where: { id: { in: [ownedByDiscarded.id, ownedByThird.id] } },
        select: { id: true, customerId: true },
      }),
    );
    expect(conversations).toEqual(
      expect.arrayContaining([
        { id: ownedByDiscarded.id, customerId: kept.id },
        { id: ownedByThird.id, customerId: third.id },
      ]),
    );
  });
});
