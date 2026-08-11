import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";

import { getAuthContext } from "@/lib/tenant";
import { ROOT_DOMAIN } from "@/lib/tenant-resolution";
import { Assistente } from "./Assistente";

export const dynamic = "force-dynamic";

export default async function NovaLojaPage() {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="font-bold">Apenas super admin.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-8">
      <Link
        href="/super-admin"
        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="size-4" /> Super Admin
      </Link>

      <header className="mt-4 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Store className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">Nova loja</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Seis etapas. Faça na ordem — cada uma depende da anterior.
          </p>
        </div>
      </header>

      <Assistente rootDomain={ROOT_DOMAIN} />
    </main>
  );
}
