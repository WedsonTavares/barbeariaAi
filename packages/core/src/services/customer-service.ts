import { withTenant } from "../db/withTenant";
import type { CustomerInput } from "../schemas";

export const customerService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.customer.findMany({ orderBy: { name: "asc" } })),
  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.customer.findFirst({ where: { id } })),
  /**
   * Ficha do cliente: dados + todas as festas (itens, pagamentos) + o CONTEXTO do
   * atendimento no WhatsApp (resumo da IA, etapa, tags e as últimas mensagens).
   *
   * Antes a ficha só mostrava reserva: quem tinha conversado sem fechar nada não
   * deixava rastro nenhum aqui. A conversa é buscada pelo vínculo `customerId` e,
   * como fallback, pelo telefone (o vínculo só é criado quando a IA fecha algo).
   * Tudo dentro do `withTenant` — a conversa de outra empresa não é alcançável
   * nem pelo telefone, porque a RLS corta antes.
   */
  history: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id },
        include: {
          bookings: {
            orderBy: { eventDate: "desc" },
            include: { items: { include: { toy: true } }, payments: true },
          },
        },
      });
      if (!customer) return null;

      const phone = customer.phone.replace(/\D/g, "");
      const conversation = await tx.conversation.findFirst({
        where: { OR: [{ customerId: id }, ...(phone ? [{ phone }] : [])] },
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          phone: true,
          stage: true,
          tags: true,
          notes: true,
          notesAt: true,
          botPaused: true,
          unread: true,
          lastMessageAt: true,
          createdAt: true,
          _count: { select: { messages: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 6,
            select: { sender: true, text: true, createdAt: true },
          },
        },
      });

      return {
        ...customer,
        conversation: conversation
          ? { ...conversation, messages: [...conversation.messages].reverse() }
          : null,
      };
    }),
  create: (tenantId: string, data: CustomerInput) =>
    withTenant(tenantId, (tx) =>
      tx.customer.create({
        data: {
          tenantId,
          name: data.name,
          phone: data.phone,
          email: data.email || null,
          neighborhood: data.neighborhood,
          address: data.address,
          imageConsent: data.imageConsent ?? false,
        },
      })
    ),
};
