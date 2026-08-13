"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, type ConversationStage } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { normalizeTag, STAGE_ONLY_TAGS } from "@/lib/tags";
import { sendPosAtendimentoAutoMessage } from "@/lib/pos-atendimento";
import { isSystemFunnelColumn, normalizeFunnelConfig } from "@/lib/funnel-config";

/**
 * Arrastar para coluna do sistema muda a etapa e mantém os efeitos existentes.
 * Arrastar para coluna personalizada grava só a posição visual: não toca em
 * tag, IA, agenda nem mensagem. Todo destino é validado contra a configuração
 * do tenant; um id inventado no navegador não é aceito.
 *
 * Entrar em POS_ATENDIMENTO dispara a mensagem automática.
 * Só na TRANSIÇÃO (`previousStage !== "POS_ATENDIMENTO"`) — arrastar de novo pra mesma
 * coluna, ou um refresh que reenvie a mesma ação, não deve reenviar a mensagem.
 * A resposta do cliente cai no WhatsApp normal; quem direciona pro workflow
 * de pós-atendimento no n8n é a tag "pos-atendimento" que o `setStage` já aplicou.
 */
export async function moveCardAction(id: string, stage: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  if (!isSystemFunnelColumn(stage)) {
    const settings = await services.tenantService.getSettings(tenant.id);
    const custom = normalizeFunnelConfig(settings?.funnelConfig).columns.find(
      (column) => column.kind === "custom" && column.id === stage
    );
    if (!custom) return { ok: false as const };

    await services.conversationService.setFunnelColumn(tenant.id, id, custom.id);
    revalidatePath("/admin/funil");
    return { ok: true as const };
  }

  if (!(services.CONVERSATION_STAGES as readonly string[]).includes(stage)) {
    return { ok: false as const };
  }

  const updated = await services.conversationService.setStage(tenant.id, id, stage as ConversationStage);

  if (stage === "POS_ATENDIMENTO" && updated.previousStage !== "POS_ATENDIMENTO") {
    await sendPosAtendimentoAutoMessage(tenant, updated.phone);
  }

  revalidatePath("/admin/funil");
  return { ok: true as const };
}

/**
 * Liga/desliga uma tag sem substituir as demais nem marcar a conversa como lida.
 *
 * "pos-atendimento" tem o MESMO efeito de arrastar o card: o core já move a etapa
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

  if (normalized === "pos-atendimento" && on && changed.previousStage !== "POS_ATENDIMENTO") {
    await sendPosAtendimentoAutoMessage(tenant, changed.phone);
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
