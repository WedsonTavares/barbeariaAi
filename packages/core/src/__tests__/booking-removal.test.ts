import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type BookingStatus } from "@prisma/client";
import { withTenant } from "../db/withTenant";
import { bookingService, BookingStateError } from "../services/booking-service";

const PRODUCTION_MARKERS = ["rzezilteejznqnmonhyi"];
const owner = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

let tenantId = "";
let customerId = "";
let toyId = "";
let conversationId = "";
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

beforeAll(async () => {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean).join(" ");
  if (PRODUCTION_MARKERS.some((marker) => urls.includes(marker))) {
    throw new Error("Teste de exclusão recusou executar contra produção.");
  }

  const tenant = await owner.tenant.create({
    data: {
      clerkOrgId: `org_booking_removal_${suffix}`,
      slug: `booking-removal-${suffix}`,
      name: "Teste de exclusão",
    },
  });
  tenantId = tenant.id;

  await withTenant(tenantId, async (tx) => {
    const customer = await tx.customer.create({
      data: {
        tenantId,
        name: "Cliente preservado",
        phone: "5516999990100",
      },
    });
    customerId = customer.id;

    const toy = await tx.toy.create({
      data: {
        tenantId,
        name: "Brinquedo preservado",
        category: "CAMA_ELASTICA",
        purchasePrice: 1000,
        defaultRentPrice: 150,
        purchaseDate: new Date("2026-01-01T12:00:00Z"),
      },
    });
    toyId = toy.id;

    const conversation = await tx.conversation.create({
      data: {
        tenantId,
        customerId,
        phone: "5516999990100",
        contactName: "Cliente preservado",
        notes: "Contexto que não pode ser apagado",
        tags: ["cliente-vip", "atendimento-humano"],
        botPaused: true,
      },
    });
    conversationId = conversation.id;
  });
});

afterAll(async () => {
  if (tenantId) await owner.tenant.delete({ where: { id: tenantId } });
  await owner.$disconnect();
});

async function createBooking(status: BookingStatus) {
  return withTenant(tenantId, (tx) =>
    tx.booking.create({
      data: {
        tenantId,
        customerId,
        eventDate: new Date("2032-01-10T12:00:00Z"),
        setupTime: new Date("2032-01-10T12:00:00Z"),
        pickupTime: new Date("2032-01-10T16:00:00Z"),
        total: 150,
        status,
        items: {
          create: {
            tenantId,
            toyId,
            price: 150,
          },
        },
        reminders: {
          create: {
            tenantId,
            type: "DELIVERY_30M",
            fireAt: new Date("2032-01-09T12:00:00Z"),
            status: "CANCELED",
          },
        },
      },
    })
  );
}

describe("exclusão definitiva de reserva", () => {
  it("recusa uma reserva que não está cancelada", async () => {
    const booking = await createBooking("CONFIRMED");

    await expect(
      bookingService.removeCanceled(tenantId, booking.id)
    ).rejects.toBeInstanceOf(BookingStateError);

    const exists = await withTenant(tenantId, (tx) =>
      tx.booking.count({ where: { id: booking.id } })
    );
    expect(exists).toBe(1);
  });

  it("apaga a cancelada sem alterar cliente, conversa, tags, notas ou brinquedo", async () => {
    const booking = await createBooking("CANCELED");

    await bookingService.removeCanceled(tenantId, booking.id);

    const state = await withTenant(tenantId, async (tx) => ({
      booking: await tx.booking.count({ where: { id: booking.id } }),
      items: await tx.bookingItem.count({ where: { bookingId: booking.id } }),
      reminders: await tx.bookingReminder.count({ where: { bookingId: booking.id } }),
      customer: await tx.customer.count({ where: { id: customerId } }),
      toy: await tx.toy.count({ where: { id: toyId } }),
      conversation: await tx.conversation.findFirstOrThrow({ where: { id: conversationId } }),
    }));

    expect(state.booking).toBe(0);
    expect(state.items).toBe(0);
    expect(state.reminders).toBe(0);
    expect(state.customer).toBe(1);
    expect(state.toy).toBe(1);
    expect(state.conversation.tags).toEqual(["cliente-vip", "atendimento-humano"]);
    expect(state.conversation.notes).toBe("Contexto que não pode ser apagado");
    expect(state.conversation.botPaused).toBe(true);
  });

  it.each(["pagamento", "despesa"] as const)("preserva cancelada com %s", async (kind) => {
    const booking = await createBooking("CANCELED");
    await withTenant(tenantId, async (tx) => {
      if (kind === "pagamento") {
        await tx.payment.create({
          data: {
            tenantId,
            bookingId: booking.id,
            amount: 50,
            method: "pix",
            paidAt: new Date(),
          },
        });
      } else {
        await tx.expense.create({
          data: {
            tenantId,
            bookingId: booking.id,
            category: "OTHER",
            amount: 30,
            description: "Despesa que deve ser preservada",
          },
        });
      }
    });

    await expect(
      bookingService.removeCanceled(tenantId, booking.id)
    ).rejects.toThrow("movimentação financeira");

    const state = await withTenant(tenantId, async (tx) => ({
      booking: await tx.booking.count({ where: { id: booking.id } }),
      payments: await tx.payment.count({ where: { bookingId: booking.id } }),
      expenses: await tx.expense.count({ where: { bookingId: booking.id } }),
    }));
    expect(state.booking).toBe(1);
    expect(kind === "pagamento" ? state.payments : state.expenses).toBe(1);
  });
});
