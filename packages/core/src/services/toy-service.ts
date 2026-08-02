import { withTenant } from "../db/withTenant";
import type { ToyInput } from "../schemas";
import type { ToyStatus } from "@prisma/client";

/** Reservas que ainda ocupam o brinquedo (canceladas/finalizadas liberam). */
const OCCUPYING = ["LEAD", "QUOTE_SENT", "WAITING_DEPOSIT", "CONFIRMED", "IN_DELIVERY", "MOUNTED"] as const;

export const toyService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.toy.findMany({ orderBy: { createdAt: "desc" } })),

  /**
   * Lista com a situação REAL de cada brinquedo: além do status de cadastro,
   * diz se ele está ocupado hoje e qual a próxima festa. É o que a tela de
   * brinquedos mostra — com um só brinquedo, saber "ocupado até quando" é tudo.
   */
  listWithAvailability: (tenantId: string, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const toys = await tx.toy.findMany({ orderBy: { createdAt: "desc" } });
      const items = await tx.bookingItem.findMany({
        where: { booking: { status: { in: [...OCCUPYING] }, pickupTime: { gte: now } } },
        select: {
          toyId: true,
          booking: { select: { id: true, eventDate: true, setupTime: true, pickupTime: true, status: true, customer: { select: { name: true } } } },
        },
      });

      const byToy = new Map<string, typeof items>();
      for (const i of items) {
        if (!byToy.has(i.toyId)) byToy.set(i.toyId, []);
        byToy.get(i.toyId)!.push(i);
      }

      return toys.map((t) => {
        const list = (byToy.get(t.id) ?? []).sort(
          (a, b) => (a.booking.setupTime?.getTime() ?? 0) - (b.booking.setupTime?.getTime() ?? 0)
        );
        const busyNow = list.find(
          (i) => (i.booking.setupTime?.getTime() ?? 0) <= now.getTime() && (i.booking.pickupTime?.getTime() ?? 0) >= now.getTime()
        );
        const next = list[0];
        return {
          ...t,
          busyNow: Boolean(busyNow),
          busyUntil: busyNow?.booking.pickupTime ?? null,
          upcoming: list.length,
          nextBooking: next
            ? {
                id: next.booking.id,
                customerName: next.booking.customer.name,
                eventDate: next.booking.eventDate,
                setupTime: next.booking.setupTime,
                pickupTime: next.booking.pickupTime,
                status: next.booking.status,
              }
            : null,
        };
      });
    }),

  /**
   * Remove o brinquedo. Se já tem histórico de reservas, não dá pra apagar sem
   * perder o histórico — nesse caso aposenta (RETIRED), que já o esconde do site
   * e da IA. Devolve o que aconteceu pra tela avisar direito.
   */
  remove: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const used = await tx.bookingItem.count({ where: { toyId: id } });
      if (used > 0) {
        await tx.toy.update({ where: { id }, data: { status: "RETIRED" } });
        return { deleted: false as const, retired: true as const, bookings: used };
      }
      await tx.toy.delete({ where: { id } });
      return { deleted: true as const, retired: false as const, bookings: 0 };
    }),
  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.toy.findFirst({ where: { id } })),
  create: (tenantId: string, data: ToyInput) =>
    withTenant(tenantId, (tx) =>
      tx.toy.create({
        data: {
          tenantId,
          name: data.name,
          category: data.category,
          description: data.description,
          purchasePrice: data.purchasePrice,
          defaultRentPrice: data.defaultRentPrice,
        },
      })
    ),
  /**
   * Edita os dados de cadastro. Não mexe em `status` nem em `imageUrl`: cada um
   * tem o seu caminho próprio (`setStatus`/`setImage`), e passar por aqui
   * apagaria a foto sempre que alguém só corrigisse o nome.
   */
  update: (tenantId: string, id: string, data: ToyInput) =>
    withTenant(tenantId, (tx) =>
      tx.toy.update({
        where: { id },
        data: {
          name: data.name,
          category: data.category,
          description: data.description ?? null,
          purchasePrice: data.purchasePrice,
          defaultRentPrice: data.defaultRentPrice,
        },
      })
    ),
  setStatus: (tenantId: string, id: string, status: ToyStatus) =>
    withTenant(tenantId, (tx) => tx.toy.update({ where: { id }, data: { status } })),
  /** Foto do brinquedo (URL pública do Supabase Storage). */
  setImage: (tenantId: string, id: string, imageUrl: string) =>
    withTenant(tenantId, (tx) => tx.toy.update({ where: { id }, data: { imageUrl } })),
};
