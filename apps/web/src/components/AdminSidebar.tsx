"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Boxes, Users, CalendarRange, Wallet, MessagesSquare, KanbanSquare, Settings } from "lucide-react";

// Reservas não fica no menu: as festas se abrem pelo calendário da Agenda.
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
      { href: "/admin/brinquedos", label: "Brinquedos", icon: Boxes },
      { href: "/admin/financeiro", label: "Financeiro", icon: Wallet },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

/** Sidebar no desktop; vira barra de navegação horizontal no celular. */
export function AdminSidebar({ tenantName }: { tenantName: string }) {
  const pathname = usePathname() ?? "";

  return (
    <aside className="flex w-full shrink-0 flex-col gap-1 border-b border-black/5 bg-white p-3 md:min-h-screen md:w-56 md:border-b-0 md:border-r md:p-4">
      <div className="flex items-center gap-2 px-2 py-1 md:py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-sm font-black text-white" aria-hidden>
          {tenantName.trim().charAt(0).toUpperCase() || "D"}
        </span>
        <span className="truncate font-extrabold">{tenantName}</span>
      </div>

      <nav className="flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0 md:overflow-visible md:pb-0" aria-label="Menu do painel">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-row gap-1 md:mt-4 md:flex-col md:gap-1 md:first:mt-1">
            <span className="hidden px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)] md:block">
              {group.label}
            </span>
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors md:gap-3 ${
                    active
                      ? "bg-[var(--color-primary)] text-white shadow-sm"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
                  }`}
                >
                  <Icon className={`size-4 ${active ? "text-white" : "text-[var(--color-primary)]"}`} /> {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
