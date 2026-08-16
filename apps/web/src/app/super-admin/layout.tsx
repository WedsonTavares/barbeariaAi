import { getAuthContext } from "@/lib/tenant";
import { flags } from "@/lib/flags";
import { SuperAdminSidebar } from "./SuperAdminSidebar";

/**
 * Layout da área de plataforma.
 *
 * A checagem de super admin fica AQUI, e não só nas páginas: assim a sidebar
 * (que lista as telas da plataforma) nem chega a ser renderizada pra quem não
 * pode entrar. As páginas mantêm a checagem delas de propósito — layout no
 * Next não é fronteira de segurança, é composição. Quem protege de verdade é a
 * combinação com o `auth.protect()` do middleware.
 */
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="font-bold">Apenas super admin.</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface)] md:flex-row">
      <SuperAdminSidebar apify={flags.apify} hermes={flags.hermes} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
