import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { Bell } from "lucide-react";

/**
 * Barra superior do painel: sino de notificações (com contador) + troca de
 * organização + conta. Fica fixa no topo à direita, como num CRM.
 */
export function AdminTopbar({ unreadCount = 0 }: { unreadCount?: number }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-black/5 bg-white/90 px-4 backdrop-blur md:px-6">
      <Link
        href="/admin/notificacoes"
        aria-label={unreadCount > 0 ? `Notificações: ${unreadCount} não lidas` : "Notificações"}
        className="relative grid size-9 place-items-center rounded-full text-[var(--color-ink)] hover:bg-[var(--color-surface)]"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
      <div className="h-6 w-px bg-black/10" />
      <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/admin/dashboard" />
      <UserButton />
    </header>
  );
}
