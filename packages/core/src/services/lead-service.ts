import { withTenant } from "../db/withTenant";
import type { LeadInput } from "../schemas";
import type { LeadStatus } from "@prisma/client";

export const leadService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.lead.findMany({ orderBy: { createdAt: "desc" } })),
  create: (tenantId: string, data: LeadInput) =>
    withTenant(tenantId, (tx) => tx.lead.create({ data: { tenantId, ...data } })),
  setStatus: (tenantId: string, id: string, status: LeadStatus) =>
    withTenant(tenantId, (tx) => tx.lead.update({ where: { id }, data: { status } })),
};
