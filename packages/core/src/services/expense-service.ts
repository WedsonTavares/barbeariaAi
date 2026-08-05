import { withTenant } from "../db/withTenant";
import type { ExpenseCategory } from "@prisma/client";

export const expenseService = {
  add: (
    tenantId: string,
    input: { appointmentId?: string; category: ExpenseCategory; amount: number; description?: string; date?: Date }
  ) =>
    withTenant(tenantId, (tx) =>
      tx.expense.create({
        data: {
          tenantId,
          appointmentId: input.appointmentId,
          category: input.category,
          amount: input.amount,
          description: input.description,
          date: input.date ?? new Date(),
        },
      })
    ),
  listByAppointment: (tenantId: string, appointmentId: string) =>
    withTenant(tenantId, (tx) => tx.expense.findMany({ where: { appointmentId } })),
};
