"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const BASE = "/admin/financeiro";

export async function addExpense(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  let dest = `${BASE}?ok=1`;
  try {
    const data = schemas.expenseInput.parse({
      category: formData.get("category"),
      amount: formData.get("amount"),
      description: formData.get("description") || undefined,
    });
    await services.expenseService.add(tenant.id, data);
  } catch (e) {
    if (e instanceof ZodError) dest = `${BASE}?erro=validacao`;
    else throw e;
  }
  revalidatePath(BASE);
  redirect(dest);
}
