import { prisma } from "../db/prisma";

/** Extrai o slug do subdomínio. Suporta produção e lvh.me em dev. */
export function slugFromHost(host: string | null, rootDomain: string): string | null {
  if (!host) return null;
  const hostname = (host.split(":")[0] ?? "").toLowerCase();
  if (hostname === rootDomain || hostname === `www.${rootDomain}`) return null;
  if (hostname.endsWith(`.${rootDomain}`)) return hostname.slice(0, -(rootDomain.length + 1));
  if (hostname.endsWith(".lvh.me")) return hostname.slice(0, -".lvh.me".length);
  if (hostname.endsWith(".localhost")) return hostname.slice(0, -".localhost".length);
  return null;
}

export async function getTenantBySlug(slug: string) {
  const t = await prisma.tenant.findUnique({ where: { slug } });
  return t?.active ? t : null; // tenant desativado = não existe para o app
}

/** Resolve por domínio personalizado e, se não houver, por subdomínio. Ignora tenants inativos. */
export async function getTenantByHost(host: string | null, rootDomain: string) {
  if (host) {
    const hostname = (host.split(":")[0] ?? "").toLowerCase();
    const byDomain = await prisma.tenant
      .findUnique({ where: { customDomain: hostname } })
      .catch(() => null);
    if (byDomain?.active) return byDomain;
  }
  const slug = slugFromHost(host, rootDomain);
  return slug ? getTenantBySlug(slug) : null;
}
