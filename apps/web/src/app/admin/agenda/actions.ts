"use server";
import { revalidatePath } from "next/cache";
import { currentRole, requireRole, schemas, services } from "@diny/core";
import { requireTenant } from "@/lib/tenant";
import { avisarEquipe } from "@/lib/aviso-interno";

const SP_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Aviso de cancelamento no WhatsApp da equipe. Lê a reserva DEPOIS de cancelar
 * pra mandar os dados reais (cliente, data, endereço) em vez de só o id.
 */
async function avisoDeCancelamento(tenant: { id: string; slug: string }, bookingId: string) {
  try {
    const b = await services.bookingService.get(tenant.id, bookingId);
    if (!b) return;
    const linhas = [
      "❌ Reserva CANCELADA",
      `👤 ${b.customer.name} (${b.customer.phone})`,
      b.setupTime ? `🕒 Era ${SP_FMT.format(b.setupTime)}` : null,
      b.address || b.neighborhood ? `📍 ${[b.address, b.neighborhood].filter(Boolean).join(" — ")}` : null,
      b.items.length ? `🎪 ${b.items.map((i) => i.toy.name).join(", ")}` : null,
    ].filter(Boolean);
    await avisarEquipe(tenant, linhas.join("\n"));
  } catch (error) {
    console.error("[cancelamento] aviso não enviado", error);
  }
}

/**
 * Fluxo operacional do dia a dia: confirmada → montado → retirado.
 *
 * Os outros status continuam existindo no banco e no histórico (e na gaveta
 * "Mudar para outro status"), mas o caminho de um clique é esse: na prática só
 * interessa saber se o brinquedo já foi montado e se já foi buscado. "Em
 * entrega" e "finalizada" viravam clique a mais sem informação nova.
 */
const NEXT_STATUS: Record<string, string> = {
  CONFIRMED: "MOUNTED",
  IN_DELIVERY: "MOUNTED",
  MOUNTED: "PICKED_UP",
};
const ALLOWED = new Set([
  "LEAD", "QUOTE_SENT", "WAITING_DEPOSIT", "CONFIRMED",
  "IN_DELIVERY", "MOUNTED", "PICKED_UP", "FINISHED", "CANCELED",
]);

/** Abre a reserva no modal da agenda (sem sair do calendário). */
export async function loadBookingAction(id: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const b = await services.bookingService.get(tenant.id, id);
  if (!b) return null;
  const paid = b.payments.reduce((s, p) => s + Number(p.amount), 0);
  const role = currentRole(ctx);
  return {
    id: b.id,
    status: b.status as string,
    paymentStatus: b.paymentStatus as string,
    eventDate: b.eventDate.toISOString(),
    setupTime: b.setupTime ? b.setupTime.toISOString() : null,
    pickupTime: b.pickupTime ? b.pickupTime.toISOString() : null,
    neighborhood: b.neighborhood,
    address: b.address,
    notes: b.notes,
    total: Number(b.total),
    depositAmount: Number(b.depositAmount),
    paid,
    customer: { id: b.customer.id, name: b.customer.name, phone: b.customer.phone },
    toys: b.items.map((i) => ({ id: i.toyId, name: i.toy.name, price: Number(i.price) })),
    nextStatus: NEXT_STATUS[b.status] ?? null,
    canDelete: role === "OWNER" || role === "ADMIN",
  };
}

/** Muda o status direto do modal. CONFIRMED usa confirm() (gera os lembretes). */
export async function setBookingStatusAction(id: string, status: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, status === "CANCELED" || status === "CONFIRMED" ? ["OWNER", "ADMIN"] : ["OWNER", "ADMIN", "STAFF"]);
  if (!ALLOWED.has(status)) return { ok: false as const, error: "status inválido" };

  try {
    if (status === "CONFIRMED") await services.bookingService.confirm(tenant.id, id);
    else await services.bookingService.setStatus(tenant.id, id, status as Parameters<typeof services.bookingService.setStatus>[2]);
  } catch (e) {
    if (e instanceof services.BookingStateError) return { ok: false as const, error: e.message };
    throw e;
  }

  // Cancelou: avisa a equipe no WhatsApp. Fica DEPOIS do cancelamento e sem
  // await bloqueante de erro — o cancelamento já aconteceu, o aviso é extra.
  if (status === "CANCELED") await avisoDeCancelamento(tenant, id);

  revalidatePath("/admin/agenda");
  revalidatePath("/admin/reservas");
  return { ok: true as const };
}

/** Apaga fisicamente somente uma reserva que já esteja cancelada. */
export async function deleteCanceledBookingAction(id: string) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  const parsed = schemas.idInput.safeParse(id);
  if (!parsed.success) return { ok: false as const, error: "Reserva inválida" };

  try {
    await services.bookingService.removeCanceled(tenant.id, parsed.data);
  } catch (e) {
    if (e instanceof services.BookingStateError) return { ok: false as const, error: e.message };
    throw e;
  }
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/reservas");
  return { ok: true as const };
}

/** Registra um pagamento (sinal ou restante) sem sair da agenda. */
export async function recordPaymentAction(id: string, amount: number) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  if (!(amount > 0)) return { ok: false as const, error: "valor inválido" };
  await services.paymentService.record(tenant.id, { bookingId: id, amount, method: "pix" });
  revalidatePath("/admin/agenda");
  return { ok: true as const };
}
