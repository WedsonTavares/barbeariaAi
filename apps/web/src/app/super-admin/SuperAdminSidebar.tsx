"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, Plus, LayoutDashboard, Menu, X, ShieldCheck, Radar, Briefcase, Braces, Globe } from "lucide-react";

const GRUPOS = [
  {
    label: "Plataforma",
    links: [
      { href: "/super-admin", label: "Lojas", icon: Building2, exato: true },
      { href: "/super-admin/nova-loja", label: "Nova loja", icon: Plus, exato: false },
    ],
  },
  {
    label: "Crescimento",
    links: [
      { href: "/super-admin/leads", label: "Prospecção", icon: Radar, exato: false },
      { href: "/super-admin/carteira", label: "Carteira", icon: Briefcase, exato: false },
    ],
  },
  {
    label: "Integração",
    links: [{ href: "/super-admin/api-docs", label: "API do agente", icon: Braces, exato: false }],
  },
  {
    /**
     * Volta para o painel operacional da loja DESTE host — é o caminho para o
     * inbox, a agenda e as conversas, que continuam morando lá. Sem ele, sair
     * do super admin só digitando a URL na mão.
     */
    label: "Atalhos",
    links: [{ href: "/admin/dashboard", label: "Painel da loja", icon: LayoutDashboard, exato: false }],
  },
];

/**
 * `/super-admin` precisa de correspondência EXATA: sem isso ele ficaria marcado
 * como ativo também em `/super-admin/nova-loja`, e os dois itens acenderiam ao
 * mesmo tempo.
 */
function isActive(pathname: string, href: string, exato: boolean) {
  return exato ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Navegação do Super Admin. Mesmo comportamento da sidebar do painel da loja
 * (fixa no desktop, gaveta no celular) de propósito: são duas áreas do mesmo
 * produto, e alternar entre elas com padrões diferentes confunde.
 *
 * É um componente separado do `AdminSidebar` porque os menus não têm nada em
 * comum — um lista as telas de UMA loja, o outro administra TODAS. Compartilhar
 * o componente exigiria um monte de condicional pra ganhar nada.
 */
export function SuperAdminSidebar({ apify = false }: { apify?: boolean }) {
  const pathname = usePathname() ?? "";
  const [aberto, setAberto] = useState(false);
  const painelRef = useRef<HTMLDivElement>(null);

  /**
   * A Apify entra como item extra no grupo que já existe, sem reordenar nada.
   * Com a flag desligada o menu fica idêntico ao de antes — a extensão não
   * anuncia a própria existência.
   */
  const grupos = apify
    ? GRUPOS.map((g) =>
        g.label === "Crescimento"
          ? { ...g, links: [...g.links, { href: "/super-admin/apify", label: "Apify", icon: Globe, exato: false }] }
          : g
      )
    : GRUPOS;
  const todosOsLinks = grupos.flatMap((g) => g.links);
  const atual = todosOsLinks.find((l) => isActive(pathname, l.href, l.exato));

  // Navegou: fecha. Sem isso o painel fica por cima da tela nova.
  useEffect(() => setAberto(false), [pathname]);

  // Com o menu aberto, a página atrás não rola e Esc fecha.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", onKey);
    window.setTimeout(() => painelRef.current?.querySelector("a")?.focus(), 0);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", onKey);
    };
  }, [aberto]);

  const linkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
      active
        ? "bg-[var(--color-primary)] text-white shadow-sm"
        : "text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
    }`;

  const marca = (
    <>
      <span
        className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-ink)] text-white"
        aria-hidden
      >
        <ShieldCheck className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate font-extrabold">Super Admin</span>
    </>
  );

  const navegacao = (
    <nav className="flex flex-col" aria-label="Menu da plataforma">
      {grupos.map((grupo) => (
        <div key={grupo.label} className="mt-4 flex flex-col gap-1 first:mt-1">
          <span className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
            {grupo.label}
          </span>
          {grupo.links.map(({ href, label, icon: Icon, exato }) => {
            const active = isActive(pathname, href, exato);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                <Icon className={`size-4 shrink-0 ${active ? "text-white" : "text-[var(--color-primary)]"}`} />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* ===== Celular: barra + botão ===== */}
      <div className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5 md:hidden">
        {marca}
        <span className="truncate text-xs text-[var(--color-muted)]">{atual?.label}</span>
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu da plataforma"
          aria-expanded={aberto}
          aria-controls="menu-plataforma"
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-black/10 text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/45 backdrop-blur-[2px]"
          />
          <div
            ref={painelRef}
            id="menu-plataforma"
            role="dialog"
            aria-modal="true"
            aria-label="Menu da plataforma"
            className="absolute inset-y-0 right-0 flex w-[17rem] max-w-[85vw] flex-col overflow-y-auto bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
              {marca}
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="p-3">{navegacao}</div>
          </div>
        </div>
      )}

      {/* ===== Desktop: sidebar fixa ===== */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-black/5 bg-white p-4 md:flex md:min-h-screen">
        <div className="flex items-center gap-2 px-2 py-3">{marca}</div>
        {navegacao}
      </aside>
    </>
  );
}
