import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ConversasWorkspace, type ConversaRow } from "./ConversasWorkspace";

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { tenant } = await requireTenant();
  const conversations = await services.conversationService.list(tenant.id);

  // Datas viram string pra atravessar a fronteira server → client component.
  const items: ConversaRow[] = conversations.map((x) => ({
    id: x.id,
    phone: x.phone,
    contactName: x.contactName,
    tags: x.tags,
    botPaused: x.botPaused,
    unread: x.unread,
    stage: x.stage as string,
    lastMessageAt: x.lastMessageAt.toISOString(),
  }));

  // Só aceita o ?c= se a conversa existir neste tenant (o id vem da URL).
  const initialId = c && items.some((i) => i.id === c) ? c : undefined;

  return (
    <>
      <AutoRefresh seconds={15} />
      <ConversasWorkspace items={items} initialId={initialId} />
    </>
  );
}
