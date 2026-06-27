import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl, waUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TenantHome() {
  const tenant = await resolveTenant();
  if (!tenant) {
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold">Plataforma Diny</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            Acesse pelo subdomínio da sua empresa (ex.: dineplay.{process.env.NEXT_PUBLIC_ROOT_DOMAIN}).
          </p>
        </div>
      </main>
    );
  }

  const settings = await services.tenantService.getSettings(tenant.id);
  const toys = await services.toyService.list(tenant.id);
  const wa = waUrl(settings?.whatsappMain, "Olá! Vim pelo site e quero um orçamento.");

  return (
    <main className="min-h-screen">
      <section className="bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] px-6 py-24 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold sm:text-5xl">{settings?.headline ?? tenant.name}</h1>
          <p className="mt-4 text-lg text-white/90">{settings?.subheadline ?? "Diversão sem dor de cabeça."}</p>
          <a href={wa} target="_blank" rel="noopener" className="mt-8 inline-block rounded-full bg-[#25D366] px-8 py-4 font-bold">
            {settings?.ctaText ?? "Reservar no WhatsApp"}
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-bold">Nossos brinquedos</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {toys.map((t) => (
            <article key={t.id} className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
              <h3 className="font-bold">{t.name}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{t.description ?? t.category}</p>
              <p className="mt-3 font-extrabold">a partir de {brl(t.defaultRentPrice)}</p>
              <a href={waUrl(settings?.whatsappMain, `Tenho interesse no ${t.name}.`)} target="_blank" rel="noopener" className="mt-3 inline-block rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-white">Solicitar</a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
