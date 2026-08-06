import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessError, services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminTopbar } from "@/components/AdminTopbar";

export const dynamic = "force-dynamic";

/**
 * Instalável como app, mas SÓ o painel: o manifest é declarado aqui e não no
 * layout raiz, senão um cliente na vitrine receberia convite pra instalar um
 * painel que ele não consegue abrir. O arquivo em si mora fora de /admin
 * porque o Clerk protege esta rota e o navegador busca manifest sem
 * credenciais (ver painel.webmanifest/route.ts).
 */
export const metadata: Metadata = {
  manifest: "/painel.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Painel" },
  icons: { apple: "/apple-touch-icon.png" },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let tenantName = "";
  let unreadCount = 0;
  try {
    const { tenant } = await requireTenant();
    tenantName = tenant.name;
    unreadCount = await services.notificationService.unreadCount(tenant.id).catch(() => 0);
  } catch (e) {
    if (e instanceof AccessError && e.message.includes("autenticado")) redirect("/sign-in");
    const message = e instanceof AccessError ? e.message : "Não foi possível validar o acesso.";
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h1 className="text-xl font-bold">Sem acesso a esta empresa</h1>
          <p className="mt-2 text-[var(--color-muted)]">{message}</p>
        </div>
      </main>
    );
  }
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar tenantName={tenantName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar unreadCount={unreadCount} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
