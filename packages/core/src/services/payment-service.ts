import { withTenant } from "../db/withTenant";
import type { PaymentKind } from "@prisma/client";

export const paymentService = {
  record: (
    tenantId: string,
    input: { bookingId: string; amount: number; kind?: PaymentKind; method?: string }
  ) =>
    withTenant(tenantId, async (tx) => {
      await tx.payment.create({
        data: {
          tenantId,
          bookingId: input.bookingId,
          amount: input.amount,
          kind: input.kind ?? "DEPOSIT",
          method: input.method,
          paidAt: new Date(),
        },
      });
      const agg = await tx.payment.aggregate({ where: { bookingId: input.bookingId }, _sum: { amount: true } });
      const booking = await tx.booking.findFirstOrThrow({ where: { id: input.bookingId } });
      const paid = Number(agg._sum.amount ?? 0);
      const total = Number(booking.total);
      const paymentStatus = paid >= total && total > 0 ? "PAID" : paid > 0 ? "DEPOSIT_PAID" : "PENDING";
      return tx.booking.update({ where: { id: input.bookingId }, data: { paymentStatus } });
    }),
  listByBooking: (tenantId: string, bookingId: string) =>
    withTenant(tenantId, (tx) => tx.payment.findMany({ where: { bookingId }, orderBy: { paidAt: "desc" } })),
};
