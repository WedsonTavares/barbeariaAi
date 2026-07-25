import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { LayoutDashboard, Boxes, Users, CalendarDays, CalendarRange, Wallet, Bell, BarChart3, MessagesSquare, MessageCircle, KanbanSquare } from "lucide-react";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarRange },
  { href: "/admin/reservas", label: "Reservas", icon: CalendarDays },
  { href: "/admin/brinquedos", label: "Brinquedos", icon: Boxes },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/admin/funil", label: "Funil", icon: KanbanSquare },
  { href: "/admin/conversas", label: "Conversas", icon: MessagesSquare },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/admin/notificacoes", label: "Notificações", icon: Bell },
];

/** Sidebar no desktop; vira barra superior com navegação horizontal no celular. */
export function AdminSidebar({ tenantName, unreadCount = 0 }: { tenantName: string; unreadCount?: number }) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-2 border-b border-black/5 bg-white p-3 md:min-h-screen md:w-60 md:border-b-0 md:border-r md:p-4">
      <div className="flex items-center justify-between gap-2 px-2 py-1 md:py-3">
        <span className="truncate font-extrabold">{tenantName}</span>
        <span className="flex items-center gap-2 md:hidden">
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/admin/dashboard" />
          <UserButton />
        </span>
      </div>
      <nav className="flex flex-row gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0" aria-label="Menu do painel">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface)] md:gap-3">
            <Icon className="size-4 text-[var(--color-primary)]" /> {label}
            {href === "/admin/notificacoes" && unreadCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white" aria-label={`${unreadCount} não lidas`}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto hidden items-center justify-between gap-2 border-t border-black/5 pt-3 md:flex">
        <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/admin/dashboard" />
        <UserButton />
      </div>
    </aside>
  );
}
