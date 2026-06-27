import { withTenant } from "../db/withTenant";
import type { ExpenseCategory } from "@prisma/client";

export const expenseService = {
  add: (
    tenantId: string,
    input: { bookingId?: string; category: ExpenseCategory; amount: number; description?: string; date?: Date }
  ) =>
    withTenant(tenantId, (tx) =>
      tx.expense.create({
        data: {
          tenantId,
          bookingId: input.bookingId,
          category: input.category,
          amount: input.amount,
          description: input.description,
          date: input.date ?? new Date(),
        },
      })
    ),
  listByBooking: (tenantId: string, bookingId: string) =>
    withTenant(tenantId, (tx) => tx.expense.findMany({ where: { bookingId } })),
};
