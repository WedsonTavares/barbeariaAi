"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, type ConversationStage } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { normalizeTag, STAGE_ONLY_TAGS } from "@/lib/tags";
import { sendPosFestaAutoMessage } from "@/lib/pos-festa";

/**
 * Arrastar o card muda a etapa. As tags acompanham (ver STAGE_TAG no core):
 * mover pra "Suporte humano" pausa a IA; sair de lá religa. A etapa nunca vem
 * confiável do cliente — validamos contra a lista permitida.
 *
 * Entrar em PÓS_FESTA dispara a mensagem automática (ver `sendPosFestaAutoMessage`).
 * Só na TRANSIÇÃO (`previousStage !== "POS_FESTA"`) — arrastar de novo pra mesma
 * coluna, ou um refresh que reenvie a mesma ação, não deve reenviar a mensagem.
 * A resposta do cliente cai no WhatsApp normal; quem direciona pro workflow
 * de pós-festa no n8n é a tag "pos-festa" que o `setStage` já aplicou.
 */
export async function moveCardAction(id: string, stage: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  if (!(services.CONVERSATION_STAGES as readonly string[]).includes(stage)) return { ok: false as const };

  const updated = await services.conversationService.setStage(tenant.id, id, stage as ConversationStage);

  if (stage === "POS_FESTA" && updated.previousStage !== "POS_FESTA") {
    await sendPosFestaAutoMessage(tenant, updated.phone);
  }

  revalidatePath("/admin/funil");
  return { ok: true as const };
}

/**
 * Liga/desliga uma tag sem substituir as demais nem marcar a conversa como lida.
 *
 * "pos-festa" tem o MESMO efeito de arrastar o card: o core já move a etapa
 * (ver `toggleTag`), e aqui — no mesmo espírito do `moveCardAction` acima —
 * disparamos a mesma mensagem automática, só na transição de verdade.
 */
export async function toggleTagFromFunilAction(id: string, tag: string, on: boolean) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const normalized = normalizeTag(tag);
  if (!normalized || STAGE_ONLY_TAGS.has(normalized)) {
    return { ok: false as const };
  }

  const changed = await services.conversationService.toggleTag(tenant.id, id, normalized, on);

  if (normalized === "pos-festa" && on && changed.previousStage !== "POS_FESTA") {
    await sendPosFestaAutoMessage(tenant, changed.phone);
  }

  revalidatePath("/admin/funil");
  revalidatePath("/admin/conversas");
  return {
    ok: true as const,
    tags: changed.tags,
    stage: changed.stage as string,
    botPaused: changed.botPaused,
  };
}
