import { withTenant } from "../db/withTenant";
import type { LeadInput, AgentLeadInput } from "../schemas";
import type { LeadStatus } from "@prisma/client";
import { pushNotification } from "./notification-service";

/** Ainda esperando resposta da equipe. WON/LOST saíram do fluxo. */
export const LEAD_ABERTO = ["NEW", "CONTACTED", "QUOTED"] as const satisfies readonly LeadStatus[];

export const leadService = {
  /**
   * Leads do painel: em aberto primeiro, e dentro de cada grupo os mais novos
   * no topo. Arquivados ficam de fora — sumir do painel sem apagar nada é a
   * mesma convenção de Customer e Conversation.
   */
  list: (tenantId: string) =>
    withTenant(tenantId, async (tx) => {
      const todos = await tx.lead.findMany({
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
      });
      const aberto = (l: { status: LeadStatus }) => LEAD_ABERTO.includes(l.status as never);
      return { abertos: todos.filter(aberto), fechados: todos.filter((l) => !aberto(l)) };
    }),
  create: (tenantId: string, data: LeadInput) =>
    withTenant(tenantId, (tx) => tx.lead.create({ data: { tenantId, ...data } })),
  setStatus: (tenantId: string, id: string, status: LeadStatus) =>
    withTenant(tenantId, (tx) => tx.lead.update({ where: { id }, data: { status } })),

  /**
   * Lead vindo do agente de IA (WhatsApp). Não duplica: se já existe um lead ABERTO
   * (NEW/CONTACTED/QUOTED) desse telefone, atualiza em vez de criar outro. Notifica a equipe.
   */
  createFromAgent: (tenantId: string, data: AgentLeadInput) =>
    withTenant(tenantId, async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { phone: data.phone, status: { in: ["NEW", "CONTACTED", "QUOTED"] } },
        orderBy: { createdAt: "desc" },
      });
      const desiredDate = data.desiredDate ? new Date(`${data.desiredDate}T12:00:00-03:00`) : undefined;
      const lead = existing
        ? await tx.lead.update({
            where: { id: existing.id },
            data: {
              name: data.name,
              message: data.summary ?? existing.message,
              desiredDate: desiredDate ?? existing.desiredDate,
              desiredService: data.desiredService ?? existing.desiredService,
              neighborhood: data.neighborhood ?? existing.neighborhood,
            },
          })
        : await tx.lead.create({
            data: {
              tenantId,
              name: data.name,
              phone: data.phone,
              source: "WHATSAPP",
              message: data.summary,
              desiredDate,
              desiredService: data.desiredService,
              neighborhood: data.neighborhood,
            },
          });
      if (!existing) {
        await pushNotification(tx, tenantId, {
          type: "NEW_LEAD",
          title: "Novo lead pelo agente de IA (WhatsApp)",
          body: `${data.name} · ${data.phone}${data.desiredService ? ` · ${data.desiredService}` : ""}`,
        });
      }
      return lead;
    }),
};
