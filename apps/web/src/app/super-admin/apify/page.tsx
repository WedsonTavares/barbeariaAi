import { Globe } from "lucide-react";

import { getAuthContext } from "@/lib/tenant";
import { flags } from "@/lib/flags";
import { BuscadorApify } from "./BuscadorApify";
import { ChaveApify } from "./ChaveApify";

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
        <>
          {/* A troca de chave vem antes da busca de propósito: quando os
              créditos acabam, é aqui que o trabalho destrava. */}
          <ChaveApify />
          <BuscadorApify />
        </>
      ) : (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="font-bold">Extensão desligada</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Para ativar, defina no servidor:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--color-surface)] p-3 text-xs">
            {`FEATURE_APIFY=true`}
          </pre>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Só a flag é obrigatória. A <strong>chave da Apify</strong> você cola nesta
            mesma tela depois de ligar — ela fica cifrada no banco e é trocável a
            qualquer momento, sem redeploy. Se preferir, ainda dá para deixá-la no
            servidor como <code>APIFY_TOKEN</code>; a da tela tem prioridade. Em
            nenhum dos dois casos ela é enviada ao navegador. Enquanto a flag
            estiver desligada, nada muda no restante do sistema.
          </p>
        </section>
      )}
    </main>
  );
}
