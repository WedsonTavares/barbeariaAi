import { prisma, services } from "@barbearia-ai/core";

/**
 * Depois de quantas horas sem nenhuma mensagem uma conversa em Pós-atendimento é
 * considerada abandonada. Quem ia avaliar responde no mesmo dia; passou disso,
 * não responde mais.
 */
const HORAS_ATE_EXPIRAR = 24;

/**
 * Solta conversas presas em Pós-atendimento.
 *
 * Entrar em Pós-atendimento é fácil (arrastar o card), sair depende do cliente
 * responder e a IA chamar `remover_pos_atendimento`. Se ele nunca responde, a tag
 * fica pra sempre — o card não sai da coluna e, pior, TODA mensagem futura dele
 * é atendida pelo agente de pós-atendimento, que só sabe coletar nota. Um cliente
 * querendo agendar de novo cairia no coletor de avaliação.
 *
 * `removeTagByPhone` já devolve a etapa pra IA_ATENDENDO junto com a tag, então
 * o card volta pro funil normal sozinho.
 */
export async function expirePostService() {
  // Lista os tenants no contexto de plataforma; o trabalho em si é feito
  // dentro de cada tenant (o service abre withTenant e a RLS filtra).
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let soltas = 0;
  for (const { id: tenantId } of tenants) {
    try {
      const presas = await services.conversationService.abandonedPostServiceConversations(
        tenantId,
        HORAS_ATE_EXPIRAR
      );
      for (const conversa of presas) {
        await services.conversationService.removeTagByPhone(tenantId, conversa.phone, "pos-atendimento");
        soltas++;
      }
    } catch (err) {
      // Um tenant com erro não pode travar os outros; o próximo tick tenta de novo.
      console.error(`[pos-atendimento] falha ao expirar no tenant ${tenantId}`, err);
    }
  }

  if (soltas) console.log(`[pos-atendimento] ${soltas} conversa(s) liberada(s) do pós-atendimento`);
}
