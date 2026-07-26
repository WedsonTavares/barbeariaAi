import { Prisma } from "@prisma/client";

import { withTenant } from "../db/withTenant";
import {
  customerPhoneKey,
  customerPhoneVariants,
  toWhatsAppPhone,
} from "../phone";
import type { CustomerInput, CustomerUpdateInput } from "../schemas";

const meaningfulName = (name: string | null | undefined) => {
  const trimmed = name?.trim();
  return trimmed && /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : null;
};

const latestDate = (...dates: Array<Date | null | undefined>) =>
  dates.reduce<Date | null>(
    (latest, date) => (!date || (latest && latest >= date) ? latest : date),
    null,
  ) ?? new Date(0);

export class CustomerDuplicateError extends Error {
  constructor(public readonly existingId: string) {
    super("Já existe um cliente com este WhatsApp");
    this.name = "CustomerDuplicateError";
  }
}

export type CustomerDirectoryEntry = {
  key: string;
  kind: "CUSTOMER" | "CONTACT" | "LEAD";
  customerId: string | null;
  conversationId: string | null;
  leadId: string | null;
  name: string;
  phone: string;
  email: string | null;
  neighborhood: string | null;
  address: string | null;
  imageConsent: boolean;
  bookingCount: number;
  duplicateCount: number;
  source: string | null;
  stage: string | null;
  leadStatus: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  archived: boolean;
};

export type CustomerRemovalResult =
  | { removed: true; replacementId: string | null }
  | { removed: false; reason: "NOT_FOUND" | "BOOKINGS" | "HISTORY" | "DATA" };

/**
 * Uma linha do diretório pode ser sustentada por até três registros do mesmo
 * telefone (cadastro, conversa e lead). Arquivar/restaurar age nos três juntos —
 * senão a pessoa sumiria de Clientes mas continuaria no inbox e no funil.
 */
export type DirectoryTarget = {
  customerId?: string | null;
  conversationId?: string | null;
  leadId?: string | null;
};

export const customerService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.customer.findMany({ orderBy: { name: "asc" } })),
  /**
   * Diretório de pessoas do painel. Customer continua sendo a entidade usada por
   * reservas; aqui apenas reunimos também Conversation e Lead pelo telefone
   * normalizado para que um contato novo não suma da tela de Clientes.
   *
   * `archived: true` mostra a lixeira em vez da lista ativa. Os dois lados usam a
   * mesma montagem — o que muda é só o filtro de `archivedAt`.
   */
  directory: (tenantId: string, { archived = false } = {}): Promise<CustomerDirectoryEntry[]> =>
    withTenant(tenantId, async (tx) => {
      const archivedAt = archived ? { not: null } : null;
      const [customers, conversations, leads] = await Promise.all([
        tx.customer.findMany({
          where: { archivedAt },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            neighborhood: true,
            address: true,
            imageConsent: true,
            createdAt: true,
            _count: { select: { bookings: true } },
          },
        }),
        tx.conversation.findMany({
          where: { archivedAt },
          orderBy: { lastMessageAt: "desc" },
          select: {
            id: true,
            phone: true,
            contactName: true,
            customerId: true,
            stage: true,
            createdAt: true,
            lastMessageAt: true,
          },
        }),
        tx.lead.findMany({
          where: { archivedAt },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            phone: true,
            name: true,
            source: true,
            status: true,
            neighborhood: true,
            createdAt: true,
          },
        }),
      ]);

      const customerPhones = new Set(customers.map((customer) => customerPhoneKey(customer.phone)).filter(Boolean));
      const phoneCounts = new Map<string, number>();
      for (const customer of customers) {
        const phone = customerPhoneKey(customer.phone);
        if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
      }

      const latestLeadByPhone = new Map<string, (typeof leads)[number]>();
      for (const lead of leads) {
        const phone = customerPhoneKey(lead.phone);
        if (phone && !latestLeadByPhone.has(phone)) latestLeadByPhone.set(phone, lead);
      }

      const conversationByCustomer = new Map<string, (typeof conversations)[number]>();
      const unlinkedConversationByPhone = new Map<string, (typeof conversations)[number]>();
      for (const conversation of conversations) {
        if (conversation.customerId && !conversationByCustomer.has(conversation.customerId)) {
          conversationByCustomer.set(conversation.customerId, conversation);
        } else if (!conversation.customerId) {
          const phone = customerPhoneKey(conversation.phone);
          if (phone && !unlinkedConversationByPhone.has(phone)) {
            unlinkedConversationByPhone.set(phone, conversation);
          }
        }
      }
      const fallbackCustomerByPhone = new Map<string, (typeof customers)[number]>();
      for (const customer of customers) {
        const phone = customerPhoneKey(customer.phone);
        const current = fallbackCustomerByPhone.get(phone);
        if (!current || customer._count.bookings > current._count.bookings) {
          fallbackCustomerByPhone.set(phone, customer);
        }
      }

      const entries: CustomerDirectoryEntry[] = customers.map((customer) => {
        const phone = customerPhoneKey(customer.phone);
        const conversation =
          conversationByCustomer.get(customer.id) ??
          (fallbackCustomerByPhone.get(phone)?.id === customer.id
            ? unlinkedConversationByPhone.get(phone)
            : undefined);
        const lead = latestLeadByPhone.get(phone);

        return {
          key: `customer:${customer.id}`,
          kind: "CUSTOMER",
          customerId: customer.id,
          conversationId: conversation?.id ?? null,
          leadId: lead?.id ?? null,
          name: meaningfulName(customer.name) ?? "Cliente sem nome",
          phone: customer.phone,
          email: customer.email,
          neighborhood: customer.neighborhood,
          address: customer.address,
          imageConsent: customer.imageConsent,
          bookingCount: customer._count.bookings,
          duplicateCount: phoneCounts.get(phone) ?? 1,
          source: lead?.source ?? (conversation ? "WHATSAPP" : null),
          stage: conversation?.stage ?? null,
          leadStatus: lead?.status ?? null,
          createdAt: customer.createdAt,
          lastActivityAt: latestDate(customer.createdAt, conversation?.lastMessageAt, lead?.createdAt),
          archived,
        };
      });

      const conversationPhones = new Set<string>();
      for (const conversation of conversations) {
        const phone = customerPhoneKey(conversation.phone);
        if (!phone || customerPhones.has(phone) || conversationPhones.has(phone)) continue;
        conversationPhones.add(phone);
        const lead = latestLeadByPhone.get(phone);
        entries.push({
          key: `contact:${conversation.id}`,
          kind: "CONTACT",
          customerId: null,
          conversationId: conversation.id,
          leadId: lead?.id ?? null,
          name:
            meaningfulName(conversation.contactName) ??
            meaningfulName(lead?.name) ??
            `Contato • ${phone.slice(-4)}`,
          phone: conversation.phone,
          email: null,
          neighborhood: lead?.neighborhood ?? null,
          address: null,
          imageConsent: false,
          bookingCount: 0,
          duplicateCount: 0,
          source: lead?.source ?? "WHATSAPP",
          stage: conversation.stage,
          leadStatus: lead?.status ?? null,
          createdAt: conversation.createdAt,
          lastActivityAt: latestDate(conversation.lastMessageAt, lead?.createdAt),
          archived,
        });
      }

      const leadOnlyPhones = new Set<string>();
      for (const lead of leads) {
        const phone = customerPhoneKey(lead.phone);
        if (
          !phone ||
          customerPhones.has(phone) ||
          conversationPhones.has(phone) ||
          leadOnlyPhones.has(phone)
        ) {
          continue;
        }
        leadOnlyPhones.add(phone);
        entries.push({
          key: `lead:${lead.id}`,
          kind: "LEAD",
          customerId: null,
          conversationId: null,
          leadId: lead.id,
          name: meaningfulName(lead.name) ?? `Lead • ${phone.slice(-4)}`,
          phone: lead.phone,
          email: null,
          neighborhood: lead.neighborhood,
          address: null,
          imageConsent: false,
          bookingCount: 0,
          duplicateCount: 0,
          source: lead.source,
          stage: null,
          leadStatus: lead.status,
          createdAt: lead.createdAt,
          lastActivityAt: lead.createdAt,
          archived,
        });
      }

      return entries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    }),
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

      const phone = customerPhoneKey(customer.phone);
      const conversation = await tx.conversation.findFirst({
        where: {
          OR: [
            { customerId: id },
            ...(phone
              ? [{ customerId: null, phone: { in: customerPhoneVariants(customer.phone) } }]
              : []),
          ],
        },
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
    withTenant(tenantId, async (tx) => {
      const phone = toWhatsAppPhone(data.phone);
      const phoneKey = customerPhoneKey(phone);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${tenantId}:${phoneKey}`}))`;
      const candidates = await tx.customer.findMany({ select: { id: true, phone: true } });
      const duplicate = candidates.find((customer) => customerPhoneKey(customer.phone) === phoneKey);
      if (duplicate) throw new CustomerDuplicateError(duplicate.id);

      return tx.customer.create({
        data: {
          tenantId,
          name: data.name.trim(),
          phone,
          email: data.email?.trim() || null,
          neighborhood: data.neighborhood?.trim() || null,
          address: data.address?.trim() || null,
          imageConsent: data.imageConsent ?? false,
        },
      });
    }),

  /**
   * Edita somente dados cadastrais. O WhatsApp fica imutável aqui porque é a
   * chave informal que une cliente, conversa, lead e consultas do agente.
   */
  update: (tenantId: string, id: string, data: CustomerUpdateInput) =>
    withTenant(tenantId, async (tx) => {
      const found = await tx.customer.findFirst({ where: { id } });
      if (!found) return null;
      const phoneKey = customerPhoneKey(found.phone);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${tenantId}:${phoneKey}`}))`;
      const customer = await tx.customer.findFirst({ where: { id } });
      if (!customer) return null;

      const updated = await tx.customer.update({
        where: { id },
        data: {
          name: data.name.trim(),
          email: data.email?.trim() || null,
          neighborhood: data.neighborhood?.trim() || null,
          address: data.address?.trim() || null,
          imageConsent: data.imageConsent ?? false,
        },
      });

      // O nome corrente acompanha o cadastro, mas mensagens/notificações antigas
      // não são reescritas. Fallback por telefone só vale para conversa sem vínculo.
      const phone = customerPhoneKey(customer.phone);
      const conversations = await tx.conversation.findMany({
        select: { id: true, phone: true, customerId: true },
      });
      const conversationIds = conversations
        .filter(
          (conversation) =>
            conversation.customerId === id ||
            (!conversation.customerId && customerPhoneKey(conversation.phone) === phone),
        )
        .map((conversation) => conversation.id);
      if (conversationIds.length) {
        await tx.conversation.updateMany({
          where: { id: { in: conversationIds } },
          data: { contactName: updated.name },
        });
      }

      return updated;
    }),

  /**
   * Arquiva a pessoa: some do painel (Clientes, inbox e funil) sem apagar linha
   * nenhuma — reservas, mensagens e leads continuam lá. É a saída segura para
   * contato errado, teste e spam, já que excluir de verdade esbarra no histórico.
   *
   * Age nos três registros do mesmo telefone de uma vez (ver `DirectoryTarget`).
   * Uma mensagem nova do contato desarquiva a conversa sozinha (ver
   * `recordMessage` no conversation-service) — arquivar esconde, não bloqueia.
   */
  archive: (tenantId: string, target: DirectoryTarget, at = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const archivedAt = at;
      const [customer, conversation, lead] = await Promise.all([
        target.customerId
          ? tx.customer.updateMany({ where: { id: target.customerId }, data: { archivedAt } })
          : null,
        target.conversationId
          ? tx.conversation.updateMany({ where: { id: target.conversationId }, data: { archivedAt } })
          : null,
        target.leadId
          ? tx.lead.updateMany({ where: { id: target.leadId }, data: { archivedAt } })
          : null,
      ]);
      const touched = (customer?.count ?? 0) + (conversation?.count ?? 0) + (lead?.count ?? 0);
      return { archived: touched > 0, touched };
    }),

  /** Desfaz o arquivamento (botão "Restaurar" da lixeira). */
  restore: (tenantId: string, target: DirectoryTarget) =>
    withTenant(tenantId, async (tx) => {
      const [customer, conversation, lead] = await Promise.all([
        target.customerId
          ? tx.customer.updateMany({ where: { id: target.customerId }, data: { archivedAt: null } })
          : null,
        target.conversationId
          ? tx.conversation.updateMany({ where: { id: target.conversationId }, data: { archivedAt: null } })
          : null,
        target.leadId
          ? tx.lead.updateMany({ where: { id: target.leadId }, data: { archivedAt: null } })
          : null,
      ]);
      const touched = (customer?.count ?? 0) + (conversation?.count ?? 0) + (lead?.count ?? 0);
      return { restored: touched > 0, touched };
    }),

  /**
   * "Remover" significa excluir apenas um cadastro descartável. Reservas nunca
   * são apagadas. Conversas/leads/orçamentos também ficam preservados; quando há
   * outro cadastro do mesmo telefone, os vínculos migram para ele antes da limpeza.
   */
  removeRegistration: async (
    tenantId: string,
    id: string,
  ): Promise<CustomerRemovalResult> => {
    try {
      return await withTenant(tenantId, async (tx) => {
        const found = await tx.customer.findFirst({ where: { id }, select: { phone: true } });
        if (!found) return { removed: false, reason: "NOT_FOUND" };
        const phoneKey = customerPhoneKey(found.phone);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${tenantId}:${phoneKey}`}))`;
        const customer = await tx.customer.findFirst({
          where: { id },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            neighborhood: true,
            imageConsent: true,
            createdAt: true,
            _count: { select: { bookings: true } },
          },
        });
        if (!customer) return { removed: false, reason: "NOT_FOUND" };
        if (customer._count.bookings > 0) return { removed: false, reason: "BOOKINGS" };

        const phone = customerPhoneKey(customer.phone);
        const [otherCustomers, conversations, leads, quoteCount] = await Promise.all([
          tx.customer.findMany({
            where: { id: { not: id } },
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              neighborhood: true,
              imageConsent: true,
              createdAt: true,
              _count: { select: { bookings: true } },
            },
          }),
          tx.conversation.findMany({ select: { id: true, phone: true, customerId: true } }),
          tx.lead.findMany({ select: { phone: true } }),
          tx.quote.count({ where: { customerId: id } }),
        ]);

        const replacement =
          otherCustomers
            .filter((candidate) => customerPhoneKey(candidate.phone) === phone)
            .sort(
              (a, b) =>
                b._count.bookings - a._count.bookings ||
                a.createdAt.getTime() - b.createdAt.getTime(),
            )[0] ?? null;
        const relatedConversations = conversations.filter(
          (conversation) =>
            conversation.customerId === id ||
            (!conversation.customerId && customerPhoneKey(conversation.phone) === phone),
        );
        const hasLeadHistory = leads.some((lead) => customerPhoneKey(lead.phone) === phone);
        const hasHistory = relatedConversations.length > 0 || hasLeadHistory || quoteCount > 0;

        if (hasHistory && !replacement) return { removed: false, reason: "HISTORY" };

        if (replacement) {
          const wouldLoseText = (discarded: string | null, kept: string | null) => {
            const value = discarded?.trim().toLocaleLowerCase("pt-BR") || null;
            if (!value) return false;
            return value !== (kept?.trim().toLocaleLowerCase("pt-BR") || null);
          };
          const wouldLoseData =
            wouldLoseText(customer.name, replacement.name) ||
            wouldLoseText(customer.email, replacement.email) ||
            wouldLoseText(customer.address, replacement.address) ||
            wouldLoseText(customer.neighborhood, replacement.neighborhood) ||
            customer.imageConsent !== replacement.imageConsent;
          if (wouldLoseData) return { removed: false, reason: "DATA" };

          if (relatedConversations.length) {
            await tx.conversation.updateMany({
              where: { id: { in: relatedConversations.map((conversation) => conversation.id) } },
              data: { customerId: replacement.id },
            });
          }
          if (quoteCount > 0) {
            await tx.quote.updateMany({
              where: { customerId: id },
              data: { customerId: replacement.id },
            });
          }
        }

        await tx.customer.delete({ where: { id } });
        return { removed: true, replacementId: replacement?.id ?? null };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return { removed: false, reason: "BOOKINGS" };
      }
      throw error;
    }
  },
};
