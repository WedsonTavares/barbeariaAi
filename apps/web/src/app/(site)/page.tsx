import type { Metadata } from "next";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl, waUrl } from "@/lib/format";
import { TOY_CATEGORY, label } from "@/lib/labels";
import { createPublicLead } from "./actions";

export const dynamic = "force-dynamic";

/** Emoji por categoria — placeholder visual enquanto o brinquedo não tem foto. */
const CATEGORY_EMOJI: Record<string, string> = {
  CAMA_ELASTICA: "🤸",
  PISCINA_BOLINHAS: "🎈",
  INFLAVEL: "🏰",
  ESCORREGADOR: "🛝",
  MESA_CADEIRA: "🪑",
  OUTRO: "🎉",
};

const PROMISES = ["Levamos", "Montamos", "Higienizamos", "Retiramos"];

const BENEFITS = [
  { emoji: "🧼", title: "Higienizados a cada festa", desc: "Limpeza completa antes de chegar até você — segurança em primeiro lugar." },
  { emoji: "🚚", title: "Entrega e montagem inclusas", desc: "A gente leva, monta, testa e retira. Você não levanta um dedo." },
  { emoji: "🕒", title: "Pontualidade garantida", desc: "Chegamos antes da festa começar. Seu horário é sagrado." },
];

const STEPS = [
  { n: 1, title: "Escolha", desc: "Veja os brinquedos e escolha os favoritos." },
  { n: 2, title: "Reserve", desc: "Peça o orçamento por aqui ou no WhatsApp." },
  { n: 3, title: "Nós montamos", desc: "No dia, entregamos e deixamos tudo pronto." },
  { n: 4, title: "Só curtir", desc: "Acabou a festa? A gente desmonta e retira." },
];

function instagramHref(v?: string | null) {
  if (!v) return null;
  return v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) return { title: "Diny — Locação de Brinquedos" };
  const settings = await services.tenantService.getSettings(tenant.id);
  const city = settings?.city ? ` em ${settings.city}` : "";
  return {
    title: `${tenant.name} — Aluguel de brinquedos para festas${city}`,
    description:
      settings?.subheadline ??
      `Pula-pula, piscina de bolinhas e muito mais. Entregue, montado e higienizado${city}.`,
  };
}

export default async function TenantHome({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
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

  const sp = await searchParams;
  const settings = await services.tenantService.getSettings(tenant.id);
  const toys = (await services.toyService.list(tenant.id)).filter((t) => t.status !== "RETIRED");

  // Identidade do tenant (TenantSettings) — cada empresa com as suas cores.
  const primary = settings?.colorPrimary ?? "#2563eb";
  const accent = settings?.colorAccent ?? "#7c3aed";
  const secondary = settings?.colorSecondary ?? "#fbbf24";
  const wa = waUrl(settings?.whatsappMain, "Olá! Vim pelo site e quero um orçamento.");
  const insta = instagramHref(settings?.instagram);

  return (
    <main className="min-h-screen bg-white text-[var(--color-ink)]">
      {/* ===== Navbar ===== */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <a href="#" className="flex items-center gap-2 font-extrabold">
            {settings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <span
                className="grid h-8 w-8 place-items-center rounded-lg text-white"
                style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
                aria-hidden
              >
                🎉
              </span>
            )}
            <span className="truncate">{tenant.name}</span>
          </a>
          <div className="hidden items-center gap-5 text-sm font-semibold sm:flex">
            <a href="#brinquedos" className="hover:opacity-70">Brinquedos</a>
            <a href="#como-funciona" className="hover:opacity-70">Como funciona</a>
            <a href="#orcamento" className="hover:opacity-70">Orçamento</a>
          </div>
          <a href={wa} target="_blank" rel="noopener" className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-white hover:brightness-105">
            WhatsApp
          </a>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section
        className="px-5 py-20 text-center text-white sm:py-28"
        style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
      >
        <div className="mx-auto max-w-3xl">
          {settings?.city && (
            <span className="inline-block rounded-full bg-white/15 px-4 py-1 text-sm font-semibold">
              📍 {settings.city} e região
            </span>
          )}
          <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">
            {settings?.headline ?? tenant.name}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
            {settings?.subheadline ?? "Brinquedos entregues, montados e higienizados. Diversão sem dor de cabeça."}
          </p>
          <ul className="mx-auto mt-6 flex max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-xs font-extrabold"
                  style={{ background: secondary, color: "#0f172a" }}
                >
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href={wa} target="_blank" rel="noopener" className="w-full rounded-full bg-[#25D366] px-8 py-4 font-bold text-white hover:brightness-105 sm:w-auto">
              {settings?.ctaText ?? "Reservar no WhatsApp"}
            </a>
            <a href="#brinquedos" className="w-full rounded-full border border-white/40 bg-white/10 px-8 py-4 font-bold text-white hover:bg-white/20 sm:w-auto">
              Ver brinquedos ↓
            </a>
          </div>
        </div>
      </section>

      {/* ===== Benefícios ===== */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-4 sm:grid-cols-3">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-2xl border border-black/5 bg-[var(--color-surface)] p-5">
              <div className="text-2xl" aria-hidden>{b.emoji}</div>
              <h3 className="mt-2 font-bold">{b.title}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Catálogo ===== */}
      <section id="brinquedos" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-10">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Nossos brinquedos</h2>
        <p className="mt-1 text-[var(--color-muted)]">Escolha os favoritos e peça seu orçamento — sem compromisso.</p>

        {toys.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-black/5 bg-[var(--color-surface)] p-8 text-center">
            <p className="font-semibold">Catálogo em atualização 🛠️</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Chame no WhatsApp que a gente te mostra tudo por lá.</p>
            <a href={wa} target="_blank" rel="noopener" className="mt-4 inline-block rounded-full bg-[#25D366] px-6 py-3 font-bold text-white">Falar no WhatsApp</a>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {toys.map((t) => {
              const indisponivel = t.status !== "AVAILABLE";
              return (
                <article key={t.id} className="flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition-shadow hover:shadow-md">
                  {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt={t.name} className="h-44 w-full object-cover" />
                  ) : (
                    <div
                      className="grid h-44 place-items-center text-6xl"
                      style={{ background: `linear-gradient(135deg, ${primary}1f, ${accent}1f)` }}
                      aria-hidden
                    >
                      {CATEGORY_EMOJI[t.category] ?? "🎉"}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: primary }}>
                        {label(TOY_CATEGORY, t.category)}
                      </span>
                      {indisponivel && (
                        <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-muted)]">
                          Consultar disponibilidade
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-lg font-bold">{t.name}</h3>
                    {t.description && <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{t.description}</p>}
                    <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                      <div>
                        <div className="text-xs text-[var(--color-muted)]">a partir de</div>
                        <div className="text-xl font-extrabold">{brl(t.defaultRentPrice)}</div>
                      </div>
                      <a
                        href={waUrl(settings?.whatsappMain, `Olá! Tenho interesse no "${t.name}". Pode me passar valores e disponibilidade?`)}
                        target="_blank"
                        rel="noopener"
                        className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-white hover:brightness-105"
                      >
                        Solicitar
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== Como funciona ===== */}
      <section id="como-funciona" className="scroll-mt-20 px-5 py-14" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
        <div className="mx-auto max-w-5xl text-white">
          <h2 className="text-center text-2xl font-extrabold sm:text-3xl">Simples assim: você só curte</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl bg-white/10 p-5 text-center backdrop-blur">
                <span
                  className="mx-auto grid h-8 w-8 place-items-center rounded-full font-extrabold"
                  style={{ background: secondary, color: "#0f172a" }}
                >
                  {s.n}
                </span>
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-white/85">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Orçamento (vira Lead no dashboard) ===== */}
      <section id="orcamento" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-14">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Peça seu orçamento</h2>
            <p className="mt-2 text-[var(--color-muted)]">
              Preencha rapidinho e a gente retorna no seu WhatsApp com valores e disponibilidade para a sua data.
            </p>
            <a href={wa} target="_blank" rel="noopener" className="mt-4 inline-block rounded-full bg-[#25D366] px-6 py-3 font-bold text-white">
              Prefere falar direto? Chama no WhatsApp
            </a>
          </div>

          <form action={createPublicLead} className="space-y-3 rounded-2xl border border-black/5 bg-[var(--color-surface)] p-5 sm:p-6">
            {sp?.lead === "ok" && (
              <p role="status" className="rounded-lg bg-green-100 p-3 text-sm font-semibold text-green-700">
                Recebemos seu pedido! 🎉 Vamos te chamar no WhatsApp em breve.
              </p>
            )}
            {sp?.lead === "erro" && (
              <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm font-semibold text-red-700">
                Confira o nome e o WhatsApp e tente de novo.
              </p>
            )}
            <label className="block text-sm font-semibold">
              Seu nome *
              <input name="name" required minLength={2} placeholder="Como podemos te chamar?" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5" />
            </label>
            <label className="block text-sm font-semibold">
              WhatsApp *
              <input name="phone" required minLength={8} inputMode="tel" placeholder="(16) 9 9999-9999" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Data da festa
                <input name="desiredDate" type="date" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5" />
              </label>
              <label className="block text-sm font-semibold">
                Bairro
                <input name="neighborhood" placeholder="Onde será?" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5" />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Quantas crianças?
              <input name="childrenCount" type="number" min={1} placeholder="Ex.: 15" className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5" />
            </label>
            <label className="block text-sm font-semibold">
              Mensagem
              <textarea name="message" rows={3} placeholder="Brinquedos de interesse, horário da festa..." className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5" />
            </label>
            {/* Honeypot anti-spam: humanos não veem este campo. */}
            <div className="hidden" aria-hidden>
              <label>
                Não preencha este campo
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <button className="w-full rounded-full px-6 py-3.5 font-bold text-white hover:brightness-110" style={{ background: primary }}>
              Enviar pedido de orçamento
            </button>
            <p className="text-center text-xs text-[var(--color-muted)]">Sem compromisso. Seus dados ficam só com a gente.</p>
          </form>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-black/5 bg-[var(--color-surface)] px-5 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <div className="font-extrabold">{tenant.name}</div>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {settings?.city ? `${settings.city} e região · ` : ""}Aluguel de brinquedos para festas
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold">
            {settings?.whatsappMain && (
              <a href={wa} target="_blank" rel="noopener" className="rounded-full bg-[#25D366] px-4 py-2 text-white">WhatsApp</a>
            )}
            {insta && (
              <a href={insta} target="_blank" rel="noopener" className="rounded-full border border-black/10 bg-white px-4 py-2">Instagram</a>
            )}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
          © {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.
        </p>
      </footer>
    </main>
  );
}
