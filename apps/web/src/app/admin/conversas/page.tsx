import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { fmtDateTime } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const { tenant } = await requireTenant();
  const conversations = await services.conversationService.list(tenant.id);

  return (
    <div className="max-w-3xl">
      <AutoRefresh seconds={15} />
      <h1 className="text-2xl font-extrabold">Conversas</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Atendimento do WhatsApp em tempo real.</p>

      <div className="mt-4 space-y-2">
        {conversations.map((c) => (
          <Link key={c.id} href={`/admin/conversas/${c.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-white p-4 hover:bg-[var(--color-surface)]">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.contactName || c.phone}</span>
                {c.botPaused && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">atendimento humano</span>}
                {c.tags.filter((t) => t !== "atendimento-humano").map((t) => (
                  <span key={t} className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold">{t}</span>
                ))}
              </div>
              <div className="text-xs text-[var(--color-muted)]">{c.phone} · {fmtDateTime(c.lastMessageAt)}</div>
            </div>
            {c.unread > 0 && <span className="shrink-0 rounded-full bg-[#25D366] px-2 py-0.5 text-xs font-bold text-white">{c.unread}</span>}
          </Link>
        ))}
        {conversations.length === 0 && (
          <p className="text-[var(--color-muted)]">Nenhuma conversa ainda. Elas aparecem aqui quando alguém manda mensagem no WhatsApp conectado.</p>
        )}
      </div>
    </div>
  );
}
