import { withTenant } from "../db/withTenant";
import { paymentInput, type PaymentInput } from "../schemas";
import type { PaymentKind } from "@prisma/client";

export const paymentService = {
  record: (tenantId: string, input: PaymentInput & { kind?: PaymentKind }) =>
    withTenant(tenantId, async (tx) => {
      const data = paymentInput.parse(input);
      const appointment = await tx.appointment.findFirstOrThrow({ where: { id: data.appointmentId } });

      const before = await tx.payment.aggregate({
        where: { appointmentId: data.appointmentId },
        _sum: { amount: true },
      });
      const paidBefore = Number(before._sum.amount ?? 0);

      await tx.payment.create({
        data: {
          tenantId,
          appointmentId: data.appointmentId,
          amount: data.amount,
          kind: input.kind ?? "APPOINTMENT",
          method: data.method,
          paidAt: new Date(),
        },
      });

      const paid = paidBefore + data.amount;
      const total = Number(appointment.total);
      const paymentStatus = paid >= total && total > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
      return tx.appointment.update({ where: { id: data.appointmentId }, data: { paymentStatus } });
    }),
  listByAppointment: (tenantId: string, appointmentId: string) =>
    withTenant(tenantId, (tx) => tx.payment.findMany({ where: { appointmentId }, orderBy: { paidAt: "desc" } })),
};
