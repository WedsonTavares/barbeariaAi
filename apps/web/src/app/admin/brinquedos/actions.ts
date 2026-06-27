"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, schemas } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

export async function createToy(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  const data = schemas.toyInput.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    description: formData.get("description") || undefined,
    purchasePrice: formData.get("purchasePrice"),
    defaultRentPrice: formData.get("defaultRentPrice"),
  });
  await services.toyService.create(tenant.id, data);
  revalidatePath("/admin/brinquedos");
}
