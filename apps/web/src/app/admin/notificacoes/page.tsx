import { requireTenant } from "@/lib/tenant";
import { services } from "@barbearia-ai/core";
import { fmtDateTime } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { markAllNotificationsRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificacoesPage() {
  const { tenant } = await requireTenant();
  const notifications = await services.notificationService.listUnread(tenant.id);

  return (
    <div className="max-w-3xl">
      <AutoRefresh seconds={60} />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Notificações</h1>
        {notifications.length > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold hover:bg-[var(--color-surface)]">
              Marcar todas como lidas
            </button>
          </form>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {notifications.map((n) => (
          <div key={n.id} className="rounded-xl border border-black/5 bg-white p-4">
            <div>
              <div className="font-semibold">{n.title}</div>
              {n.body && <div className="text-sm text-[var(--color-muted)]">{n.body}</div>}
              <div className="mt-1 text-xs text-[var(--color-muted)]">{fmtDateTime(n.createdAt)}</div>
            </div>
          </div>
        ))}
        {notifications.length === 0 && <p className="text-[var(--color-muted)]">Nenhuma notificação pendente. 🎉</p>}
      </div>
    </div>
  );
}
