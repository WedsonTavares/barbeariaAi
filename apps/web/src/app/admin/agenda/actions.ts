"use server";

import { revalidatePath } from "next/cache";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

export async function reloadAgendaAction() {
  const { tenant } = await requireTenant();
  const result = await services.calendarService.syncGoogleConnections(tenant.id);
  revalidatePath("/admin/agenda");
  return { ok: result.failed === 0 };
}
