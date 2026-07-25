"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, type ConversationStage } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { sendText } from "@/lib/evolution";

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

/** Abre o card: contato + conversa + contexto, tudo sem sair do funil. */
export async function loadCardAction(id: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const c = await services.conversationService.get(tenant.id, id);
  if (!c) return null;
  return {
    id: c.id,
    phone: c.phone,
    contactName: c.contactName,
    tags: c.tags,
    botPaused: c.botPaused,
    stage: c.stage as string,
    notes: c.notes,
    notesAt: c.notesAt ? c.notesAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    messages: c.messages.map((m) => ({
      id: m.id,
      sender: m.sender as string,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** Atendente responde de dentro do funil (mesma regra do inbox: envia + registra). */
export async function replyFromFunilAction(id: string, phone: string, text: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const msg = text.trim();
  const to = phone.replace(/\D/g, "");
  if (!msg || !to) return { ok: false as const };

  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  const sent = await sendText(instance, to, msg);
  if (sent) await services.conversationService.recordOutbound(tenant.id, to, msg, "AGENT");
  revalidatePath("/admin/funil");
  return { ok: sent };
}

/** Salva as tags do contato pelo modal do card. */
export async function setTagsFromFunilAction(id: string, raw: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const tags = [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  await services.conversationService.setTags(tenant.id, id, tags);
  revalidatePath("/admin/funil");
  return { ok: true as const, tags };
}

/** Edita o contato (nome) direto no painel da esquerda. */
export async function updateContactAction(id: string, contactName: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  await services.conversationService.updateContact(tenant.id, id, { contactName });
  revalidatePath("/admin/funil");
  return { ok: true as const };
}

/** Assumir (pausa a IA) / devolver pro bot, sem sair do funil. */
export async function toggleBotAction(id: string, pause: boolean) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  if (pause) await services.conversationService.takeOver(tenant.id, id);
  else await services.conversationService.releaseToBot(tenant.id, id);
  revalidatePath("/admin/funil");
  return { ok: true as const };
}
