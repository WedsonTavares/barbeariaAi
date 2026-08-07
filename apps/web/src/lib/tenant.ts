import { cache } from "react";
import { headers } from "next/headers";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { AccessError, requireTenantAccess, services, type AuthContext } from "@barbearia-ai/core";
import { tenantFromHost } from "./tenant-resolution";

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
  return tenantFromHost(host);
});

/**
 * Para rotas /admin: garante tenant + acesso do usuário. Lança AccessError.
 * `cache()` evita repetir a query de tenant e a chamada ao Clerk quando layout
 * e página chamam isto na mesma request.
 */
export const requireTenant = cache(async function requireTenant() {
  const tenant = await resolveTenant();
  const ctx = await withMembership(await getAuthContext(), tenant?.clerkOrgId);
  requireTenantAccess(tenant, ctx);
  return { tenant, ctx };
});

/**
 * Multi-tenant por subdomínio: o tenant vem do host. Basta o usuário ser MEMBRO
 * da organização do tenant — não precisa ser a "organização ativa" do Clerk (que é um
 * estado global e conflita com abas de tenants diferentes). Se a org ativa não bater,
 * resolvemos pela membership (alinhado ao CLAUDE.md, regra 5: subdomínio + membership).
 */
async function withMembership(ctx: AuthContext, clerkOrgId?: string | null): Promise<AuthContext> {
  if (!clerkOrgId || !ctx.userId || ctx.isSuperAdmin || ctx.orgId === clerkOrgId) return ctx;
  const client = await clerkClient();
  const { data } = await client.users.getOrganizationMembershipList({ userId: ctx.userId });
  const membership = data.find((m) => m.organization.id === clerkOrgId);
  return membership ? { ...ctx, orgId: clerkOrgId, orgRole: membership.role } : ctx;
}

/**
 * Mesma garantia de `requireTenant`, mas com o tenant vindo de um id confiável
 * em vez do host.
 *
 * Existe para o retorno do OAuth do Google: o redirect URI registrado é um só,
 * então o Google devolve o usuário sempre no MESMO host, que pode não ser o
 * subdomínio da empresa que iniciou a conexão. Resolvendo pelo host, só o
 * primeiro tenant conseguia conectar — os demais batiam em "sem acesso".
 */
export async function requireTenantById(tenantId: string) {
  const tenant = await services.tenantService.get(tenantId);
  if (!tenant?.active) throw new AccessError("Empresa não encontrada");
  const ctx = await withMembership(await getAuthContext(), tenant.clerkOrgId);
  requireTenantAccess(tenant, ctx);
  return { tenant, ctx };
}
