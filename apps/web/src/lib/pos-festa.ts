import { services } from "@diny/core";
import { sendText } from "./evolution";

const DEFAULT_POST_EVENT_MESSAGE =
  "Oi! Aqui é da equipe 🎉 Passando pra saber: como foi a festa? De 0 a 10, qual nota você daria pra experiência com a gente?";

/**
 * Dispara a mensagem automática de pós-festa (configurável em Configurações,
 * com um texto padrão se o tenant não configurou nada) e grava como BOT no
 * histórico. Chamar SÓ quando quem chamou já confirmou que é uma TRANSIÇÃO de
 * verdade pra POS_FESTA (`previousStage !== "POS_FESTA"`) — arrastar de novo
 * pra mesma coluna, ou marcar uma tag que já estava marcada, não deve reenviar.
 *
 * Compartilhada entre os DOIS jeitos de entrar em Pós-festa (arrastar o card
 * no Funil e marcar a tag na mão, em Funil ou Conversas) — os dois têm que
 * disparar exatamente a mesma mensagem, senão um vira "oficial" e o outro
 * "capenga" sem querer.
 */
export async function sendPosFestaAutoMessage(tenant: { id: string; slug: string }, phone: string) {
  const settings = await services.tenantService.getSettings(tenant.id);
  const message = settings?.postEventMessage?.trim() || DEFAULT_POST_EVENT_MESSAGE;

  // Segunda trava, agora pela MENSAGEM: a guarda por transição de etapa não
  // pega quem tira o card da coluna e devolve — para o sistema é entrada nova,
  // e o cliente recebia a mesma pergunta de novo.
  if (await services.conversationService.posFestaJaPerguntado(tenant.id, phone, message)) return;

  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  const sent = await sendText(instance, phone, message);
  if (sent) await services.conversationService.recordOutbound(tenant.id, phone, message, "BOT");
}
