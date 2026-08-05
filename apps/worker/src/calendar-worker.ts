import { services } from "@barbearia-ai/core";

export async function renewGoogleCalendarSubscriptions() {
  const result = await services.calendarService.renewExpiringGoogleSubscriptions();
  if (result.skipped) return;
  if (result.renewed || result.failed) {
    console.log(`[google-calendar] assinaturas renovadas: ${result.renewed}; falhas: ${result.failed}`);
  }
}
