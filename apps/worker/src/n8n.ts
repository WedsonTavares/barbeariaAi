/**
 * Ponte worker -> n8n, usada pelos lembretes. Se N8N_WEBHOOK_URL não estiver
 * configurada, a integração fica desligada. Erro aqui não derruba o worker.
 */
const URL = process.env.N8N_WEBHOOK_URL;
const SECRET = process.env.N8N_WEBHOOK_SECRET;

export interface ReminderAlert {
  event: "appointment_reminder";
  tenantId: string;
  tenantSlug?: string;
  type: string;
  title: string;
  message: string;
  toPhone: string;
  appointment: {
    id: string;
    customerName: string;
    customerPhone: string;
    professionalName: string | null;
    services: string;
    startAt: string;
    startAtLocal: string;
    endAt: string;
    endAtLocal: string;
  };
}

export async function sendReminderAlert(alert: ReminderAlert): Promise<void> {
  if (!URL) return;
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(SECRET ? { "x-barbearia-ai-secret": SECRET } : {}),
      },
      body: JSON.stringify(alert),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.error(`[n8n] webhook respondeu ${res.status}`);
  } catch (err) {
    console.error("[n8n] falha ao enviar alerta", err);
  }
}
