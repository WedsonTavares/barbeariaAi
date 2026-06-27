import { services } from "@diny/core";
import { getAuthContext } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return <main className="grid min-h-screen place-items-center p-8"><p className="font-bold">Apenas super admin.</p></main>;
  }
  const tenants = await services.tenantService.listAll();
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-extrabold">Super Admin — Tenants</h1>
      <div className="mt-6 overflow-hidden rounded-2xl border border-black/5 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]"><tr><th className="p-3">Empresa</th><th className="p-3">Slug</th><th className="p-3">Clerk Org</th><th className="p-3">Ativa</th></tr></thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-t border-black/5"><td className="p-3 font-semibold">{t.name}</td><td className="p-3">{t.slug}</td><td className="p-3 text-xs">{t.clerkOrgId}</td><td className="p-3">{t.active ? "sim" : "não"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
