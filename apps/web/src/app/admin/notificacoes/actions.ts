"use server";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

export async function markNotificationRead(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  try {
    const id = schemas.idInput.parse(formData.get("id"));
    await services.notificationService.markRead(tenant.id, id);
  } catch (e) {
    if (!(e instanceof ZodError)) throw e;
  }
  revalidatePath("/admin/notificacoes");
  revalidatePath("/admin", "layout"); // badge da sidebar
}
