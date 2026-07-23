import { withTenant, type Tx } from "../db/withTenant";
import type { ReminderType } from "@prisma/client";

const MIN = 60_000;

/** Os 5 lembretes baseados no horário de retirada. */
export function reminderTimes(pickup: Date): { type: ReminderType; fireAt: Date }[] {
  const t = pickup.getTime();
  return [
    { type: "PICKUP_1H", fireAt: new Date(t - 60 * MIN) },
    { type: "PICKUP_30M", fireAt: new Date(t - 30 * MIN) },
    { type: "PICKUP_15M", fireAt: new Date(t - 15 * MIN) },
    { type: "PICKUP_NOW", fireAt: new Date(t) },
    { type: "PICKUP_DELAYED", fireAt: new Date(t + 15 * MIN) },
  ];
}

export async function createBookingReminders(tx: Tx, tenantId: string, bookingId: string, pickup: Date, now = new Date()) {
  // Só agenda o que ainda está no futuro: confirmar uma reserva com retirada
  // próxima não pode disparar uma rajada de lembretes atrasados.
  const upcoming = reminderTimes(pickup).filter((r) => r.fireAt > now);
  if (upcoming.length === 0) return;
  await tx.bookingReminder.createMany({
    data: upcoming.map((r) => ({ tenantId, bookingId, type: r.type, fireAt: r.fireAt })),
  });
}

export async function cancelBookingReminders(tx: Tx, bookingId: string) {
  await tx.bookingReminder.updateMany({
    where: { bookingId, status: "SCHEDULED" },
    data: { status: "CANCELED" },
  });
}

export const reminderService = {
  /** Recalcula lembretes (ex.: mudou o horário de retirada). */
  reschedule: (tenantId: string, bookingId: string, pickup: Date) =>
    withTenant(tenantId, async (tx) => {
      await cancelBookingReminders(tx, bookingId);
      await createBookingReminders(tx, tenantId, bookingId, pickup);
    }),
  cancel: (tenantId: string, bookingId: string) =>
    withTenant(tenantId, (tx) => cancelBookingReminders(tx, bookingId)),
};
