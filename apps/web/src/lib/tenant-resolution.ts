import { getTenantByHost, getTenantBySlug } from "@barbearia-ai/core";

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
export const PRIMARY_TENANT_SLUG = process.env.PRIMARY_TENANT_SLUG ?? "barbearia";
export const PRIMARY_TENANT_ON_ROOT = process.env.PRIMARY_TENANT_ON_ROOT === "true";

export async function tenantFromHost(host: string | null) {
  const tenant = await getTenantByHost(host, ROOT_DOMAIN);
  if (tenant) return tenant;

  const hostname = (host?.split(":")[0] ?? "").toLowerCase();
  const isRoot = hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`;
  if (PRIMARY_TENANT_ON_ROOT && isRoot) return getTenantBySlug(PRIMARY_TENANT_SLUG);

  return null;
}

export function tenantHost(slug: string) {
  return PRIMARY_TENANT_ON_ROOT ? ROOT_DOMAIN : `${slug}.${ROOT_DOMAIN}`;
}
