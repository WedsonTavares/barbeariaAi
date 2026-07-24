import { prisma } from "../db/prisma";
import { withTenant } from "../db/withTenant";

/** Operações de plataforma (Tenant não tem RLS) + leitura de settings por tenant. */
export const tenantService = {
  get: (tenantId: string) => prisma.tenant.findUnique({ where: { id: tenantId } }),
  getSettings: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.tenantSettings.findUnique({ where: { tenantId } })),
  updateSettings: (tenantId: string, data: Record<string, unknown>) =>
    withTenant(tenantId, (tx) =>
      tx.tenantSettings.upsert({
        where: { tenantId },
        update: data,
        create: { tenantId, ...data },
      })
    ),
  // plataforma / super-admin
  listAll: () => prisma.tenant.findMany({ orderBy: { createdAt: "desc" } }),
  createFromClerkOrg: (clerkOrgId: string, slug: string, name: string) =>
    prisma.tenant.upsert({
      where: { clerkOrgId },
      update: { name, slug },
      create: { clerkOrgId, slug, name, settings: { create: {} } },
    }),
  /** organization.deleted no Clerk → desativa (soft delete; dados ficam para auditoria). */
  deactivateByClerkOrg: (clerkOrgId: string) =>
    prisma.tenant.updateMany({ where: { clerkOrgId }, data: { active: false } }),
};
