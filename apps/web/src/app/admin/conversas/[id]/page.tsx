import { redirect } from "next/navigation";

/**
 * A conversa deixou de ter página própria: virou a coluna do meio do inbox.
 * Mantido como redirect pra links/favoritos antigos não quebrarem.
 */
export default async function ConversaLegacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/conversas?c=${id}`);
}
