"use server";
import { revalidatePath } from "next/cache";
import { requireRole, services, type ExpenseCategory } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

export async function addExpense(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  await services.expenseService.add(tenant.id, {
    category: String(formData.get("category")) as ExpenseCategory,
    amount: Number(formData.get("amount")),
    description: String(formData.get("description") || ""),
  });
  revalidatePath("/admin/financeiro");
}
