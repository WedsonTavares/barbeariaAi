"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { sendText } from "@/lib/evolution";
import { normalizeTag } from "@/lib/tags";

/**
 * Abre a conversa selecionada (thread + contexto). Zera o não-lido.
 *
 * As festas vêm do banco AGORA (`upcomingForPhone`), não do resumo escrito pela
 * IA: o resumo é um texto congelado no momento em que ela fechou algo e continua
 * afirmando "reserva fechada" mesmo se a reserva foi cancelada ou apagada depois.
 * Quem manda sobre o que está marcado é a tabela de reservas.
 */
export async function loadConversationAction(id: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const c = await services.conversationService.get(tenant.id, id);
  if (!c) return null;

  const bookings = await services.bookingService.upcomingForPhone(tenant.id, c.phone);

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
    bookings: bookings.map((b) => ({
      id: b.id,
      status: b.status as string,
      eventDate: b.eventDate.toISOString(),
      setupTime: b.setupTime ? b.setupTime.toISOString() : null,
      pickupTime: b.pickupTime ? b.pickupTime.toISOString() : null,
      total: Number(b.total),
      toys: b.items.map((i) => i.toy.name),
    })),
    messages: c.messages.map((m) => ({
      id: m.id,
      sender: m.sender as string,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** Atendente responde: envia no WhatsApp e registra no inbox como 🧑 Equipe. */
export async function replyAction(id: string, phone: string, text: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const msg = text.trim();
  const to = phone.replace(/\D/g, "");
  if (!msg || !to) return { ok: false as const };

  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  const sent = await sendText(instance, to, msg);
  if (sent) await services.conversationService.recordOutbound(tenant.id, to, msg, "AGENT");
  revalidatePath("/admin/conversas");
  return { ok: sent };
}

/** Liga/desliga UMA tag sem zerar não-lidas nem substituir as demais. */
export async function toggleTagAction(id: string, tag: string, on: boolean) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const t = normalizeTag(tag);
  if (!t) return { ok: false as const, tags: [] as string[] };

  const changed = await services.conversationService.toggleTag(tenant.id, id, t, on);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  return { ok: true as const, tags: changed.tags };
}

/** Assumir (pausa a IA) / devolver pro bot. */
export async function toggleBotAction(id: string, pause: boolean) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  if (pause) await services.conversationService.takeOver(tenant.id, id);
  else await services.conversationService.releaseToBot(tenant.id, id);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  return { ok: true as const };
}

/** Edita o nome exibido do contato no painel de detalhes. */
export async function updateContactAction(id: string, contactName: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  await services.conversationService.updateContact(tenant.id, id, { contactName });
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  return { ok: true as const };
}
