import { prisma, services } from "@diny/core";

/**
 * Depois de quantas horas sem nenhuma mensagem uma conversa em Pós-festa é
 * considerada abandonada. Quem ia avaliar responde no mesmo dia; passou disso,
 * não responde mais.
 */
const HORAS_ATE_EXPIRAR = 24;

/**
 * Solta conversas presas em Pós-festa.
 *
 * Entrar em Pós-festa é fácil (arrastar o card), sair depende do cliente
 * responder e a IA chamar `remover_pos_festa`. Se ele nunca responde, a tag
 * fica pra sempre — o card não sai da coluna e, pior, TODA mensagem futura dele
 * é atendida pelo agente de pós-festa, que só sabe coletar nota. Um cliente
 * querendo alugar de novo em março cairia no coletor de avaliação.
 *
 * `removeTagByPhone` já devolve a etapa pra IA_ATENDENDO junto com a tag, então
 * o card volta pro funil normal sozinho.
 */
export async function expirePosFesta() {
  // Lista os tenants no contexto de plataforma; o trabalho em si é feito
  // dentro de cada tenant (o service abre withTenant e a RLS filtra).
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let soltas = 0;
  for (const { id: tenantId } of tenants) {
    try {
      const presas = await services.conversationService.posFestaAbandonadas(
        tenantId,
        HORAS_ATE_EXPIRAR
      );
      for (const conversa of presas) {
        await services.conversationService.removeTagByPhone(tenantId, conversa.phone, "pos-festa");
        soltas++;
      }
    } catch (err) {
      // Um tenant com erro não pode travar os outros; o próximo tick tenta de novo.
      console.error(`[pos-festa] falha ao expirar no tenant ${tenantId}`, err);
    }
  }

  if (soltas) console.log(`[pos-festa] ${soltas} conversa(s) liberada(s) do pós-festa`);
}
