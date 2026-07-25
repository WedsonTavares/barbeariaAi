"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/reservas";

export async function createBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  let dest = `${BASE}?ok=criada`;
  try {
    const data = schemas.bookingInput.parse({
      customerId: formData.get("customerId"),
      eventDate: formData.get("eventDate"),
      setupTime: formData.get("setupTime"),
      pickupTime: formData.get("pickupTime"),
      total: formData.get("total"),
      depositAmount: formData.get("depositAmount") || 0,
      neighborhood: formData.get("neighborhood") || undefined,
      address: formData.get("address") || undefined,
      toyIds: formData.getAll("toyIds").map(String),
    });
    await services.bookingService.create(tenant.id, data);
  } catch (e) {
    if (e instanceof services.BookingConflictError) dest = `${BASE}?erro=conflito`;
    else if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function updateBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  let id = "";
  let dest = `${BASE}?ok=editada`;
  try {
    id = schemas.idInput.parse(formData.get("id"));
    const data = schemas.bookingUpdateInput.parse({
      eventDate: formData.get("eventDate"),
      setupTime: formData.get("setupTime"),
      pickupTime: formData.get("pickupTime"),
      total: formData.get("total"),
      depositAmount: formData.get("depositAmount") || 0,
      neighborhood: formData.get("neighborhood") || undefined,
      address: formData.get("address") || undefined,
      notes: formData.get("notes") || undefined,
      toyIds: formData.getAll("toyIds").map(String),
    });
    await services.bookingService.update(tenant.id, id, data);
  } catch (e) {
    // Erros voltam pra tela de edição, preservando o contexto.
    const back = id ? `${BASE}/${id}` : BASE;
    if (e instanceof services.BookingConflictError) dest = `${back}?erro=conflito`;
    else if (e instanceof services.BookingStateError) dest = `${back}?erro=estado`;
    else if (e instanceof ZodError) dest = `${back}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

/** Avança o status na ordem da operação. O próximo passo é decidido AQUI, nunca pelo cliente. */
const NEXT_STATUS: Record<string, "IN_DELIVERY" | "MOUNTED" | "PICKED_UP" | "FINISHED"> = {
  CONFIRMED: "IN_DELIVERY",
  IN_DELIVERY: "MOUNTED",
  MOUNTED: "PICKED_UP",
  PICKED_UP: "FINISHED",
};

export async function advanceBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  let dest = `${BASE}?ok=andamento`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const booking = await services.bookingService.get(tenant.id, id);
    const next = booking ? NEXT_STATUS[booking.status] : undefined;
    if (!next) throw new services.BookingStateError("Sem próximo passo para esse status");
    await services.bookingService.setStatus(tenant.id, id, next);
  } catch (e) {
    if (e instanceof services.BookingStateError || e instanceof ZodError) dest = `${BASE}?erro=estado`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function confirmBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=confirmada`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    await services.bookingService.confirm(tenant.id, id);
  } catch (e) {
    if (e instanceof services.BookingStateError || e instanceof ZodError) dest = `${BASE}?erro=estado`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function cancelBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=cancelada`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    await services.bookingService.setStatus(tenant.id, id, "CANCELED");
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=estado`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function payBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  let dest = `${BASE}?ok=pagamento`;
  try {
    const data = schemas.paymentInput.parse({
      bookingId: formData.get("id"),
      amount: formData.get("amount"),
      method: "pix",
    });
    await services.paymentService.record(tenant.id, data);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=pagamento`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}
