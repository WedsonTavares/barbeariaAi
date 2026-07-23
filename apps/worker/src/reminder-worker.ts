import { prisma, withTenant, type ReminderType, type NotificationType } from "@diny/core";
import { sendReminderAlert, type ReminderAlert } from "./n8n";

const SP_FMT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

const LABEL: Record<ReminderType, string> = {
  DELIVERY_30M: "Entrega em 30 minutos",
  DELIVERY_NOW: "Hora da entrega!",
  PICKUP_1H: "Retirada em 1 hora",
  PICKUP_30M: "Retirada em 30 minutos",
  PICKUP_15M: "Retirada em 15 minutos",
  PICKUP_NOW: "Hora da retirada!",
  PICKUP_DELAYED: "Retirada ATRASADA",
};
const NOTIF: Record<ReminderType, NotificationType> = {
  DELIVERY_30M: "BOOKING_DELIVERY_SOON",
  DELIVERY_NOW: "BOOKING_DELIVERY_NOW",
  PICKUP_1H: "BOOKING_ENDING_SOON",
  PICKUP_30M: "BOOKING_ENDING_SOON",
  PICKUP_15M: "BOOKING_ENDING_SOON",
  PICKUP_NOW: "BOOKING_PICKUP_NOW",
  PICKUP_DELAYED: "BOOKING_PICKUP_DELAYED",
};
const isDelivery = (t: ReminderType) => t === "DELIVERY_30M" || t === "DELIVERY_NOW";

/**
 * Varre lembretes vencidos de TODOS os tenants (função get_due_reminders, bypass
 * controlado), e processa CADA um dentro do contexto do seu tenant (withTenant).
 */
export async function processDueReminders() {
  const due = await prisma.$queryRaw<{ id: string; tenantId: string }[]>`
    SELECT * FROM get_due_reminders(now())
  `;
  let failed = 0;
  for (const r of due) {
    try {
      await processOne(r);
    } catch (err) {
      // Um lembrete com erro não pode travar os demais; fica SCHEDULED e o
      // próximo tick tenta de novo.
      failed++;
      console.error(`[reminders] falha no lembrete ${r.id} (tenant ${r.tenantId})`, err);
    }
  }
  if (due.length) console.log(`[reminders] processados: ${due.length - failed}/${due.length}`);
}

async function processOne(r: { id: string; tenantId: string }) {
  // 1) Registra a notificação no painel (transação com RLS do tenant).
  const alert = await withTenant(r.tenantId, async (tx): Promise<ReminderAlert | null> => {
    const rem = await tx.bookingReminder.findFirst({
      where: { id: r.id, status: "SCHEDULED" },
      include: { booking: { include: { customer: true } } },
    });
    if (!rem) return null; // já processado/cancelado
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

    // Monta o alerta pro WhatsApp (via n8n) — enviado só DEPOIS do commit.
    const settings = await tx.tenantSettings.findUnique({ where: { tenantId: r.tenantId } });
    const toPhone = settings?.whatsappAlerts || settings?.whatsappMain;
    if (!toPhone) return null;
    const b = rem.booking;
    const setupLocal = b.setupTime ? SP_FMT.format(b.setupTime) : null;
    const pickupLocal = b.pickupTime ? SP_FMT.format(b.pickupTime) : null;
    const delivery = isDelivery(rem.type);
    const lines = [
      `🔔 ${LABEL[rem.type]}`,
      `👤 ${b.customer.name} (${b.customer.phone})`,
      b.address || b.neighborhood ? `📍 ${[b.address, b.neighborhood].filter(Boolean).join(" — ")}` : null,
      delivery ? (setupLocal ? `🕒 Entrega: ${setupLocal}` : null) : (pickupLocal ? `🕒 Retirada: ${pickupLocal}` : null),
    ].filter(Boolean);
    return {
      event: "booking_reminder",
      tenantId: r.tenantId,
      type: rem.type,
      title: LABEL[rem.type],
      message: lines.join("\n"),
      toPhone,
      booking: {
        id: b.id,
        customerName: b.customer.name,
        customerPhone: b.customer.phone,
        address: b.address,
        neighborhood: b.neighborhood,
        setupAt: b.setupTime ? b.setupTime.toISOString() : null,
        setupAtLocal: setupLocal,
        pickupAt: b.pickupTime ? b.pickupTime.toISOString() : null,
        pickupAtLocal: pickupLocal,
      },
    };
  });

  // 2) Dispara o WhatsApp via n8n (fora da transação; falha aqui não afeta o lembrete).
  if (alert) await sendReminderAlert(alert);
}
