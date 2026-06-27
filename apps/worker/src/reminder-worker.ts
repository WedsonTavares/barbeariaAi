import { prisma, withTenant, type ReminderType, type NotificationType } from "@diny/core";

const LABEL: Record<ReminderType, string> = {
  PICKUP_1H: "Retirada em 1 hora",
  PICKUP_30M: "Retirada em 30 minutos",
  PICKUP_15M: "Retirada em 15 minutos",
  PICKUP_NOW: "Hora da retirada!",
  PICKUP_DELAYED: "Retirada ATRASADA",
};
const NOTIF: Record<ReminderType, NotificationType> = {
  PICKUP_1H: "BOOKING_ENDING_SOON",
  PICKUP_30M: "BOOKING_ENDING_SOON",
  PICKUP_15M: "BOOKING_ENDING_SOON",
  PICKUP_NOW: "BOOKING_PICKUP_NOW",
  PICKUP_DELAYED: "BOOKING_PICKUP_DELAYED",
};

/**
 * Varre lembretes vencidos de TODOS os tenants (função get_due_reminders, bypass
 * controlado), e processa CADA um dentro do contexto do seu tenant (withTenant).
 */
export async function processDueReminders() {
  const due = await prisma.$queryRaw<{ id: string; tenantId: string }[]>`
    SELECT * FROM get_due_reminders(now())
  `;
  for (const r of due) {
    await withTenant(r.tenantId, async (tx) => {
      const rem = await tx.bookingReminder.findFirst({
        where: { id: r.id, status: "SCHEDULED" },
        include: { booking: { include: { customer: true } } },
      });
      if (!rem) return; // já processado/cancelado
      await tx.notification.create({
        data: {
          tenantId: r.tenantId,
          type: NOTIF[rem.type],
          title: LABEL[rem.type],
          body: `${rem.booking.customer.name} — ${rem.booking.neighborhood ?? ""}`.trim(),
          bookingId: rem.bookingId,
        },
      });
      await tx.bookingReminder.update({
        where: { id: rem.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    });
  }
  if (due.length) console.log(`[reminders] processados: ${due.length}`);
}
