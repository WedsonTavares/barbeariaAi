import { withTenant, type Tx } from "../db/withTenant";
import type { ReminderType } from "@prisma/client";

const MIN = 60_000;

/** Aviso de entrega/montagem: 30min antes e na hora (pra equipe saber que já devia estar lá). */
export function deliveryTimes(setup: Date): { type: ReminderType; fireAt: Date }[] {
  const t = setup.getTime();
  return [
    { type: "DELIVERY_30M", fireAt: new Date(t - 30 * MIN) },
    { type: "DELIVERY_NOW", fireAt: new Date(t) },
  ];
}

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

/** Cria os lembretes de entrega (setup) + retirada (pickup) de uma reserva. */
export async function createBookingReminders(
  tx: Tx,
  tenantId: string,
  bookingId: string,
  setup: Date | null,
  pickup: Date | null,
  now = new Date()
) {
  // Só agenda o que ainda está no futuro: confirmar uma reserva com horário
  // próximo não pode disparar uma rajada de lembretes atrasados.
  const all = [
    ...(setup ? deliveryTimes(setup) : []),
    ...(pickup ? reminderTimes(pickup) : []),
  ].filter((r) => r.fireAt > now);
  if (all.length === 0) return;
  await tx.bookingReminder.createMany({
    data: all.map((r) => ({ tenantId, bookingId, type: r.type, fireAt: r.fireAt })),
  });
}

export async function cancelBookingReminders(tx: Tx, bookingId: string) {
  await tx.bookingReminder.updateMany({
    where: { bookingId, status: "SCHEDULED" },
    data: { status: "CANCELED" },
  });
}

export const reminderService = {
  /** Recalcula lembretes (ex.: mudou o horário de entrega/retirada). */
  reschedule: (tenantId: string, bookingId: string, setup: Date, pickup: Date) =>
    withTenant(tenantId, async (tx) => {
      await cancelBookingReminders(tx, bookingId);
      await createBookingReminders(tx, tenantId, bookingId, setup, pickup);
    }),
  cancel: (tenantId: string, bookingId: string) =>
    withTenant(tenantId, (tx) => cancelBookingReminders(tx, bookingId)),
};
