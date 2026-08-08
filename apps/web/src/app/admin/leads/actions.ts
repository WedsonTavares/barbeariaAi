"use server";

import { revalidatePath } from "next/cache";

import { AccessError, requireRole, schemas, services, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/leads";

/**
 * Move o lead de etapa.
 *
 * STAFF pode: quem atende é quem sabe se a pessoa respondeu. Só OWNER/ADMIN
 * seria burocracia — e o dado é do próprio atendimento, não financeiro.
 */
export async function setLeadStatusAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  try {
    requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
    const id = schemas.idInput.parse(formData.get("id"));
    const status = schemas.leadStatus.parse(formData.get("status"));
    await services.leadService.setStatus(tenant.id, id, status);
  } catch (error) {
    // Permissão e dado inválido não derrubam a tela: a lista recarrega igual.
    if (!(error instanceof ZodError) && !(error instanceof AccessError)) throw error;
  }
  revalidatePath(BASE);
}
