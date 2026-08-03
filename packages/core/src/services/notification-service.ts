import { withTenant, type Tx } from "../db/withTenant";
import type { NotificationType } from "@prisma/client";

const GENERIC_WHATSAPP_TITLE = "Nova mensagem no WhatsApp";
const HUMAN_SUPPORT_TITLE = "Cliente pediu atendimento humano";

const actionableUnread = {
  read: false,
  NOT: {
    type: "NEW_WHATSAPP_MESSAGE" as const,
    title: GENERIC_WHATSAPP_TITLE,
  },
};

export async function pushNotification(
  tx: Tx,
  tenantId: string,
  n: { type: NotificationType; title: string; body?: string; bookingId?: string }
) {
  return tx.notification.create({ data: { tenantId, ...n } });
}

export const notificationService = {
  listUnread: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.notification.findMany({
        where: actionableUnread,
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    ),
  unreadCount: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.notification.count({ where: actionableUnread })
    ),

  /**
   * Os sinais que o painel pisca no topo, numa leitura só.
   *
   * São DUAS origens diferentes: agendamento novo, cancelamento e pedido de
   * atendimento humano viram registro de Notification; mensagem comum não —
   * ela fica no `unread` da conversa, porque o sino é reservado a evento
   * acionável (senão cada "oi" acenderia alerta).
   *
   * `ultimoAvisoEm` deixa o cliente saber se apareceu algo NOVO desde a última
   * consulta sem precisar comparar listas.
   */
  sinais: (tenantId: string) =>
    withTenant(tenantId, async (tx) => {
      const [avisos, conversas, ultimo] = await Promise.all([
        tx.notification.count({ where: actionableUnread }),
        tx.conversation.count({ where: { archivedAt: null, unread: { gt: 0 } } }),
        tx.notification.findFirst({
          where: actionableUnread,
          orderBy: { createdAt: "desc" },
          select: { title: true, body: true, createdAt: true },
        }),
      ]);
      return {
        avisos,
        conversas,
        ultimoAviso: ultimo ? { titulo: ultimo.title, corpo: ultimo.body } : null,
        ultimoAvisoEm: ultimo ? ultimo.createdAt.toISOString() : null,
      };
    }),
  markRead: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.notification.update({ where: { id }, data: { read: true } })),
  markAllRead: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      // Inclui o ruído legado de mensagens comuns, embora ele já não apareça
      // na tela nem no contador. Assim o histórico antigo também é saneado.
      tx.notification.updateMany({ where: { read: false }, data: { read: true } })
    ),
  create: (tenantId: string, n: { type: NotificationType; title: string; body?: string; bookingId?: string }) =>
    withTenant(tenantId, (tx) => pushNotification(tx, tenantId, n)),

  /** Uma única pendência de atendimento humano por telefone até ser lida. */
  humanRequested: (tenantId: string, phone: string, name?: string, reason?: string) =>
    withTenant(tenantId, async (tx) => {
      const normalizedPhone = phone.replace(/\D/g, "");
      const phoneLabel = normalizedPhone || phone.trim() || "não informado";
      const phonePrefix = `Telefone: ${phoneLabel}`;
      const body = [phonePrefix, name, reason].filter(Boolean).join(" · ");

      // Se a entrada for inválida, ainda avisamos a equipe, mas não tentamos
      // deduplicar por uma identidade ambígua.
      if (normalizedPhone.length < 8) {
        return pushNotification(tx, tenantId, {
          type: "NEW_WHATSAPP_MESSAGE",
          title: HUMAN_SUPPORT_TITLE,
          body,
        });
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notification-support:${tenantId}:${normalizedPhone}`}))`;
      const existing = await tx.notification.findFirst({
        where: {
          type: "NEW_WHATSAPP_MESSAGE",
          title: HUMAN_SUPPORT_TITLE,
          read: false,
          OR: [
            { body: phonePrefix },
            { body: { startsWith: `${phonePrefix} ·` } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const updated = await tx.notification.updateMany({
          where: { id: existing.id, read: false },
          data: { body },
        });
        // Se "Marcar todas" venceu a corrida, este é um pedido novo e deve
        // nascer como pendente em vez de atualizar uma linha que já ficou lida.
        if (updated.count > 0) {
          return tx.notification.findUniqueOrThrow({ where: { id: existing.id } });
        }
      }
      return pushNotification(tx, tenantId, {
        type: "NEW_WHATSAPP_MESSAGE",
        title: HUMAN_SUPPORT_TITLE,
        body,
      });
    }),
};
