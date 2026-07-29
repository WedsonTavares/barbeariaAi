"use server";
import { revalidatePath } from "next/cache";
import { currentRole, requireRole, schemas, services } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

/** Fluxo operacional da reserva (mesma ordem usada na tela de reservas). */
const NEXT_STATUS: Record<string, string> = {
  CONFIRMED: "IN_DELIVERY",
  IN_DELIVERY: "MOUNTED",
  MOUNTED: "PICKED_UP",
  PICKED_UP: "FINISHED",
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
