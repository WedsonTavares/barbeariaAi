"use client";

/** Error boundary do painel: nada de stack trace pro usuário final. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60vh] place-items-center p-8 text-center">
      <div>
        <h1 className="text-xl font-bold">Algo deu errado</h1>
        <p className="mt-2 text-[var(--color-muted)]">
          A ação não pôde ser concluída. Tente novamente — se persistir, fale com o suporte.
        </p>
        {error.digest && <p className="mt-1 text-xs text-[var(--color-muted)]">Código: {error.digest}</p>}
        <button onClick={reset} className="mt-6 rounded-full bg-[var(--color-primary)] px-6 py-2 font-semibold text-white">
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
