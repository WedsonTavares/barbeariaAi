import type { Metadata } from "next";
import type { CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Clock3,
  Facebook,
  Instagram,
  MapPin,
  MessageCircle,
  Scissors,
  UsersRound,
} from "lucide-react";
import { headers } from "next/headers";

import { services } from "@barbearia-ai/core";
import { brl, waUrl } from "@/lib/format";
import { tenantFromHost } from "@/lib/tenant-resolution";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1800&q=80";

async function tenantForSite() {
  const host = (await headers()).get("host");
  return tenantFromHost(host);
}

function offerHeadline(headline: string | null | undefined, brandName: string) {
  const cleanHeadline = headline?.trim();
  if (!cleanHeadline || cleanHeadline.toLocaleLowerCase("pt-BR") === brandName.toLocaleLowerCase("pt-BR")) {
    return null;
  }

  // Remove o nome antigo da plataforma de textos salvos antes de o site usar a marca do cliente.
  return cleanHeadline.replace(/^barbearia ai\s*(?:[\u2014\u2013-]|:)\s*/i, "").trim() || null;
}

function externalUrl(value: string | null | undefined) {
  const url = value?.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function phoneLabel(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return value?.trim() || "WhatsApp em configuração";
}

function contrastColor(color: string) {
  const match = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!match) return "#ffffff";
  const red = Number.parseInt(match[1]!, 16);
  const green = Number.parseInt(match[2]!, 16);
  const blue = Number.parseInt(match[3]!, 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 170 ? "#111827" : "#ffffff";
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantForSite();
  if (!tenant) return { title: "Barbearia AI" };
  const settings = await services.tenantService.getSettings(tenant.id);
  const city = settings?.city ? ` em ${settings.city}` : "";
  return {
    title: `${tenant.name} - Agendamentos${city}`,
    description: settings?.subheadline ?? `Agende seu atendimento na ${tenant.name} pelo WhatsApp.`,
  };
}

export default async function SitePage() {
  const tenant = await tenantForSite();
  if (!tenant) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-950 px-6 text-center text-white">
        <div>
          <h1 className="text-3xl font-extrabold">Barbearia AI</h1>
          <p className="mt-2 text-white/70">Empresa não encontrada para este domínio.</p>
        </div>
      </main>
    );
  }

  const [settings, catalog, professionals, portfolio] = await Promise.all([
    services.tenantService.getSettings(tenant.id),
    services.serviceCatalogService.active(tenant.id),
    services.professionalService.active(tenant.id),
    services.eventPhotoService.list(tenant.id),
  ]);

  const brandName = tenant.name.trim();
  const headline = offerHeadline(settings?.headline, brandName);
  const whatsapp = waUrl(settings?.whatsappMain, "Olá! Vim pelo site e quero agendar um atendimento.");
  const logoUrl = settings?.logoUrl?.trim() || null;
  const heroPhoto = portfolio[0] ?? null;
  const heroImage = heroPhoto?.imageUrl ?? HERO_IMAGE;
  const instagram = externalUrl(settings?.instagram);
  const facebook = externalUrl(settings?.facebook);
  const googleMaps = externalUrl(settings?.googleMaps);
  const primaryColor = settings?.colorPrimary || "#166534";
  const siteTheme = {
    "--site-primary": primaryColor,
    "--site-primary-contrast": contrastColor(primaryColor),
    "--site-secondary": settings?.colorSecondary || "#d4a853",
    "--site-accent": settings?.colorAccent || "#b45309",
  } as CSSProperties;

  const professionalsLabel =
    professionals.length === 1 ? "1 profissional disponível" : `${professionals.length} profissionais disponíveis`;
  const professionalsKind = professionals.length === 1 ? "profissional disponível" : "profissionais disponíveis";

  return (
    <main style={siteTheme} className="min-h-screen overflow-x-hidden bg-white text-neutral-950">
      <section className="relative min-h-[78svh] overflow-hidden bg-neutral-950 px-5 py-5 text-white sm:min-h-[82svh] sm:px-8 sm:py-7">
        <img
          src={heroImage}
          alt={heroPhoto?.caption || `Ambiente da ${brandName}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/65" />

        <div className="relative z-10 mx-auto flex min-h-[calc(78svh-2.5rem)] max-w-7xl flex-col sm:min-h-[calc(82svh-3.5rem)]">
          <nav className="flex min-h-12 items-center justify-between gap-4" aria-label="Navegação principal">
            <a href="#inicio" className="flex min-w-0 items-center gap-3" aria-label={`${brandName}, início`}>
              {logoUrl && (
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/95 p-1.5">
                  <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                </span>
              )}
              <span className="truncate text-lg font-black sm:text-xl">{brandName}</span>
            </a>

            <div className="flex items-center gap-2 sm:gap-6">
              <a href="#servicos" className="hidden text-sm font-bold text-white/78 transition hover:text-white sm:inline">
                Serviços
              </a>
              {portfolio.length > 0 && (
                <a href="#galeria" className="hidden text-sm font-bold text-white/78 transition hover:text-white sm:inline">
                  Galeria
                </a>
              )}
              <a
                href={whatsapp}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3.5 text-sm font-extrabold text-neutral-950 transition hover:bg-neutral-100 sm:px-4"
              >
                <MessageCircle className="size-4" aria-hidden />
                <span className="hidden min-[380px]:inline">WhatsApp</span>
                <span className="min-[380px]:hidden">Agendar</span>
              </a>
            </div>
          </nav>

          <div id="inicio" className="flex flex-1 items-center py-12 sm:py-16">
            <div className="max-w-3xl">
              <p className="flex items-center gap-2 text-sm font-bold uppercase text-white/72">
                <MapPin className="size-4 text-[var(--site-secondary)]" aria-hidden />
                {settings?.city ?? "Agendamento online"}
              </p>
              <h1 className="mt-5 max-w-3xl break-words text-5xl font-black leading-[1.02] sm:text-7xl">{brandName}</h1>
              {headline && <p className="mt-5 text-xl font-extrabold leading-7 text-white sm:text-2xl">{headline}</p>}
              <p className="mt-3 max-w-2xl text-base leading-7 text-white/78 sm:text-lg">
                {settings?.subheadline ?? "Cabelo, barba e estética com agenda organizada pelo WhatsApp."}
              </p>
              <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
                <a
                  href={whatsapp}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--site-primary)] px-5 text-sm font-extrabold text-[var(--site-primary-contrast)] transition hover:brightness-110"
                >
                  <MessageCircle className="size-5" aria-hidden />
                  {settings?.ctaText ?? "Agendar no WhatsApp"}
                </a>
                <a
                  href="#servicos"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/40 px-5 text-sm font-extrabold text-white transition hover:bg-white/10"
                >
                  Ver serviços
                  <ArrowDown className="size-4" aria-hidden />
                </a>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-4 border-t border-white/25 py-5 sm:grid-cols-3 sm:py-6">
            <div>
              <strong className="block text-xl font-black tabular-nums sm:text-2xl">{catalog.length}</strong>
              <span className="text-xs font-semibold text-white/65 sm:text-sm">serviços no catálogo</span>
            </div>
            <div>
              <strong className="block text-xl font-black tabular-nums sm:text-2xl">{professionals.length}</strong>
              <span className="text-xs font-semibold text-white/65 sm:text-sm">{professionalsKind}</span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <strong className="block text-base font-black sm:text-lg">Atendimento direto</strong>
              <span className="text-xs font-semibold text-white/65 sm:text-sm">pelo WhatsApp</span>
            </div>
          </div>
        </div>
      </section>

      <section id="servicos" className="scroll-mt-4 bg-neutral-100 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 border-b border-neutral-300 pb-7 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-sm font-extrabold uppercase text-[var(--site-accent)]">O que fazemos</p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">Serviços</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
                Valores e duração podem variar conforme avaliação da equipe.
              </p>
            </div>

            {professionals.length > 0 && (
              <div className="md:text-right">
                <p className="inline-flex items-center gap-2 text-sm font-extrabold text-neutral-800">
                  <UsersRound className="size-4 text-[var(--site-primary)]" aria-hidden />
                  {professionalsLabel}
                </p>
                <p className="mt-1 max-w-lg text-sm text-neutral-500">
                  {professionals.map((professional) => professional.name).join(" · ")}
                </p>
              </div>
            )}
          </div>

          {catalog.length === 0 ? (
            <p className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-500">
              Catálogo em configuração.
            </p>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((service) => (
                <article
                  key={service.id}
                  className="flex min-h-52 flex-col rounded-lg border border-neutral-200 bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-neutral-950 text-white">
                      <Scissors className="size-5" aria-hidden />
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-500">
                      <Clock3 className="size-4" aria-hidden />
                      {service.durationMinutes} min
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-black">{service.name}</h3>
                  {service.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-neutral-600">{service.description}</p>}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                    <strong className="text-xl font-black tabular-nums">{brl(service.defaultPrice)}</strong>
                    <a
                      href={waUrl(settings?.whatsappMain, `Olá! Quero agendar o serviço ${service.name}.`)}
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-950 transition hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]"
                      aria-label={`Agendar ${service.name} pelo WhatsApp`}
                      title={`Agendar ${service.name}`}
                    >
                      <ArrowUpRight className="size-4" aria-hidden />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {portfolio.length > 0 && (
        <section id="galeria" className="scroll-mt-4 bg-white px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-sm font-extrabold uppercase text-[var(--site-accent)]">Nosso trabalho</p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">Galeria</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600 sm:text-base">
                Resultados reais da equipe da {brandName}.
              </p>
            </div>

            <div className="mt-8 grid auto-rows-[180px] grid-cols-2 gap-3 md:auto-rows-[220px] md:grid-cols-4">
              {portfolio.map((photo, index) => {
                const featured = index % 7 === 0;
                return (
                  <figure
                    key={photo.id}
                    className={`group relative overflow-hidden rounded-lg bg-neutral-200 ${featured ? "col-span-2 row-span-2" : "col-span-1 row-span-1"}`}
                  >
                    <img
                      src={photo.imageUrl}
                      alt={photo.caption || `Trabalho realizado pela ${brandName}`}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                    {photo.caption && (
                      <figcaption className="absolute inset-x-0 bottom-0 line-clamp-2 bg-black/70 px-3 py-2.5 text-sm font-semibold text-white">
                        {photo.caption}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="bg-neutral-950 px-5 py-14 text-white sm:px-8 sm:py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-extrabold uppercase text-[var(--site-secondary)]">{settings?.city ?? brandName}</p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">Escolha seu serviço e reserve seu horário.</h2>
          </div>
          <a
            href={whatsapp}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-[var(--site-primary)] px-5 text-sm font-extrabold text-[var(--site-primary-contrast)] transition hover:brightness-110 md:self-auto"
          >
            <MessageCircle className="size-5" aria-hidden />
            {settings?.ctaText ?? "Agendar no WhatsApp"}
          </a>
        </div>
      </section>

      <footer className="border-t border-neutral-200 bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {logoUrl && (
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-neutral-200 bg-white p-1.5">
                <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-black text-neutral-950">{brandName}</p>
              <p className="mt-0.5 text-sm text-neutral-500">
                {settings?.city ? `${settings.city} · ` : ""}{phoneLabel(settings?.whatsappMain)}
              </p>
            </div>
          </div>

          {(instagram || facebook || googleMaps) && (
            <div className="flex items-center gap-2" aria-label="Redes sociais e localização">
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-10 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:border-neutral-950 hover:text-neutral-950"
                  aria-label="Instagram"
                  title="Instagram"
                >
                  <Instagram className="size-4" aria-hidden />
                </a>
              )}
              {facebook && (
                <a
                  href={facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-10 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:border-neutral-950 hover:text-neutral-950"
                  aria-label="Facebook"
                  title="Facebook"
                >
                  <Facebook className="size-4" aria-hidden />
                </a>
              )}
              {googleMaps && (
                <a
                  href={googleMaps}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-10 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:border-neutral-950 hover:text-neutral-950"
                  aria-label="Abrir localização no Google Maps"
                  title="Google Maps"
                >
                  <MapPin className="size-4" aria-hidden />
                </a>
              )}
            </div>
          )}
        </div>
      </footer>
    </main>
  );
}
