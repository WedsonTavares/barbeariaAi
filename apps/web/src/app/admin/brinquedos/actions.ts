"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/brinquedos";


export async function createToy(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=1`;
  try {
    const data = schemas.toyInput.parse({
      name: formData.get("name"),
      category: formData.get("category"),
      description: formData.get("description") || undefined,
      purchasePrice: formData.get("purchasePrice"),
      defaultRentPrice: formData.get("defaultRentPrice"),
    });
    await services.toyService.create(tenant.id, data);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function setToyStatus(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const status = schemas.toyStatus.parse(formData.get("status"));
    await services.toyService.setStatus(tenant.id, id, status);
  } catch (e) {
    if (!(e instanceof ZodError)) throw e;
  }
  revalidatePath(BASE);
}
