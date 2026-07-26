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
    else if (e instanceof services.CustomerDuplicateError) dest = `${BASE}?erro=duplicado`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}

export async function updateCustomer(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);

  const rawId = String(formData.get("id") ?? "");
  let parsedId: string | null = null;
  let dest = `${BASE}?ok=editado`;
  try {
    const id = schemas.idInput.parse(rawId);
    parsedId = id;
    const data = schemas.customerUpdateInput.parse({
      name: formData.get("name"),
      email: formData.get("email") || "",
      neighborhood: formData.get("neighborhood") || undefined,
      address: formData.get("address") || undefined,
      imageConsent: formData.get("imageConsent") === "on",
    });
    const updated = await services.customerService.update(tenant.id, id, data);
    if (!updated) dest = `${BASE}?erro=nao_encontrado`;
  } catch (error) {
    if (error instanceof ZodError) {
      const params = new URLSearchParams({ erro: "edicao" });
      if (rawId) params.set("editar", rawId);
      dest = `${BASE}?${params.toString()}`;
    } else {
      throw error;
    }
  }

  revalidatePath(BASE);
  if (parsedId) revalidatePath(`${BASE}/${parsedId}`);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  redirect(dest);
}

export async function removeCustomer(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  let dest = `${BASE}?ok=removido`;
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    const result = await services.customerService.removeRegistration(tenant.id, id);
    if (!result.removed) {
      const errors = {
        NOT_FOUND: "nao_encontrado",
        BOOKINGS: "cliente_com_reservas",
        HISTORY: "cliente_com_historico",
        DATA: "cliente_com_dados",
      } as const;
      dest = `${BASE}?erro=${errors[result.reason]}`;
    }
  } catch (error) {
    if (error instanceof ZodError) dest = `${BASE}?erro=nao_encontrado`;
    else throw error;
  }

  revalidatePath(BASE);
  revalidatePath("/admin/conversas");
  revalidatePath("/admin/funil");
  redirect(dest);
}
