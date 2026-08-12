import { Radar } from "lucide-react";

import { getAuthContext } from "@/lib/tenant";
import { BuscadorLeads } from "./BuscadorLeads";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="font-bold">Apenas super admin.</p>
      </main>
    );
  }

  const semChave = !process.env.GOOGLE_MAPS_API_KEY;

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-8">
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Radar className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">Prospecção</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Barbearias e salões da região, ordenados por quem tem mais chance de fechar.
          </p>
        </div>
      </header>

      {semChave ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-bold">Falta a chave da Google Places API.</p>
          <ol className="ml-4 mt-2 list-decimal space-y-1">
            <li>No Google Cloud Console, habilite a <strong>Places API (New)</strong>.</li>
            <li>Crie uma chave e restrinja o uso a essa API.</li>
            <li>
              Adicione como <code>GOOGLE_MAPS_API_KEY</code> nas variáveis de ambiente da Vercel e faça um novo
              deploy.
            </li>
          </ol>
          <p className="mt-3">
            A chave fica só no servidor — ela nunca é enviada ao navegador.
          </p>
        </div>
      ) : (
        <BuscadorLeads />
      )}
    </main>
  );
}
