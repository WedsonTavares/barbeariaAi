/**
 * Ponte worker → n8n (mesma VPS). Se N8N_WEBHOOK_URL não estiver configurada,
 * a integração fica desligada e nada muda no comportamento atual.
 * NUNCA deixa um erro daqui derrubar o processamento de lembretes.
 */
const URL = process.env.N8N_WEBHOOK_URL;
const SECRET = process.env.N8N_WEBHOOK_SECRET;

export interface ReminderAlert {
  event: "booking_reminder";
  tenantId: string;
  tenantSlug?: string;
  type: string; // PICKUP_1H | PICKUP_30M | PICKUP_15M | PICKUP_NOW | PICKUP_DELAYED
  title: string;
  message: string; // texto pronto pra mandar no WhatsApp
  toPhone: string; // whatsappAlerts (ou whatsappMain) do tenant
  booking: {
    id: string;
    customerName: string;
    customerPhone: string;
    address: string | null;
    neighborhood: string | null;
    setupAt: string | null; // ISO — horário de entrega/montagem
    setupAtLocal: string | null; // "23/07/2026 15:30" (SP)
    pickupAt: string | null; // ISO
    pickupAtLocal: string | null; // "23/07/2026 17:30" (SP)
  };
}

export async function sendReminderAlert(alert: ReminderAlert): Promise<void> {
  if (!URL) return; // integração desligada
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(SECRET ? { "x-diny-secret": SECRET } : {}),
      },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.error(`[n8n] webhook respondeu ${res.status}`);
  } catch (err) {
    console.error("[n8n] falha ao enviar alerta (lembrete segue registrado no painel)", err);
  }
}
