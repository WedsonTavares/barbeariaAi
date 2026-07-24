"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { sendText } from "@/lib/evolution";

/** Atendente responde: envia no WhatsApp + salva no inbox. Assumir pausa o bot. */
export async function replyAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const id = String(formData.get("id"));
  const phone = String(formData.get("phone")).replace(/\D/g, "");
  const text = String(formData.get("text") || "").trim();
  if (!text || !phone) return;

  const sent = await sendText(phone, text);
  if (sent) await services.conversationService.recordOutbound(tenant.id, phone, text, "AGENT");
  revalidatePath(`/admin/conversas/${id}`);
}

export async function takeOverAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const id = String(formData.get("id"));
  await services.conversationService.takeOver(tenant.id, id);
  revalidatePath(`/admin/conversas/${id}`);
}

export async function releaseAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const id = String(formData.get("id"));
  await services.conversationService.releaseToBot(tenant.id, id);
  revalidatePath(`/admin/conversas/${id}`);
}

/** Salva as tags do contato (uma por linha / separadas por vírgula). */
export async function setTagsAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const id = String(formData.get("id"));
  try {
    const raw = String(formData.get("tags") || "");
    const tags = [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    await services.conversationService.setTags(tenant.id, id, tags);
  } catch (e) {
    if (!(e instanceof ZodError)) throw e;
  }
  revalidatePath(`/admin/conversas/${id}`);
}
