import { withTenant, type Tx } from "../db/withTenant";
import type { ReminderType } from "@prisma/client";

const MIN = 60_000;

/**
 * Um aviso por operação: 30 minutos antes de montar e 30 minutos antes de retirar.
 *
 * Antes eram sete por festa (2 de entrega + 5 de retirada, incluindo "na hora",
 * "15 min" e "atrasada"). Sete mensagens no mesmo celular pela mesma festa vira
 * ruído, e alerta que vira ruído deixa de ser lido — que é o contrário do que o
 * lembrete existe pra fazer. Os outros tipos continuam no enum porque há
 * lembretes antigos gravados com eles; só não são criados mais.
 */
export function deliveryTimes(setup: Date): { type: ReminderType; fireAt: Date }[] {
  return [{ type: "DELIVERY_30M", fireAt: new Date(setup.getTime() - 30 * MIN) }];
}

export function reminderTimes(pickup: Date): { type: ReminderType; fireAt: Date }[] {
  return [{ type: "PICKUP_30M", fireAt: new Date(pickup.getTime() - 30 * MIN) }];
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
