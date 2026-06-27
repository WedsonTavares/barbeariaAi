import { withTenant } from "../db/withTenant";
import type { CustomerInput } from "../schemas";

export const customerService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.customer.findMany({ orderBy: { name: "asc" } })),
  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.customer.findFirst({ where: { id } })),
  create: (tenantId: string, data: CustomerInput) =>
    withTenant(tenantId, (tx) =>
      tx.customer.create({
        data: {
          tenantId,
          name: data.name,
          phone: data.phone,
          email: data.email || null,
          neighborhood: data.neighborhood,
          address: data.address,
          imageConsent: data.imageConsent ?? false,
        },
      })
    ),
};
