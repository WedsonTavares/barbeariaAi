import { prisma, withTenant, type AppointmentReminderType, type NotificationType } from "@barbearia-ai/core";
import { sendReminderAlert, type ReminderAlert } from "./n8n";

const SP_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

const LABEL: Record<AppointmentReminderType, string> = {
  APPOINTMENT_24H: "Atendimento amanhã",
  APPOINTMENT_2H: "Atendimento em 2 horas",
  APPOINTMENT_30M: "Atendimento em 30 minutos",
  FOLLOW_UP_24H: "Pós-atendimento",
};

const NOTIF: Record<AppointmentReminderType, NotificationType> = {
  APPOINTMENT_24H: "APPOINTMENT_STARTING_SOON",
  APPOINTMENT_2H: "APPOINTMENT_STARTING_SOON",
  APPOINTMENT_30M: "APPOINTMENT_STARTING_SOON",
  FOLLOW_UP_24H: "APPOINTMENT_CREATED",
};

export async function processDueReminders() {
  const due = await prisma.$queryRaw<{ id: string; tenantId: string }[]>`
    SELECT * FROM get_due_reminders(now())
  `;
  let failed = 0;
  for (const reminder of due) {
    try {
      await processOne(reminder);
    } catch (err) {
      failed++;
      console.error(`[reminders] falha no lembrete ${reminder.id} (tenant ${reminder.tenantId})`, err);
    }
  }
  if (due.length) console.log(`[reminders] processados: ${due.length - failed}/${due.length}`);
}

async function processOne(reminder: { id: string; tenantId: string }) {
  const alert = await withTenant(reminder.tenantId, async (tx): Promise<ReminderAlert | null> => {
    const rem = await tx.appointmentReminder.findFirst({
      where: { id: reminder.id, status: "SCHEDULED" },
      include: {
        appointment: {
          include: {
            customer: true,
            professional: true,
            services: true,
          },
        },
      },
    });
    if (!rem) return null;

    const services = rem.appointment.services.map((service) => service.serviceNameSnapshot).join(", ");
    await tx.notification.create({
      data: {
        tenantId: reminder.tenantId,
        type: NOTIF[rem.type],
        title: LABEL[rem.type],
        body: `${rem.appointment.customer.name} · ${SP_FMT.format(rem.appointment.startAt)} · ${services}`.trim(),
        appointmentId: rem.appointmentId,
      },
    });
    await tx.appointmentReminder.update({
      where: { id: rem.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    const settings = await tx.tenantSettings.findUnique({ where: { tenantId: reminder.tenantId } });
    const toPhone = settings?.whatsappAlerts || settings?.whatsappMain;
    if (!toPhone) return null;

    const appointment = rem.appointment;
    const startLocal = SP_FMT.format(appointment.startAt);
    const lines = [
      `🔔 ${LABEL[rem.type]}`,
      `👤 ${appointment.customer.name} (${appointment.customer.phone})`,
      appointment.professional ? `💈 ${appointment.professional.name}` : null,
      services ? `✂️ ${services}` : null,
      `🕒 ${startLocal}`,
    ].filter(Boolean);
    return {
      event: "appointment_reminder",
      tenantId: reminder.tenantId,
      type: rem.type,
      title: LABEL[rem.type],
      message: lines.join("\n"),
      toPhone,
      appointment: {
        id: appointment.id,
        customerName: appointment.customer.name,
        customerPhone: appointment.customer.phone,
        professionalName: appointment.professional?.name ?? null,
        services,
        startAt: appointment.startAt.toISOString(),
        startAtLocal: startLocal,
        endAt: appointment.endAt.toISOString(),
        endAtLocal: SP_FMT.format(appointment.endAt),
      },
    };
  });

  if (alert) await sendReminderAlert(alert);
}
