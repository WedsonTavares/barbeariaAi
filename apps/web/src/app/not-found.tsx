import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-8 text-center">
      <div>
        <h1 className="text-2xl font-extrabold">Página não encontrada</h1>
        <p className="mt-2 text-[var(--color-muted)]">O endereço que você acessou não existe.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-[var(--color-primary)] px-6 py-2 font-semibold text-white">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
