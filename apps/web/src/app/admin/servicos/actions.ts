"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, schemas, services, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/servicos";

export async function createServiceAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=criado`;
  try {
    const data = schemas.serviceInput.parse({
      name: formData.get("name"),
      category: formData.get("category") || "OTHER",
      description: formData.get("description") || undefined,
      durationMinutes: formData.get("durationMinutes"),
      bufferBeforeMinutes: formData.get("bufferBeforeMinutes") || 0,
      bufferAfterMinutes: formData.get("bufferAfterMinutes") || 0,
      defaultPrice: formData.get("defaultPrice"),
      locationMode: formData.get("locationMode") || "SALON",
    });
    await services.serviceCatalogService.create(tenant.id, data);
  } catch (error) {
    if (error instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw error;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function setServiceStatusAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const status = schemas.serviceStatus.parse(formData.get("status"));
    await services.serviceCatalogService.setStatus(tenant.id, id, status);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
  }
  revalidatePath(BASE);
}
