import { withTenant, type Tx } from "../db/withTenant";
import type { NotificationType } from "@prisma/client";

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
      tx.notification.findMany({ where: { read: false }, orderBy: { createdAt: "desc" }, take: 50 })
    ),
  markRead: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.notification.update({ where: { id }, data: { read: true } })),
  create: (tenantId: string, n: { type: NotificationType; title: string; body?: string; bookingId?: string }) =>
    withTenant(tenantId, (tx) => pushNotification(tx, tenantId, n)),
};
