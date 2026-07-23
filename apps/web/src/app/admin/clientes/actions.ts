"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/clientes";

export async function createCustomer(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  let dest = `${BASE}?ok=1`;
  try {
    const data = schemas.customerInput.parse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email") || "",
      neighborhood: formData.get("neighborhood") || undefined,
      address: formData.get("address") || undefined,
      imageConsent: formData.get("imageConsent") === "on",
    });
    await services.customerService.create(tenant.id, data);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}
