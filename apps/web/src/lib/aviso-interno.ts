import { services } from "@barbearia-ai/core";
import { sendText } from "./evolution";

/**
 * Aviso operacional no WhatsApp da equipe (não do cliente).
 *
 * Vai direto pela Evolution, sem passar por `/api/whatsapp/send`: aquele
 * endpoint é pra resposta do BOT ao cliente — respeita pausa de atendimento e
 * grava a mensagem como conversa no CRM. Os dois comportamentos estão errados
 * aqui: o aviso é interno, não pode ser engolido por uma pausa, e não deve
 * poluir o funil com o número da própria equipe.
 *
 * Nunca lança: um aviso que falha não pode derrubar a operação que o gerou
 * (cancelar um agendamento tem que cancelar, com ou sem WhatsApp).
 */
export async function avisarEquipe(
  tenant: { id: string; slug: string },
  texto: string
): Promise<boolean> {
  try {
    const settings = await services.tenantService.getSettings(tenant.id);
    // whatsappAlerts é o número pessoal; sem ele cai no comercial, que é
    // melhor do que não avisar ninguém.
    const destino = (settings?.whatsappAlerts || settings?.whatsappMain || "").replace(/\D/g, "");
    if (!destino) return false;

    const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
    return await sendText(instance, destino, texto);
  } catch (error) {
    console.error("[aviso-interno] não foi possível avisar a equipe", error);
    return false;
  }
}
