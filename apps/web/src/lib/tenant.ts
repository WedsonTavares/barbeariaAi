import { cache } from "react";
import { headers } from "next/headers";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTenantByHost, requireTenantAccess, type AuthContext } from "@diny/core";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

/** Monta o AuthContext a partir da sessão do Clerk (executa no servidor). */
export const getAuthContext = cache(async function getAuthContext(): Promise<AuthContext> {
  const a = await auth();
  const role = (a.sessionClaims?.metadata as { role?: string } | undefined)?.role;
  return {
    userId: a.userId,
    orgId: a.orgId ?? null,
    orgRole: a.orgRole ?? null,
    isSuperAdmin: role === "super_admin",
  };
});

/** Resolve o tenant pelo host (subdomínio ou domínio personalizado). Cacheado por request. */
export const resolveTenant = cache(async function resolveTenant() {
  const host = (await headers()).get("host");
  return getTenantByHost(host, ROOT);
});

/**
 * Para rotas /admin: garante tenant + acesso do usuário. Lança AccessError.
 * `cache()` evita repetir a query de tenant e a chamada ao Clerk quando layout
 * e página chamam isto na mesma request.
 */
export const requireTenant = cache(async function requireTenant() {
  const tenant = await resolveTenant();
  let ctx = await getAuthContext();

  // Multi-tenant por subdomínio: o tenant já vem do host. Basta o usuário ser MEMBRO
  // da organização do tenant — não precisa ser a "organização ativa" do Clerk (que é um
  // estado global e conflita com abas de tenants diferentes). Se a org ativa não bater,
  // resolvemos pela membership (alinhado ao CLAUDE.md, regra 5: subdomínio + membership).
  if (tenant && ctx.userId && !ctx.isSuperAdmin && ctx.orgId !== tenant.clerkOrgId) {
    const client = await clerkClient();
    const { data } = await client.users.getOrganizationMembershipList({ userId: ctx.userId });
    const membership = data.find((m) => m.organization.id === tenant.clerkOrgId);
    if (membership) {
      ctx = { ...ctx, orgId: tenant.clerkOrgId, orgRole: membership.role };
    }
  }

  requireTenantAccess(tenant, ctx);
  return { tenant, ctx };
});
