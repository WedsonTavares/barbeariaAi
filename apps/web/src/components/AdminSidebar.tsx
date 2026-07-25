import Link from "next/link";
import { LayoutDashboard, Boxes, Users, CalendarDays, CalendarRange, Wallet, MessagesSquare, KanbanSquare, Settings } from "lucide-react";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/funil", label: "Funil", icon: KanbanSquare },
  { href: "/admin/conversas", label: "Conversas", icon: MessagesSquare },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarRange },
  { href: "/admin/reservas", label: "Reservas", icon: CalendarDays },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/brinquedos", label: "Brinquedos", icon: Boxes },
  { href: "/admin/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

/** Sidebar no desktop; vira barra de navegação horizontal no celular. */
export function AdminSidebar({ tenantName }: { tenantName: string }) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-2 border-b border-black/5 bg-white p-3 md:min-h-screen md:w-56 md:border-b-0 md:border-r md:p-4">
      <div className="px-2 py-1 md:py-3">
        <span className="truncate font-extrabold">{tenantName}</span>
      </div>
      <nav className="flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0" aria-label="Menu do painel">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface)] md:gap-3"
          >
            <Icon className="size-4 text-[var(--color-primary)]" /> {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
