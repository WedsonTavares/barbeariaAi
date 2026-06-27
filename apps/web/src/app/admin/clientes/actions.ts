"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, schemas } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

export async function createCustomer(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  const data = schemas.customerInput.parse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email") || "",
    neighborhood: formData.get("neighborhood") || undefined,
    address: formData.get("address") || undefined,
    imageConsent: formData.get("imageConsent") === "on",
  });
  await services.customerService.create(tenant.id, data);
  revalidatePath("/admin/clientes");
}
