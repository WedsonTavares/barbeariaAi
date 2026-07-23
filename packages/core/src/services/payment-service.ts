import { withTenant } from "../db/withTenant";
import { paymentInput, type PaymentInput } from "../schemas";
import type { PaymentKind } from "@prisma/client";

export const paymentService = {
  /**
   * Registra um pagamento e recalcula o paymentStatus da reserva.
   * kind é inferido: primeiro pagamento = DEPOSIT, demais = BALANCE
   * (a menos que informado explicitamente).
   */
  record: (tenantId: string, input: PaymentInput & { kind?: PaymentKind }) =>
    withTenant(tenantId, async (tx) => {
      const data = paymentInput.parse(input);
      // Garante que a reserva existe (e pertence ao tenant, via RLS) antes de criar o pagamento.
      const booking = await tx.booking.findFirstOrThrow({ where: { id: data.bookingId } });

      const before = await tx.payment.aggregate({
        where: { bookingId: data.bookingId },
        _sum: { amount: true },
      });
      const paidBefore = Number(before._sum.amount ?? 0);

      await tx.payment.create({
        data: {
          tenantId,
          bookingId: data.bookingId,
          amount: data.amount,
          kind: input.kind ?? (paidBefore > 0 ? "BALANCE" : "DEPOSIT"),
          method: data.method,
          paidAt: new Date(),
        },
      });

      const paid = paidBefore + data.amount;
      const total = Number(booking.total);
      const paymentStatus = paid >= total && total > 0 ? "PAID" : paid > 0 ? "DEPOSIT_PAID" : "PENDING";
      return tx.booking.update({ where: { id: data.bookingId }, data: { paymentStatus } });
    }),
  listByBooking: (tenantId: string, bookingId: string) =>
    withTenant(tenantId, (tx) => tx.payment.findMany({ where: { bookingId }, orderBy: { paidAt: "desc" } })),
};
