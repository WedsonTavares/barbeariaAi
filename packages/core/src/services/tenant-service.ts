import { prisma } from "../db/prisma";
import { withTenant } from "../db/withTenant";

/** Instância do Evolution deste tenant (settings lidos dentro do próprio tenant). */
async function resolveInstance(tenantId: string, slug: string) {
  const s = await withTenant(tenantId, (tx) =>
    tx.tenantSettings.findUnique({ where: { tenantId }, select: { evolutionInstance: true } })
  );
  return s?.evolutionInstance?.trim() || slug;
}

/** Operações de plataforma (Tenant não tem RLS) + leitura de settings por tenant. */
export const tenantService = {
  get: (tenantId: string) => prisma.tenant.findUnique({ where: { id: tenantId } }),
  getSettings: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.tenantSettings.findUnique({ where: { tenantId } })),
  /**
   * Instância do Evolution (WhatsApp) deste tenant. Cada empresa tem a sua —
   * é o que impede uma empresa de ver/desconectar o WhatsApp da outra.
   * Fallback: o slug do tenant (assim um tenant novo já nasce isolado).
   */
  evolutionInstance: (tenantId: string, slug: string) => resolveInstance(tenantId, slug),
  /**
   * Caminho inverso: dado o nome da instância do Evolution, descobre de QUEM é.
   * É o que permite um único workflow do n8n atender vários tenants sem risco de
   * misturar: quem decide o dono da mensagem é a instância que a recebeu, não a
   * URL configurada no canvas.
   *
   * Cada leitura de settings continua passando por `withTenant` (nada de bypass
   * de RLS): varremos os tenants ativos e comparamos a instância configurada.
   * São poucos tenants; se um dia forem muitos, cacheia aqui — não solta a RLS.
   */
  byEvolutionInstance: async (instance: string) => {
    const target = instance.trim().toLowerCase();
    if (!target) return null;
    const tenants = await prisma.tenant.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    for (const t of tenants) {
      const configured = await resolveInstance(t.id, t.slug);
      if (configured.trim().toLowerCase() === target) return t;
    }
    return null;
  },
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
