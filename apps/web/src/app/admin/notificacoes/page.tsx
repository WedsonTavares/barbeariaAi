import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { fmtDateTime } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { markNotificationRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificacoesPage() {
  const { tenant } = await requireTenant();
  const notifications = await services.notificationService.listUnread(tenant.id);

  return (
    <div className="max-w-3xl">
      <AutoRefresh seconds={60} />
      <h1 className="text-2xl font-extrabold">Notificações</h1>
      <div className="mt-4 space-y-2">
        {notifications.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-3 rounded-xl border border-black/5 bg-white p-4">
            <div>
              <div className="font-semibold">{n.title}</div>
              {n.body && <div className="text-sm text-[var(--color-muted)]">{n.body}</div>}
              <div className="mt-1 text-xs text-[var(--color-muted)]">{fmtDateTime(n.createdAt)}</div>
            </div>
            <form action={markNotificationRead}>
              <input type="hidden" name="id" value={n.id} />
              <button className="shrink-0 rounded-full border border-black/10 px-3 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]">Marcar lida</button>
            </form>
          </div>
        ))}
        {notifications.length === 0 && <p className="text-[var(--color-muted)]">Nenhuma notificação pendente. 🎉</p>}
      </div>
    </div>
  );
}
