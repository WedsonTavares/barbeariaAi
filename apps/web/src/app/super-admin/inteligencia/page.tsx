import { Sparkles } from "lucide-react";

import { getAuthContext } from "@/lib/tenant";
import { flags } from "@/lib/flags";
import { Conversa } from "./Conversa";

export const dynamic = "force-dynamic";

/**
 * Inteligência Comercial — a interface do Hermes no Super Admin.
 *
 * Rota nova; nenhuma tela existente foi substituída. Com `FEATURE_HERMES`
 * desligada a página explica o que falta e não chama nada — e o item nem
 * aparece no menu.
 */
export default async function InteligenciaPage() {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="font-bold">Apenas super admin.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col p-6 sm:p-8">
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">Inteligência Comercial</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Lê sua carteira e seu funil. Observa e recomenda — não executa nada.
          </p>
        </div>
      </header>

      {flags.hermes ? (
        <Conversa />
      ) : (
        <section className="mt-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          <h2 className="font-bold">Extensão desligada</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Para ativar, suba o serviço Hermes e defina no servidor:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--color-surface)] p-3 text-xs">
            {`FEATURE_HERMES=true\nHERMES_URL=https://hermes.seudominio.com.br\nHERMES_SECRET=<segredo compartilhado>\nHERMES_TOOLS_SECRET=<segredo das ferramentas>`}
          </pre>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            O Hermes roda como serviço próprio, fora desta aplicação. Ele não tem
            credencial do banco nem do Clerk — só consegue ler pelas ferramentas
            aprovadas. Enquanto estiver desligado, nada muda no restante do sistema.
          </p>
        </section>
      )}
    </main>
  );
}
