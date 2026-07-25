import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ConversasList } from "./ConversasList";

export const dynamic = "force-dynamic";

export default async function ConversasPage() {
  const { tenant } = await requireTenant();
  const conversations = await services.conversationService.list(tenant.id);

  const items = conversations.map((c) => ({
    id: c.id,
    phone: c.phone,
    contactName: c.contactName,
    tags: c.tags,
    botPaused: c.botPaused,
    unread: c.unread,
    stage: c.stage as string,
    lastMessageAt: c.lastMessageAt.toISOString(),
  }));

  return (
    <div className="max-w-3xl">
      <AutoRefresh seconds={15} />
      <h1 className="text-2xl font-extrabold">Conversas</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Atendimento do WhatsApp em tempo real.</p>

      <ConversasList items={items} />

      {items.length === 0 && (
        <p className="mt-4 text-[var(--color-muted)]">Nenhuma conversa ainda. Elas aparecem aqui quando alguém manda mensagem no WhatsApp conectado.</p>
      )}
    </div>
  );
}
