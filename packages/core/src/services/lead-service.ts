import { withTenant } from "../db/withTenant";
import type { LeadInput, AgentLeadInput } from "../schemas";
import type { LeadStatus } from "@prisma/client";
import { pushNotification } from "./notification-service";

export const leadService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.lead.findMany({ orderBy: { createdAt: "desc" } })),
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
              desiredToy: data.desiredToy ?? existing.desiredToy,
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
              desiredToy: data.desiredToy,
              neighborhood: data.neighborhood,
            },
          });
      if (!existing) {
        await pushNotification(tx, tenantId, {
          type: "NEW_LEAD",
          title: "Novo lead pelo agente de IA (WhatsApp)",
          body: `${data.name} · ${data.phone}${data.desiredToy ? ` · ${data.desiredToy}` : ""}`,
        });
      }
      return lead;
    }),
};
