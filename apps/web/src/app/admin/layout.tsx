import { redirect } from "next/navigation";
import { AccessError, services } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { AdminSidebar } from "@/components/AdminSidebar";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let tenantName = "";
  let unreadCount = 0;
  try {
    const { tenant } = await requireTenant();
    tenantName = tenant.name;
    unreadCount = await services.notificationService.unreadCount(tenant.id).catch(() => 0);
  } catch (e) {
    if (e instanceof AccessError && e.message.includes("autenticado")) redirect("/sign-in");
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h1 className="text-xl font-bold">Sem acesso a esta empresa</h1>
          <p className="mt-2 text-[var(--color-muted)]">Sua conta não tem permissão para este painel. Troque de organização ou fale com o administrador.</p>
        </div>
      </main>
    );
  }
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar tenantName={tenantName} unreadCount={unreadCount} />
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
