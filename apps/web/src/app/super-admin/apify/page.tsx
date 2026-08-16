import { Globe } from "lucide-react";

import { getAuthContext } from "@/lib/tenant";
import { flags } from "@/lib/flags";
import { BuscadorApify } from "./BuscadorApify";

export const dynamic = "force-dynamic";

/**
 * Prospecção pela Apify — fonte externa, ao lado do Google Places.
 *
 * Rota NOVA: a tela de Prospecção continua exatamente como está. São duas
 * fontes para o mesmo destino (a Carteira), e trocar uma pela outra jogaria
 * fora um caminho que já funciona.
 *
 * Com `FEATURE_APIFY` desligada a página existe mas não faz nada — explica o
 * que falta e não chama a Apify. É o mesmo princípio do resto: desligada, se
 * comporta como se não estivesse aqui.
 */
export default async function ApifyPage() {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="font-bold">Apenas super admin.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-8">
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Globe className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">Prospecção · Apify</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Busca negócios locais por região. Você escolhe o que importar para a Carteira.
          </p>
        </div>
      </header>

      {flags.apify ? (
        <BuscadorApify />
      ) : (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="font-bold">Extensão desligada</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Para ativar, defina no servidor:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--color-surface)] p-3 text-xs">
            {`FEATURE_APIFY=true\nAPIFY_TOKEN=<seu token da Apify>`}
          </pre>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            O token fica só no servidor — nunca é enviado ao navegador. Crie em{" "}
            <strong>apify.com → Settings → Integrations</strong>. Enquanto estiver desligada,
            nada muda no restante do sistema.
          </p>
        </section>
      )}
    </main>
  );
}
