import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { LayoutDashboard, Boxes, Users, CalendarDays, Wallet } from "lucide-react";

const LINKS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/brinquedos", label: "Brinquedos", icon: Boxes },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/reservas", label: "Reservas", icon: CalendarDays },
  { href: "/admin/financeiro", label: "Financeiro", icon: Wallet },
];

export function AdminSidebar({ tenantName }: { tenantName: string }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2 border-r border-black/5 bg-white p-4">
      <div className="px-2 py-3 font-extrabold">{tenantName}</div>
      <nav className="flex flex-col gap-1">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--color-ink)] hover:bg-[var(--color-surface)]">
            <Icon className="size-4 text-[var(--color-primary)]" /> {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-black/5 pt-3">
        <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/admin/dashboard" />
        <UserButton />
      </div>
    </aside>
  );
}
