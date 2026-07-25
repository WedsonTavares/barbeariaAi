import { withTenant } from "../db/withTenant";
import type { CustomerInput } from "../schemas";

export const customerService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.customer.findMany({ orderBy: { name: "asc" } })),
  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.customer.findFirst({ where: { id } })),
  /** Ficha do cliente: dados + todas as festas (itens, pagamentos), mais recente primeiro. */
  history: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) =>
      tx.customer.findFirst({
        where: { id },
        include: {
          bookings: {
            orderBy: { eventDate: "desc" },
            include: { items: { include: { toy: true } }, payments: true },
          },
        },
      })
    ),
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
