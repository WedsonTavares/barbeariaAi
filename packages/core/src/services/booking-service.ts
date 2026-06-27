import { withTenant, type Tx } from "../db/withTenant";
import type { BookingInput } from "../schemas";
import { createBookingReminders, cancelBookingReminders } from "./reminder-service";

export class BookingConflictError extends Error {
  conflicts: string[];
  constructor(conflicts: string[]) {
    super("Brinquedo(s) já reservado(s) nesse intervalo");
    this.name = "BookingConflictError";
    this.conflicts = conflicts;
  }
}

/** toyIds que colidem com o intervalo [setup, pickup] no mesmo tenant. */
async function findConflicts(
  tx: Tx,
  toyIds: string[],
  setup: Date,
  pickup: Date,
  excludeBookingId?: string
): Promise<string[]> {
  const rows = await tx.bookingItem.findMany({
    where: {
      toyId: { in: toyIds },
      booking: {
        status: { not: "CANCELED" },
        setupTime: { lt: pickup },
        pickupTime: { gt: setup },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
    },
    select: { toyId: true },
  });
  return [...new Set(rows.map((r) => r.toyId))];
}

export const bookingService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.booking.findMany({
        orderBy: { eventDate: "asc" },
        include: { customer: true, items: { include: { toy: true } } },
      })
    ),

  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) =>
      tx.booking.findFirst({
        where: { id },
        include: { customer: true, items: { include: { toy: true } }, payments: true, expenses: true },
      })
    ),

  /** Disponibilidade: retorna lista de toyIds em conflito (vazia = livre). */
  checkAvailability: (tenantId: string, toyIds: string[], setup: Date, pickup: Date, excludeBookingId?: string) =>
    withTenant(tenantId, (tx) => findConflicts(tx, toyIds, setup, pickup, excludeBookingId)),

  create: (tenantId: string, input: BookingInput) =>
    withTenant(tenantId, async (tx) => {
      const conflicts = await findConflicts(tx, input.toyIds, input.setupTime, input.pickupTime);
      if (conflicts.length) throw new BookingConflictError(conflicts);

      const toys = await tx.toy.findMany({ where: { id: { in: input.toyIds } } });
      return tx.booking.create({
        data: {
          tenantId,
          customerId: input.customerId,
          eventDate: input.eventDate,
          setupTime: input.setupTime,
          pickupTime: input.pickupTime,
          address: input.address,
          neighborhood: input.neighborhood,
          total: input.total,
          depositAmount: input.depositAmount,
          leadSource: input.leadSource,
          notes: input.notes,
          items: {
            create: input.toyIds.map((toyId) => ({
              tenantId,
              toyId,
              price: Number(toys.find((t) => t.id === toyId)?.defaultRentPrice ?? 0),
            })),
          },
        },
        include: { items: true },
      });
    }),

  /** Confirma a reserva e (re)gera os lembretes de retirada. */
  confirm: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const b = await tx.booking.update({ where: { id }, data: { status: "CONFIRMED" } });
      if (b.pickupTime) {
        await cancelBookingReminders(tx, id);
        await createBookingReminders(tx, tenantId, id, b.pickupTime);
      }
      return b;
    }),

  setStatus: (tenantId: string, id: string, status: BookingStatusLike) =>
    withTenant(tenantId, async (tx) => {
      const b = await tx.booking.update({ where: { id }, data: { status } });
      if (status === "PICKED_UP" || status === "CANCELED" || status === "FINISHED") {
        await cancelBookingReminders(tx, id);
      }
      return b;
    }),
};

type BookingStatusLike =
  | "LEAD" | "QUOTE_SENT" | "WAITING_DEPOSIT" | "CONFIRMED"
  | "IN_DELIVERY" | "MOUNTED" | "PICKED_UP" | "FINISHED" | "CANCELED";
