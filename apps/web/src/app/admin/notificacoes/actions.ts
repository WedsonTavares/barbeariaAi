"use server";
import { revalidatePath } from "next/cache";

import { requireRole, services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

export async function markAllNotificationsRead() {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  await services.notificationService.markAllRead(tenant.id);
  revalidatePath("/admin/notificacoes");
  revalidatePath("/admin", "layout"); // badge da sidebar
}
