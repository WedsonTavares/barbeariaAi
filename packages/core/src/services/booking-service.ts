import { withTenant, type Tx } from "../db/withTenant";
import type { BookingInput, BookingUpdateInput } from "../schemas";
import { createBookingReminders, cancelBookingReminders } from "./reminder-service";

export class BookingConflictError extends Error {
  conflicts: string[];
  constructor(conflicts: string[]) {
    super("Brinquedo(s) já reservado(s) nesse intervalo");
    this.name = "BookingConflictError";
    this.conflicts = conflicts;
  }
}

export class BookingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingStateError";
  }
}

/**
 * Serializa reservas concorrentes dos MESMOS brinquedos na mesma transação:
 * sem isso, duas criações simultâneas passam ambas no findConflicts e geram
 * reserva dupla. Lock por toyId (ordenado p/ evitar deadlock), solto no commit.
 */
async function lockToys(tx: Tx, toyIds: string[]) {
  for (const toyId of [...toyIds].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${toyId}, 0))`;
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
      await lockToys(tx, input.toyIds);
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

  /**
   * Edita uma reserva aberta: revalida conflito (excluindo ela mesma), troca os
   * brinquedos, e — se já estava confirmada/em andamento — reagenda os lembretes
   * para o novo horário de retirada. Recalcula o paymentStatus se o total mudou.
   */
  update: (tenantId: string, id: string, input: BookingUpdateInput) =>
    withTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) throw new BookingStateError("Reserva não encontrada");
      if (existing.status === "CANCELED" || existing.status === "FINISHED") {
        throw new BookingStateError("Reserva encerrada não pode ser editada");
      }

      await lockToys(tx, input.toyIds);
      const conflicts = await findConflicts(tx, input.toyIds, input.setupTime, input.pickupTime, id);
      if (conflicts.length) throw new BookingConflictError(conflicts);

      const toys = await tx.toy.findMany({ where: { id: { in: input.toyIds } } });
      await tx.bookingItem.deleteMany({ where: { bookingId: id } });
      const b = await tx.booking.update({
        where: { id },
        data: {
          eventDate: input.eventDate,
          setupTime: input.setupTime,
          pickupTime: input.pickupTime,
          address: input.address,
          neighborhood: input.neighborhood,
          total: input.total,
          depositAmount: input.depositAmount,
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

      // Total mudou? Recalcula o status de pagamento com o que já foi pago.
      const agg = await tx.payment.aggregate({ where: { bookingId: id }, _sum: { amount: true } });
      const paid = Number(agg._sum.amount ?? 0);
      if (paid > 0) {
        const paymentStatus = paid >= Number(b.total) && Number(b.total) > 0 ? "PAID" : "DEPOSIT_PAID";
        if (paymentStatus !== b.paymentStatus) {
          await tx.booking.update({ where: { id }, data: { paymentStatus } });
        }
      }

      // Reserva já ativa → lembretes acompanham o novo horário de retirada.
      if (["CONFIRMED", "IN_DELIVERY", "MOUNTED"].includes(existing.status)) {
        await cancelBookingReminders(tx, id);
        await createBookingReminders(tx, tenantId, id, input.pickupTime);
      }
      return b;
    }),

  /** Confirma a reserva e (re)gera os lembretes de retirada. */
  confirm: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const existing = await tx.booking.findFirst({ where: { id } });
      if (!existing) throw new BookingStateError("Reserva não encontrada");
      if (existing.status === "CANCELED" || existing.status === "FINISHED") {
        throw new BookingStateError("Reserva encerrada não pode ser confirmada");
      }
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
