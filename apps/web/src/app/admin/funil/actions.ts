"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, type ConversationStage } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { normalizeTag, STAGE_ONLY_TAGS } from "@/lib/tags";

/**
 * Arrastar o card muda a etapa. As tags acompanham (ver STAGE_TAG no core):
 * mover pra "Suporte humano" pausa a IA; sair de lá religa. A etapa nunca vem
 * confiável do cliente — validamos contra a lista permitida.
 */
export async function moveCardAction(id: string, stage: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  if (!(services.CONVERSATION_STAGES as readonly string[]).includes(stage)) return { ok: false as const };

  await services.conversationService.setStage(tenant.id, id, stage as ConversationStage);
  revalidatePath("/admin/funil");
  return { ok: true as const };
}

/** Liga/desliga uma tag sem substituir as demais nem marcar a conversa como lida. */
export async function toggleTagFromFunilAction(id: string, tag: string, on: boolean) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const normalized = normalizeTag(tag);
  if (!normalized || STAGE_ONLY_TAGS.has(normalized)) {
    return { ok: false as const };
  }

  const changed = await services.conversationService.toggleTag(tenant.id, id, normalized, on);
  revalidatePath("/admin/funil");
  revalidatePath("/admin/conversas");
  return {
    ok: true as const,
    tags: changed.tags,
    stage: changed.stage as string,
    botPaused: changed.botPaused,
  };
}
