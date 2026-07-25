import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withTenant } from "../db/withTenant";
import { bookingService, BookingConflictError } from "../services/booking-service";
import { conversationService } from "../services/conversation-service";

const PRODUCTION_MARKERS = ["rzezilteejznqnmonhyi"];
const owner = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

let tenantId = "";
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

beforeAll(async () => {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(Boolean).join(" ");
  if (PRODUCTION_MARKERS.some((marker) => urls.includes(marker))) {
    throw new Error("Teste de agendamento recusou executar contra produção.");
  }

  const tenant = await owner.tenant.create({
    data: {
      clerkOrgId: `org_agent_booking_${suffix}`,
      slug: `agent-booking-${suffix}`,
      name: "Teste de agenda",
    },
  });
  tenantId = tenant.id;

  await withTenant(tenantId, async (tx) => {
    await tx.tenantSettings.create({
      data: { tenantId, minRentalHours: 4, minRentalPrice: 150 },
    });
    await tx.toy.create({
      data: {
        tenantId,
        name: "Pula-pula Teste",
        category: "CAMA_ELASTICA",
        purchasePrice: 1000,
        defaultRentPrice: 150,
        purchaseDate: new Date("2026-01-01T12:00:00Z"),
      },
    });
    await tx.conversation.create({
      data: {
        tenantId,
        phone: "5516999990001",
        contactName: "Cliente Teste",
        stage: "SUPORTE_HUMANO",
        tags: ["atendimento-humano", "cliente-vip"],
        botPaused: true,
      },
    });
    await tx.lead.create({
      data: {
        tenantId,
        phone: "5516999990001",
        name: "Cliente Teste",
        source: "WHATSAPP",
        status: "QUOTED",
      },
    });
  });
});

afterAll(async () => {
  if (tenantId) await owner.tenant.delete({ where: { id: tenantId } });
  await owner.$disconnect();
});

describe("reserva criada pelo agente", () => {
  it("marca e desmarca uma tag sem erro nem perder a etapa", async () => {
    const conversation = await withTenant(tenantId, (tx) =>
      tx.conversation.create({
        data: {
          tenantId,
          phone: "5516999990099",
          contactName: "Teste de tags",
          stage: "IA_ATENDENDO",
          tags: ["cliente-vip"],
        },
      })
    );

    const marked = await conversationService.toggleTag(
      tenantId,
      conversation.id,
      "aguardando-sinal",
      true
    );
    expect(marked.tags).toEqual(expect.arrayContaining(["cliente-vip", "aguardando-sinal"]));
    expect(marked.stage).toBe("IA_ATENDENDO");

    const unmarked = await conversationService.toggleTag(
      tenantId,
      conversation.id,
      "aguardando-sinal",
      false
    );
    expect(unmarked.tags).toEqual(["cliente-vip"]);
    expect(unmarked.stage).toBe("IA_ATENDENDO");
  });

  it("trata repetição como sucesso e sincroniza a conversa uma única vez", async () => {
    const input = {
      phone: "5516999990001",
      name: "Cliente Teste",
      date: "2031-09-24",
      setupTime: "14:00",
      pickupTime: "18:00",
      toys: ["Pula-pula Teste"],
      address: "Rua de Teste, 100",
    };

    const first = await bookingService.createFromAgent(tenantId, input);
    const replay = await bookingService.createFromAgent(tenantId, input);

    expect(first.alreadyExists).toBe(false);
    expect(replay.alreadyExists).toBe(true);
    expect(replay.bookingId).toBe(first.bookingId);

    const state = await withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findUniqueOrThrow({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
      });
      const lead = await tx.lead.findFirstOrThrow({ where: { phone: input.phone } });
      return {
        bookings: await tx.booking.count(),
        reminders: await tx.bookingReminder.count({ where: { bookingId: first.bookingId } }),
        notifications: await tx.notification.count({ where: { bookingId: first.bookingId } }),
        conversation,
        lead,
      };
    });

    expect(state.bookings).toBe(1);
    expect(state.reminders).toBe(7);
    expect(state.notifications).toBe(1);
    expect(state.conversation.stage).toBe("AGENDADO");
    expect(state.conversation.tags).toEqual(expect.arrayContaining(["cliente-vip", "agendado"]));
    expect(state.conversation.tags).not.toContain("atendimento-humano");
    expect(state.conversation.botPaused).toBe(false);
    expect(state.conversation.notes).toContain("2031-09-24 das 14:00 às 18:00");
    expect(state.conversation.customerId).toBeTruthy();
    expect(state.lead.status).toBe("WON");
    expect(state.lead.bookingId).toBe(first.bookingId);

    const board = await conversationService.board(tenantId);
    const card = board.AGENDADO.find((item) => item.phone === input.phone);
    expect(card?.activeBookingAt?.toISOString()).toBe(first.setupISO);
  });

  it("serializa duas chamadas simultâneas idênticas", async () => {
    const input = {
      phone: "5516999990002",
      name: "Cliente Concorrente",
      date: "2031-09-25",
      setupTime: "09:00",
      pickupTime: "13:00",
      toys: ["Pula-pula Teste"],
    };

    const [a, b] = await Promise.all([
      bookingService.createFromAgent(tenantId, input),
      bookingService.createFromAgent(tenantId, input),
    ]);

    expect(a.bookingId).toBe(b.bookingId);
    expect([a.alreadyExists, b.alreadyExists].sort()).toEqual([false, true]);

    const count = await withTenant(tenantId, (tx) =>
      tx.booking.count({
        where: {
          setupTime: new Date("2031-09-25T12:00:00.000Z"),
          pickupTime: new Date("2031-09-25T16:00:00.000Z"),
        },
      })
    );
    expect(count).toBe(1);
  });

  it("mantém conflito real para outro cliente", async () => {
    await expect(
      bookingService.createFromAgent(tenantId, {
        phone: "5516999990003",
        name: "Outro Cliente",
        date: "2031-09-24",
        setupTime: "15:00",
        pickupTime: "19:00",
        toys: ["Pula-pula Teste"],
      })
    ).rejects.toBeInstanceOf(BookingConflictError);
  });

  it("ignora reserva cancelada e funciona mesmo sem conversa", async () => {
    const input = {
      phone: "5516999990004",
      name: "Cliente sem conversa",
      date: "2031-09-26",
      setupTime: "10:00",
      pickupTime: "14:00",
      toys: ["Pula-pula Teste"],
    };

    const canceled = await bookingService.createFromAgent(tenantId, input);
    await bookingService.setStatus(tenantId, canceled.bookingId, "CANCELED");
    const replacement = await bookingService.createFromAgent(tenantId, input);

    expect(replacement.bookingId).not.toBe(canceled.bookingId);
    expect(replacement.alreadyExists).toBe(false);

    const state = await withTenant(tenantId, async (tx) => ({
      bookings: await tx.booking.count({
        where: { customer: { phone: input.phone } },
      }),
      conversation: await tx.conversation.findUnique({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
      }),
    }));
    expect(state.bookings).toBe(2);
    expect(state.conversation).toBeNull();
  });

  it("repara no replay uma conversa antiga que ainda estava com a IA", async () => {
    const input = {
      phone: "5516999990005",
      name: "Cliente de reserva antiga",
      date: "2031-09-27",
      setupTime: "14:00",
      pickupTime: "18:00",
      toys: ["Pula-pula Teste"],
    };

    const existing = await bookingService.createFromAgent(tenantId, input);
    await withTenant(tenantId, async (tx) => {
      await tx.lead.create({
        data: {
          tenantId,
          phone: input.phone,
          name: input.name,
          source: "WHATSAPP",
          status: "QUOTED",
          createdAt: new Date("2020-01-01T12:00:00.000Z"),
        },
      });
      await tx.conversation.create({
        data: {
          tenantId,
          phone: input.phone,
          contactName: input.name,
          stage: "IA_ATENDENDO",
          tags: ["cliente-vip"],
        },
      });
    });

    const replay = await bookingService.createFromAgent(tenantId, input);
    expect(replay.bookingId).toBe(existing.bookingId);
    expect(replay.alreadyExists).toBe(true);

    const repaired = await withTenant(tenantId, async (tx) => ({
      conversation: await tx.conversation.findUniqueOrThrow({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
      }),
      lead: await tx.lead.findFirstOrThrow({ where: { phone: input.phone } }),
    }));
    const conversation = repaired.conversation;
    expect(conversation.stage).toBe("AGENDADO");
    expect(conversation.tags).toEqual(expect.arrayContaining(["cliente-vip", "agendado"]));
    expect(repaired.lead.status).toBe("WON");
    expect(repaired.lead.bookingId).toBe(existing.bookingId);

    await conversationService.takeOver(tenantId, conversation.id);
    await bookingService.createFromAgent(tenantId, input);
    const preserved = await withTenant(tenantId, (tx) =>
      tx.conversation.findUniqueOrThrow({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
      })
    );
    expect(preserved.stage).toBe("SUPORTE_HUMANO");
    expect(preserved.tags).toContain("atendimento-humano");
  });

  it("não chama orçamento ou reserva não confirmada de replay confirmado", async () => {
    const input = {
      phone: "5516999990006",
      name: "Cliente aguardando",
      date: "2031-09-28",
      setupTime: "14:00",
      pickupTime: "18:00",
      toys: ["Pula-pula Teste"],
    };

    const existing = await bookingService.createFromAgent(tenantId, input);
    await bookingService.setStatus(tenantId, existing.bookingId, "WAITING_DEPOSIT");

    await expect(
      bookingService.createFromAgent(tenantId, input)
    ).rejects.toBeInstanceOf(BookingConflictError);
  });
});
