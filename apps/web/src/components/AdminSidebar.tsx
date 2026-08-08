"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Scissors, Users, CalendarRange, Wallet, MessagesSquare, KanbanSquare, Settings, Braces, Images, Menu, X, UserRoundCog } from "lucide-react";

const GROUPS = [
  {
    label: "Atendimento",
    links: [
      { href: "/admin/dashboard", label: "Visão Geral", icon: LayoutDashboard },
      { href: "/admin/funil", label: "Funil", icon: KanbanSquare },
      { href: "/admin/conversas", label: "Conversas", icon: MessagesSquare },
      { href: "/admin/agenda", label: "Agenda", icon: CalendarRange },
    ],
  },
  {
    label: "Negócio",
    links: [
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/servicos", label: "Serviços", icon: Scissors },
      { href: "/admin/profissionais", label: "Profissionais", icon: UserRoundCog },
      { href: "/admin/agendamentos", label: "Agendamentos", icon: CalendarRange },
      { href: "/admin/galeria", label: "Galeria", icon: Images },
      { href: "/admin/financeiro", label: "Financeiro", icon: Wallet },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

/**
 * Ferramentas de operador, não do cliente. A documentação da API tem "Try it
 * out" que dispara requisição REAL em produção — não é algo para uma barbearia
 * encontrar no menu por acidente.
 */
const GRUPOS_SUPER_ADMIN = [
  {
    label: "Plataforma",
    links: [{ href: "/admin/api-docs", label: "API", icon: Braces }],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sidebar fixa no desktop; no celular vira barra com botão de menu.
 *
 * Antes o celular recebia a MESMA lista em rolagem horizontal: cabiam três
 * itens e meio na tela e os outros seis ficavam escondidos, sem nenhuma pista
 * de que dava pra rolar — quem abria no telefone achava que o painel tinha
 * três telas. O botão mostra tudo de uma vez, com os agrupamentos.
 */
export function AdminSidebar({
  tenantName,
  superAdmin = false,
}: {
  tenantName: string;
  superAdmin?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const grupos = superAdmin ? [...GROUPS, ...GRUPOS_SUPER_ADMIN] : GROUPS;
  const todosOsLinks = grupos.flatMap((g) => g.links);
  const [aberto, setAberto] = useState(false);
  const painelRef = useRef<HTMLDivElement>(null);
  const inicial = tenantName.trim().charAt(0).toUpperCase() || "D";

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

  const atual = todosOsLinks.find((l) => isActive(pathname, l.href));

  return (
    <>
      {/*
        ===== Celular: barra + botão =====
        Sem `sticky`: a AdminTopbar logo abaixo já é sticky no topo, e duas
        barras presas em top-0 se sobrepõem. A nav antiga também rolava junto.
      */}
      <div className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5 md:hidden">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-sm font-black text-white" aria-hidden>
          {inicial}
        </span>
        <span className="min-w-0 flex-1 truncate font-extrabold">{atual?.label ?? tenantName}</span>
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu do painel"
          aria-expanded={aberto}
          aria-controls="menu-painel"
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
            id="menu-painel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu do painel"
            className="absolute inset-y-0 right-0 flex w-[17rem] max-w-[85vw] flex-col overflow-y-auto bg-white shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-black/5 px-4 py-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-sm font-black text-white" aria-hidden>
                {inicial}
              </span>
              <span className="min-w-0 flex-1 truncate font-extrabold">{tenantName}</span>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar menu"
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <nav className="flex flex-col gap-1 p-3" aria-label="Menu do painel">
              {grupos.map((group) => (
                <div key={group.label} className="mt-3 flex flex-col gap-1 first:mt-0">
                  <span className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                    {group.label}
                  </span>
                  {group.links.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link key={href} href={href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                        <Icon className={`size-4 shrink-0 ${active ? "text-white" : "text-[var(--color-primary)]"}`} /> {label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ===== Desktop: sidebar fixa ===== */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-black/5 bg-white p-4 md:flex md:min-h-screen">
        <div className="flex items-center gap-2 px-2 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-sm font-black text-white" aria-hidden>
            {inicial}
          </span>
          <span className="truncate font-extrabold">{tenantName}</span>
        </div>

        <nav className="flex flex-col" aria-label="Menu do painel">
          {grupos.map((group) => (
            <div key={group.label} className="mt-4 flex flex-col gap-1 first:mt-1">
              <span className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                {group.label}
              </span>
              {group.links.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link key={href} href={href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                    <Icon className={`size-4 shrink-0 ${active ? "text-white" : "text-[var(--color-primary)]"}`} /> {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
