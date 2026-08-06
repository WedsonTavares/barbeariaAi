import type { Metadata } from "next";

import { services } from "@barbearia-ai/core";
import { headers } from "next/headers";
import { brl, waUrl } from "@/lib/format";
import { tenantFromHost } from "@/lib/tenant-resolution";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1800&q=80";

async function tenantForSite() {
  const host = (await headers()).get("host");
  return tenantFromHost(host);
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantForSite();
  if (!tenant) return { title: "Barbearia AI" };
  const settings = await services.tenantService.getSettings(tenant.id);
  const city = settings?.city ? ` em ${settings.city}` : "";
  return {
    title: `${tenant.name} - Agendamentos${city}`,
    description: settings?.subheadline ?? "Agende seu atendimento pelo WhatsApp.",
  };
}

export default async function SitePage() {
  const tenant = await tenantForSite();
  if (!tenant) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-center text-white">
        <div>
          <h1 className="text-3xl font-extrabold">Barbearia AI</h1>
          <p className="mt-2 text-white/70">Tenant não encontrado para este domínio.</p>
        </div>
      </main>
    );
  }

  const [settings, catalog, professionals] = await Promise.all([
    services.tenantService.getSettings(tenant.id),
    services.serviceCatalogService.active(tenant.id),
    services.professionalService.active(tenant.id),
  ]);
  const whatsapp = waUrl(settings?.whatsappMain, "Olá! Vim pelo site e quero agendar um atendimento.");
  const heroImage = settings?.logoUrl?.startsWith("http") ? settings.logoUrl : HERO_IMAGE;

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <section className="relative min-h-[78vh] overflow-hidden px-5 py-5 text-white">
        <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-slate-950/58" />
        <div className="relative z-10 mx-auto flex min-h-[calc(78vh-2.5rem)] max-w-6xl flex-col justify-between">
          <nav className="flex items-center justify-between gap-4 text-sm font-semibold">
            <span className="truncate text-lg font-extrabold">{tenant.name}</span>
            <a href={whatsapp} className="rounded-full bg-white px-4 py-2 text-slate-950">WhatsApp</a>
          </nav>

          <div className="max-w-2xl pb-10">
            <p className="text-sm font-bold uppercase tracking-wider text-white/70">{settings?.city ?? "Agendamento online"}</p>
            <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">
              {settings?.headline ?? tenant.name}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-white/82 sm:text-lg">
              {settings?.subheadline ?? "Cabelo, barba e estética com agenda organizada pelo WhatsApp."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={whatsapp} className="rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-extrabold text-white">
                {settings?.ctaText ?? "Agendar no WhatsApp"}
              </a>
              <a href="#servicos" className="rounded-full border border-white/35 px-5 py-3 text-sm font-extrabold text-white">
                Ver serviços
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="servicos" className="px-5 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black">Serviços</h2>
              <p className="mt-1 text-sm text-slate-600">Valores e duração podem variar conforme avaliação da equipe.</p>
            </div>
            {professionals.length > 0 && (
              <p className="text-sm font-semibold text-slate-600">
                {professionals.length} profissional{professionals.length === 1 ? "" : "is"} disponível{professionals.length === 1 ? "" : "is"}
              </p>
            )}
          </div>

          {catalog.length === 0 ? (
            <p className="mt-8 rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              Catálogo em configuração.
            </p>
          ) : (
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((service) => (
                <article key={service.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-extrabold">{service.name}</h3>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                      {service.durationMinutes} min
                    </span>
                  </div>
                  {service.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{service.description}</p>}
                  <div className="mt-4 text-lg font-black tabular-nums">{brl(service.defaultPrice)}</div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-slate-200 px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-bold text-slate-950">{tenant.name}</span>
          <span>{settings?.city ? `${settings.city} · ` : ""}{settings?.whatsappMain ?? "WhatsApp em configuração"}</span>
        </div>
      </footer>
    </main>
  );
}
