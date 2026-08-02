import type { Metadata } from "next";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl, waUrl } from "@/lib/format";
import { TOY_CATEGORY, label } from "@/lib/labels";

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
  { emoji: "🧼", title: "Higienizado a cada festa", desc: "Limpeza completa antes de chegar até você. Segurança em primeiro lugar." },
  { emoji: "🚚", title: "Entrega e montagem inclusas", desc: "A gente leva, monta, testa e retira. Você não levanta um dedo." },
  { emoji: "🕒", title: "Pontualidade garantida", desc: "Chegamos antes da festa começar. Seu horário é sagrado." },
];

const STEPS = [
  { n: 1, emoji: "🎯", title: "Escolha", desc: "Veja os brinquedos e escolha o favorito." },
  { n: 2, emoji: "💬", title: "Chame no zap", desc: "Responde na hora, com data e valor." },
  { n: 3, emoji: "🚚", title: "Nós montamos", desc: "No dia, entregamos e deixamos pronto." },
  { n: 4, emoji: "🥳", title: "Só curtir", desc: "Acabou? A gente desmonta e retira." },
];

/** Bolinhas de confete do hero — posição fixa pra não "dançar" a cada render. */
const CONFETTI = [
  { left: "6%", top: "18%", size: 14, delay: "0s", dur: "7s" },
  { left: "17%", top: "68%", size: 10, delay: "1.2s", dur: "9s" },
  { left: "31%", top: "12%", size: 8, delay: "2.4s", dur: "8s" },
  { left: "44%", top: "78%", size: 12, delay: "0.6s", dur: "10s" },
  { left: "63%", top: "22%", size: 9, delay: "3s", dur: "7.5s" },
  { left: "78%", top: "62%", size: 15, delay: "1.8s", dur: "8.5s" },
  { left: "89%", top: "30%", size: 11, delay: "0.3s", dur: "9.5s" },
];

function instagramHref(v?: string | null) {
  if (!v) return null;
  return v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) return { title: "Diny Locação de Brinquedos" };
  const settings = await services.tenantService.getSettings(tenant.id);
  const city = settings?.city ? ` em ${settings.city}` : "";
  return {
    title: `${tenant.name} — Aluguel de brinquedos para festas${city}`,
    description:
      settings?.subheadline ??
      `Pula-pula, piscina de bolinhas e muito mais. Entregue, montado e higienizado${city}.`,
  };
}

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
  const toys = (await services.toyService.list(tenant.id)).filter((t) => t.status !== "RETIRED");
  const fotos = await services.eventPhotoService.list(tenant.id);

  // Identidade do tenant (TenantSettings) — cada empresa com as suas cores.
  const primary = settings?.colorPrimary ?? "#2563eb";
  const accent = settings?.colorAccent ?? "#7c3aed";
  const secondary = settings?.colorSecondary ?? "#fbbf24";
  const wa = waUrl(settings?.whatsappMain, "Olá! Vim pelo site e quero saber sobre os brinquedos.");
  const insta = instagramHref(settings?.instagram);

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-[var(--color-ink)]">
      {/*
        Animações e efeitos 3D ficam aqui, e não em globals.css, porque são
        exclusivos da landing — o /admin não carrega nada disso. `prefers-
        reduced-motion` desliga tudo pra quem pediu menos movimento no sistema.
      */}
      <style>{`
        @keyframes flutua { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(-22px) rotate(6deg) } }
        @keyframes gira  { 0%,100% { transform: translateY(0) rotate(-8deg) } 50% { transform: translateY(-14px) rotate(8deg) } }
        @keyframes pulsa { 0%,100% { opacity:.55; transform: scale(1) } 50% { opacity:.85; transform: scale(1.12) } }
        @keyframes sobe  { from { opacity:0; transform: translateY(18px) } to { opacity:1; transform: translateY(0) } }
        .flutua { animation: flutua 6s ease-in-out infinite }
        .gira   { animation: gira 5s ease-in-out infinite }
        .pulsa  { animation: pulsa 9s ease-in-out infinite }
        .sobe   { animation: sobe .7s cubic-bezier(.22,1,.36,1) both }
        /* Cartão com profundidade: inclina levemente e sobe no hover. */
        .card3d { transform-style: preserve-3d; transition: transform .35s cubic-bezier(.22,1,.36,1), box-shadow .35s }
        .card3d:hover { transform: perspective(900px) rotateX(4deg) rotateY(-4deg) translateY(-8px) }
        @media (prefers-reduced-motion: reduce) {
          .flutua, .gira, .pulsa, .sobe { animation: none }
          .card3d:hover { transform: none }
        }
      `}</style>

      {/* ===== Navbar ===== */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <a href="#" className="flex items-center gap-2.5 font-extrabold">
            {settings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt={tenant.name} className="h-11 w-11 rounded-full object-cover shadow-sm" />
            ) : (
              <span
                className="grid h-11 w-11 place-items-center rounded-full text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
                aria-hidden
              >
                🎉
              </span>
            )}
            <span className="truncate text-lg">{tenant.name}</span>
          </a>
          <div className="hidden items-center gap-6 text-sm font-semibold sm:flex">
            <a href="#brinquedos" className="transition-colors hover:text-[var(--color-muted)]">Brinquedos</a>
            {fotos.length > 0 && (
              <a href="#galeria" className="transition-colors hover:text-[var(--color-muted)]">Galeria</a>
            )}
            <a href="#como-funciona" className="transition-colors hover:text-[var(--color-muted)]">Como funciona</a>
          </div>
          <a
            href={wa}
            target="_blank"
            rel="noopener"
            className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#25D366]/30 transition-transform hover:scale-105"
          >
            Chamar no zap
          </a>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="relative isolate overflow-hidden px-5 pb-24 pt-14 sm:pb-32 sm:pt-20">
        {/*
          Fundo: uma base tingida com a paleta + manchas desfocadas por cima.
          Sem a base o hero ficava branco demais e as manchas pareciam sujeira
          solta; com ela a cor cobre a seção inteira e as manchas viram relevo.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20"
          style={{ background: `linear-gradient(165deg, ${secondary}2e 0%, ${primary}1f 45%, ${accent}17 75%, ${primary}0f 100%)` }}
        />
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div aria-hidden className="absolute -left-32 -top-24 h-[28rem] w-[28rem] rounded-full blur-3xl pulsa" style={{ background: `radial-gradient(circle, ${primary}66, transparent 70%)` }} />
          <div aria-hidden className="absolute -right-28 top-10 h-[24rem] w-[24rem] rounded-full blur-3xl pulsa" style={{ background: `radial-gradient(circle, ${accent}66, transparent 70%)`, animationDelay: "3s" }} />
          <div aria-hidden className="absolute bottom-0 left-1/3 h-[20rem] w-[20rem] rounded-full blur-3xl pulsa" style={{ background: `radial-gradient(circle, ${secondary}66, transparent 70%)`, animationDelay: "5s" }} />
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="absolute rounded-full flutua"
              style={{
                left: c.left,
                top: c.top,
                width: c.size,
                height: c.size,
                background: [primary, accent, secondary, "#22d3ee", "#f472b6"][i % 5],
                opacity: 0.5,
                animationDelay: c.delay,
                animationDuration: c.dur,
              }}
            />
          ))}
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="sobe text-center lg:text-left">
            {settings?.city && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/80 px-4 py-1.5 text-sm font-bold shadow-sm backdrop-blur">
                📍 {settings.city} e região
              </span>
            )}
            <h1 className="mt-5 text-[2.6rem] font-black leading-[1.05] tracking-tight sm:text-6xl">
              {settings?.headline ?? tenant.name}
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-lg text-[var(--color-muted)] lg:mx-0">
              {settings?.subheadline ?? "Brinquedos entregues, montados e higienizados. Diversão sem dor de cabeça."}
            </p>

            <ul className="mx-auto mt-7 flex max-w-lg flex-wrap items-center justify-center gap-2 lg:mx-0 lg:justify-start">
              {PROMISES.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-1.5 rounded-full border border-black/5 bg-white px-3.5 py-1.5 text-sm font-bold shadow-sm"
                >
                  <span className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-black text-white" style={{ background: primary }}>✓</span>
                  {p}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
              <a
                href={wa}
                target="_blank"
                rel="noopener"
                className="w-full rounded-full bg-[#25D366] px-8 py-4 text-center font-bold text-white shadow-xl shadow-[#25D366]/30 transition-transform hover:scale-105 sm:w-auto"
              >
                {settings?.ctaText ?? "Reservar no WhatsApp"}
              </a>
              <a
                href="#brinquedos"
                className="w-full rounded-full border-2 border-black/10 bg-white px-8 py-4 text-center font-bold transition-colors hover:bg-[var(--color-surface)] sm:w-auto"
              >
                Ver brinquedos ↓
              </a>
            </div>
          </div>

          {/*
            Logo em destaque, flutuando sobre um halo colorido. No celular ele
            vem ANTES do texto (order-first): é o primeiro reconhecimento da
            marca, e antes ele simplesmente não aparecia em tela pequena.
          */}
          <div className="relative order-first mx-auto w-full max-w-[14rem] sm:max-w-[17rem] lg:order-none lg:max-w-sm">
            <div
              aria-hidden
              className="absolute inset-6 rounded-full blur-2xl"
              style={{ background: `conic-gradient(from 0deg, ${primary}, ${accent}, ${secondary}, ${primary})`, opacity: 0.5 }}
            />
            {settings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt={tenant.name} className="gira relative w-full drop-shadow-2xl" />
            ) : (
              <div className="gira relative grid aspect-square w-full place-items-center rounded-full text-[5rem] shadow-2xl lg:text-[8rem]" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }} aria-hidden>
                🎪
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== Benefícios ===== */}
      <section className="relative isolate px-5 pb-16">
        {/* Emenda a cor entre o hero e o catálogo: sem isso ficava uma tira
            branca no meio da página, bem onde os cards precisam de contraste. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: `linear-gradient(180deg, ${primary}0f, ${primary}14)` }}
        />
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-3">
          {BENEFITS.map((b, i) => {
            // Um card por cor da paleta: o fundo tingido e a barra do topo dão
            // cor à seção sem precisar pintar a faixa inteira atrás dela.
            const cor = [primary, accent, secondary][i];
            return (
              <div
                key={b.title}
                className="card3d relative overflow-hidden rounded-3xl border p-6 shadow-[0_4px_24px_-8px_rgba(0,0,0,.12)]"
                style={{ background: `linear-gradient(160deg, ${cor}1f, #ffffff 70%)`, borderColor: `${cor}40` }}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: cor }} />
                <div
                  className="grid h-12 w-12 place-items-center rounded-2xl text-2xl shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${cor}3d, #ffffff)` }}
                  aria-hidden
                >
                  {b.emoji}
                </div>
                <h3 className="mt-4 text-lg font-extrabold">{b.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--color-muted)]">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Catálogo ===== */}
      <section id="brinquedos" className="relative isolate scroll-mt-20 px-5 py-16">
        {/* Faixa tingida: os cards continuam brancos e saltam por cima dela. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: `linear-gradient(180deg, ${primary}14, ${accent}14 100%)` }}
        />
        <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Nossos brinquedos</h2>
          <p className="mt-2 text-[var(--color-muted)]">Escolha o favorito e chame no zap — a gente responde na hora.</p>
        </div>

        {toys.length === 0 ? (
          <div className="mx-auto mt-10 max-w-md rounded-3xl border border-black/5 bg-[var(--color-surface)] p-8 text-center">
            <p className="text-lg font-bold">Catálogo em atualização 🛠️</p>
            <p className="mt-1.5 text-sm text-[var(--color-muted)]">Chame no WhatsApp que a gente te mostra tudo por lá.</p>
            <a href={wa} target="_blank" rel="noopener" className="mt-5 inline-block rounded-full bg-[#25D366] px-6 py-3 font-bold text-white shadow-lg shadow-[#25D366]/30">
              Falar no WhatsApp
            </a>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {toys.map((t, i) => {
              const indisponivel = t.status !== "AVAILABLE";
              // A etiqueta gira pela paleta: uma fileira de cards com a mesma
              // cor de chip lia como lista de sistema, não como catálogo.
              const cor = [primary, accent, secondary][i % 3];
              return (
                <article
                  key={t.id}
                  className="card3d flex flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_4px_24px_-8px_rgba(0,0,0,.12)]"
                >
                  {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt={t.name} className="h-52 w-full object-cover" />
                  ) : (
                    <div
                      className="grid h-52 place-items-center text-7xl"
                      style={{ background: `linear-gradient(135deg, ${primary}1a, ${accent}1a, ${secondary}1a)` }}
                      aria-hidden
                    >
                      {CATEGORY_EMOJI[t.category] ?? "🎉"}
                    </div>
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold"
                        style={{ background: cor, color: cor === secondary ? "#0f172a" : "#ffffff" }}
                      >
                        {label(TOY_CATEGORY, t.category)}
                      </span>
                      {indisponivel && (
                        <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                          Consultar disponibilidade
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-xl font-extrabold">{t.name}</h3>
                    {t.description && <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-muted)]">{t.description}</p>}
                    <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                      <div>
                        <div className="text-xs font-semibold text-[var(--color-muted)]">a partir de</div>
                        <div className="text-2xl font-black">{brl(t.defaultRentPrice)}</div>
                      </div>
                      <a
                        href={waUrl(settings?.whatsappMain, `Olá! Tenho interesse no "${t.name}". Pode me passar valores e disponibilidade?`)}
                        target="_blank"
                        rel="noopener"
                        className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#25D366]/25 transition-transform hover:scale-105"
                      >
                        Quero esse
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </div>
      </section>

      {/*
        ===== Galeria de eventos =====
        Só aparece quando o painel já publicou alguma foto — uma seção "Nossas
        festas" vazia passaria a impressão contrária da que ela existe pra dar.
        A primeira foto ocupa o dobro no desktop: quebra a grade quadriculada e
        dá um ponto de entrada pro olho.
      */}
      {fotos.length > 0 && (
        <section id="galeria" className="relative isolate scroll-mt-20 overflow-hidden px-5 py-16">
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ background: `linear-gradient(180deg, ${accent}1c, ${secondary}22)` }}
          />
          <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Festas que a gente já fez</h2>
            <p className="mt-2 text-[var(--color-muted)]">Um pouquinho da alegria que já montamos por aí. 🎈</p>
          </div>

          <div className="mt-10 grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[13rem] sm:gap-4 lg:grid-cols-4">
            {fotos.map((foto, i) => (
              <figure
                key={foto.id}
                className={`group relative m-0 overflow-hidden rounded-3xl border border-black/5 bg-[var(--color-surface)] shadow-[0_4px_24px_-8px_rgba(0,0,0,.12)] ${
                  // A primeira só ganha o dobro quando há grade pra preencher:
                  // com uma ou duas fotos o destaque vira um buraco ao lado.
                  i === 0 && fotos.length >= 3 ? "col-span-2 row-span-2" : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={foto.imageUrl}
                  alt={foto.caption ?? `Festa montada por ${tenant.name}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {foto.caption && (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-slate-950/80 to-transparent p-3 pt-8 text-xs font-semibold text-white sm:text-sm">
                    {foto.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>

          <div className="mt-10 text-center">
            <a
              href={wa}
              target="_blank"
              rel="noopener"
              className="inline-block rounded-full px-7 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}
            >
              Quero uma festa assim
            </a>
          </div>
          </div>
        </section>
      )}

      {/* ===== Como funciona ===== */}
      <section id="como-funciona" className="relative isolate scroll-mt-20 overflow-hidden px-5 py-20">
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }} />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 -z-10 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="mx-auto max-w-6xl text-white">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Simples assim: você só curte</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="card3d rounded-3xl border border-white/15 bg-white/10 p-6 text-center backdrop-blur-md">
                <div className="text-4xl" aria-hidden>{s.emoji}</div>
                <span
                  className="mx-auto mt-4 grid h-8 w-8 place-items-center rounded-full text-sm font-black"
                  style={{ background: secondary, color: "#0f172a" }}
                >
                  {s.n}
                </span>
                <h3 className="mt-3 text-lg font-extrabold">{s.title}</h3>
                <p className="mt-1 text-sm text-white/85">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Chamada final ===== */}
      <section className="relative isolate overflow-hidden px-5 py-20 text-center">
        {/* Faixa quente: fecha a página com a cor de destaque, não com branco. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: `linear-gradient(135deg, ${secondary}, ${secondary}c9 55%, ${accent}5c)` }}
        />
        <div aria-hidden className="pointer-events-none absolute -left-16 -bottom-16 -z-10 h-72 w-72 rounded-full bg-white/25 blur-3xl" />
        <div className="mx-auto max-w-4xl">
          <div className="text-5xl flutua" aria-hidden>🎈</div>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Bora garantir a data?</h2>
          <p className="mx-auto mt-3 max-w-md font-medium text-slate-800">
            Chama no WhatsApp que a gente confere a disponibilidade e responde na hora.
          </p>
          <a
            href={wa}
            target="_blank"
            rel="noopener"
            className="mt-8 inline-block rounded-full bg-[#25D366] px-10 py-4 text-lg font-bold text-white shadow-xl shadow-black/20 transition-transform hover:scale-105"
          >
            {settings?.ctaText ?? "Reservar no WhatsApp"}
          </a>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="relative overflow-hidden bg-slate-950 px-5 py-12 text-white">
        {/* Fita da paleta no topo e um brilho de cor ao fundo: o rodapé escuro
            fecha a página, mas continua sendo da marca. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ background: `linear-gradient(90deg, ${primary}, ${accent}, ${secondary})` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: `radial-gradient(circle, ${accent}66, transparent 70%)` }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            {settings?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoUrl} alt="" className="h-14 w-14 rounded-full object-cover ring-2 ring-white/20" />
            )}
            <div>
              <div className="text-lg font-extrabold">{tenant.name}</div>
              <p className="mt-0.5 text-sm text-white/65">
                {settings?.city ? `${settings.city} e região · ` : ""}Aluguel de brinquedos para festas
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-semibold">
            {settings?.whatsappMain && (
              <a href={wa} target="_blank" rel="noopener" className="rounded-full bg-[#25D366] px-5 py-2.5 text-white shadow-lg shadow-[#25D366]/25 transition-transform hover:scale-105">
                WhatsApp
              </a>
            )}
            {insta && (
              <a href={insta} target="_blank" rel="noopener" className="rounded-full border border-white/20 bg-white/10 px-5 py-2.5 transition-colors hover:bg-white/20">
                Instagram
              </a>
            )}
            {settings?.googleMaps && (
              <a href={settings.googleMaps} target="_blank" rel="noopener" className="rounded-full border border-white/20 bg-white/10 px-5 py-2.5 transition-colors hover:bg-white/20">
                Google Maps
              </a>
            )}
          </div>
        </div>
        <p className="relative mt-8 text-center text-xs text-white/45">
          © {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.
        </p>
      </footer>
    </main>
  );
}
