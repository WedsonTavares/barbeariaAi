"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, schemas, services, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/profissionais";

export async function createProfessionalAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=criado`;
  try {
    const data = schemas.professionalInput.parse({
      name: formData.get("name"),
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
      bio: formData.get("bio") || undefined,
      color: formData.get("color") || "#2563EB",
      defaultCalendarId: formData.get("defaultCalendarId") || undefined,
      defaultCommissionType: formData.get("defaultCommissionType") || "NONE",
      defaultCommissionValue: formData.get("defaultCommissionValue") || undefined,
    });
    await services.professionalService.create(tenant.id, data);
  } catch (error) {
    if (error instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw error;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function setProfessionalStatusAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const status = schemas.professionalStatus.parse(formData.get("status"));
    await services.professionalService.setStatus(tenant.id, id, status);
  } catch (error) {
    if (!(error instanceof ZodError)) throw error;
  }
  revalidatePath(BASE);
}
