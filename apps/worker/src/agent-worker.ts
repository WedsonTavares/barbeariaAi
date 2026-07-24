import { prisma, services } from "@diny/core";
import { sendAgentReply } from "./n8n";

/**
 * Varre conversas do agente de IA com mensagem pendente e silêncio >= DEBOUNCE_SECONDS
 * (get_due_agent_conversations, bypass controlado — mesmo padrão dos lembretes).
 * Processa CADA uma no contexto do seu tenant, e manda a resposta pro n8n.
 */
export async function processDueAgentConversations() {
  // Cast explícito: o driver manda number JS como bigint, e a função SQL espera int.
  const due = await prisma.$queryRaw<{ id: string; tenantId: string }[]>`
    SELECT * FROM get_due_agent_conversations(${services.DEBOUNCE_SECONDS}::int)
  `;
  let failed = 0;
  for (const r of due) {
    try {
      const result = await services.agentService.processPending(r.tenantId, r.id);
      if (result) {
        await sendAgentReply({ event: "agent_reply", tenantId: r.tenantId, toPhone: result.phone, message: result.reply });
      }
    } catch (err) {
      // Uma conversa com erro não pode travar as demais; fica pendente e o
      // próximo tick tenta de novo.
      failed++;
      console.error(`[agent] falha ao processar conversa ${r.id} (tenant ${r.tenantId})`, err);
    }
  }
  if (due.length) console.log(`[agent] processados: ${due.length - failed}/${due.length}`);
}
