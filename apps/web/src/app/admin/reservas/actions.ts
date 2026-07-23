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
