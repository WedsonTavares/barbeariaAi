"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, services, schemas } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

export async function createBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
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
  try {
    await services.bookingService.create(tenant.id, data);
  } catch (e) {
    if (e instanceof services.BookingConflictError) redirect("/admin/reservas?erro=conflito");
    throw e;
  }
  revalidatePath("/admin/reservas");
  redirect("/admin/reservas?ok=1");
}

export async function confirmBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  await services.bookingService.confirm(tenant.id, String(formData.get("id")));
  revalidatePath("/admin/reservas");
}

export async function payBooking(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  await services.paymentService.record(tenant.id, {
    bookingId: String(formData.get("id")),
    amount: Number(formData.get("amount")),
    kind: "DEPOSIT",
    method: "pix",
  });
  revalidatePath("/admin/reservas");
}
