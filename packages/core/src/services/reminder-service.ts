import type { AppointmentReminderType } from "@prisma/client";

import { withTenant, type Tx } from "../db/withTenant";

const MIN = 60_000;
const HOUR = 60 * MIN;

export function appointmentReminderTimes(startAt: Date): { type: AppointmentReminderType; fireAt: Date }[] {
  return [
    { type: "APPOINTMENT_24H", fireAt: new Date(startAt.getTime() - 24 * HOUR) },
    { type: "APPOINTMENT_2H", fireAt: new Date(startAt.getTime() - 2 * HOUR) },
    { type: "APPOINTMENT_30M", fireAt: new Date(startAt.getTime() - 30 * MIN) },
  ];
}

export function followUpReminderTime(endAt: Date): { type: AppointmentReminderType; fireAt: Date } {
  return { type: "FOLLOW_UP_24H", fireAt: new Date(endAt.getTime() + 24 * HOUR) };
}

export async function createAppointmentReminders(
  tx: Tx,
  tenantId: string,
  appointmentId: string,
  startAt: Date,
  endAt: Date,
  now = new Date()
) {
  const all = [...appointmentReminderTimes(startAt), followUpReminderTime(endAt)].filter((r) => r.fireAt > now);
  if (all.length === 0) return;
  await tx.appointmentReminder.createMany({
    data: all.map((r) => ({ tenantId, appointmentId, type: r.type, fireAt: r.fireAt })),
  });
}

export async function cancelAppointmentReminders(tx: Tx, appointmentId: string) {
  await tx.appointmentReminder.updateMany({
    where: { appointmentId, status: "SCHEDULED" },
    data: { status: "CANCELED" },
  });
}

export const reminderService = {
  reschedule: (tenantId: string, appointmentId: string, startAt: Date, endAt: Date) =>
    withTenant(tenantId, async (tx) => {
      await cancelAppointmentReminders(tx, appointmentId);
      await createAppointmentReminders(tx, tenantId, appointmentId, startAt, endAt);
    }),

  cancel: (tenantId: string, appointmentId: string) =>
    withTenant(tenantId, (tx) => cancelAppointmentReminders(tx, appointmentId)),
};
