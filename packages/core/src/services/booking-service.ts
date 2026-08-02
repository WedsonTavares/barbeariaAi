import { withTenant, type Tx } from "../db/withTenant";
import type {
  BookingInput,
  BookingUpdateInput,
  AgentBookingInput,
  AgentBookingCancelInput,
  AgentBookingRescheduleInput,
} from "../schemas";
import { createBookingReminders, cancelBookingReminders } from "./reminder-service";
import { pushNotification } from "./notification-service";
import { APP_TZ, parseLocalDateTime } from "../time";
import { quoteWithMinimum } from "../calculations";
import { customerPhoneKey, toWhatsAppPhone } from "../phone";
import { matchesToyName } from "../text";
import { markConversationScheduled } from "./conversation-service";
import {
  AVAILABILITY_SLOT_MINUTES,
  buildDailyAvailabilitySlots,
  type OccupiedToyInterval,
} from "../availability";

const SP_DATETIME = new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" });
const SP_DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TZ, dateStyle: "short" });

/** Brinquedo "fora" enquanto a reserva está em entrega/montado; volta a disponível ao retirar. */
const OUT_STATUSES = new Set(["IN_DELIVERY", "MOUNTED"]);
const RETURN_STATUSES = new Set(["PICKED_UP", "FINISHED", "CANCELED"]);

/** Sincroniza Toy.status com o ciclo da reserva. Nunca sobrescreve MANUTENÇÃO. */
async function syncToyStatus(tx: Tx, bookingId: string, nextBookingStatus: string) {
  if (!OUT_STATUSES.has(nextBookingStatus) && !RETURN_STATUSES.has(nextBookingStatus)) return;
  const items = await tx.bookingItem.findMany({ where: { bookingId }, select: { toyId: true } });
  const toyIds = items.map((i) => i.toyId);
  if (toyIds.length === 0) return;
  if (OUT_STATUSES.has(nextBookingStatus)) {
    await tx.toy.updateMany({ where: { id: { in: toyIds }, status: "AVAILABLE" }, data: { status: "RENTED" } });
  } else {
    await tx.toy.updateMany({ where: { id: { in: toyIds }, status: "RENTED" }, data: { status: "AVAILABLE" } });
  }
}

export class BookingConflictError extends Error {
  conflicts: string[];
  constructor(conflicts: string[]) {
    super("Brinquedo(s) já reservado(s) nesse intervalo");
    this.name = "BookingConflictError";
    this.conflicts = conflicts;
  }
}

/** Erro "amigável" que o agente de IA repassa ao cliente (ex.: brinquedo não encontrado). */
export class BookingAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingAgentError";
  }
}

export class BookingStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingStateError";
  }
}

/**
 * Reserva com dinheiro em jogo (sinal recebido). Cancelar aqui mexe em política
 * de devolução — é decisão de gente, não do modelo. A IA cai de volta no fluxo
 * humano de /api/agent/cancelamento. Estende BookingStateError de propósito:
 * quem já tratava "estado" continua tratando.
 */
export class BookingPaymentError extends BookingStateError {
  constructor(message: string) {
    super(message);
    this.name = "BookingPaymentError";
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

async function lockCustomerPhone(tx: Tx, tenantId: string, phone: string) {
  const key = customerPhoneKey(phone);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${tenantId}:${key}`}))`;
}

async function lockBooking(tx: Tx, tenantId: string, bookingId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Booking"
    WHERE "id" = ${bookingId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  return rows.length > 0;
}

async function bookingForAgent(tx: Tx, bookingId: string, phone: string) {
  const booking = await tx.booking.findFirst({
    where: { id: bookingId },
    include: { customer: true, items: { include: { toy: true } } },
  });
  if (!booking || customerPhoneKey(booking.customer.phone) !== customerPhoneKey(phone)) {
    throw new BookingAgentError("Agendamento não encontrado para este telefone.");
  }
  return booking;
}

const AGENT_MUTABLE_STATUSES = new Set([
  "LEAD",
  "QUOTE_SENT",
  "WAITING_DEPOSIT",
  "CONFIRMED",
]);

function assertAgentMutable(status: string) {
  if (!AGENT_MUTABLE_STATUSES.has(status)) {
    throw new BookingStateError("Este agendamento não pode mais ser alterado automaticamente.");
  }
}

async function matchingOpenLeadIds(tx: Tx, phone: string, createdBefore?: Date) {
  const key = customerPhoneKey(phone);
  const rows = await tx.lead.findMany({
    where: {
      status: { in: ["NEW", "CONTACTED", "QUOTED"] },
      ...(createdBefore ? { createdAt: { lte: createdBefore } } : {}),
    },
    select: { id: true, phone: true },
  });
  return rows.filter((lead) => customerPhoneKey(lead.phone) === key).map((lead) => lead.id);
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

function sameToySet(current: string[], wanted: string[]) {
  if (current.length !== wanted.length) return false;
  const a = [...current].sort();
  const b = [...wanted].sort();
  return a.every((id, index) => id === b[index]);
}

function agentBookingNote(
  input: AgentBookingInput,
  result: { toys: string[]; total: number }
) {
  const local = [input.address, input.neighborhood].filter(Boolean).join(", ");
  return (
    `Reserva fechada: ${result.toys.join(", ")} — ${input.date} das ${input.setupTime} às ${input.pickupTime}` +
    (local ? ` em ${local}` : "") +
    `. Total R$ ${result.total}. Sinal a combinar.`
  );
}

export const bookingService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.booking.findMany({
        orderBy: { eventDate: "asc" },
        include: { customer: true, items: { include: { toy: true } } },
      })
    ),

  /**
   * Ferramenta "meus agendamentos": festas ativas desse telefone (não canceladas),
   * mais próxima primeiro. Autoridade pra IA responder "quando é minha festa?".
   */
  upcomingForPhone: (tenantId: string, phone: string, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const phoneKey = customerPhoneKey(phone);
      const customers = await tx.customer.findMany({ select: { id: true, phone: true } });
      const customerIds = customers
        .filter((customer) => customerPhoneKey(customer.phone) === phoneKey)
        .map((customer) => customer.id);
      if (!customerIds.length) return [];
      return tx.booking.findMany({
        where: { customerId: { in: customerIds }, status: { not: "CANCELED" }, pickupTime: { gte: now } },
        orderBy: { eventDate: "asc" },
        include: { items: { include: { toy: true } } },
      });
    }),

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

  /**
   * Grade diária de slots para o n8n combinar em blocos contínuos. Somente
   * leitura. Slots que já começaram saem como indisponíveis (ver `now`).
   */
  availabilitySlots: (
    tenantId: string,
    toyIds: string[],
    dayStart: Date,
    slotMinutes = AVAILABILITY_SLOT_MINUTES,
    now = new Date()
  ) =>
    withTenant(tenantId, async (tx) => {
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const rows = await tx.bookingItem.findMany({
        where: {
          toyId: { in: toyIds },
          booking: {
            status: { not: "CANCELED" },
            setupTime: { lt: dayEnd },
            pickupTime: { gt: dayStart },
          },
        },
        select: {
          toyId: true,
          booking: { select: { setupTime: true, pickupTime: true } },
        },
      });
      const occupied: OccupiedToyInterval[] = [];
      for (const row of rows) {
        if (row.booking.setupTime && row.booking.pickupTime) {
          occupied.push({
            toyId: row.toyId,
            setupTime: row.booking.setupTime,
            pickupTime: row.booking.pickupTime,
          });
        }
      }
      return buildDailyAvailabilitySlots(dayStart, toyIds, occupied, slotMinutes, now);
    }),

  /**
   * Reagenda sem alterar brinquedos, preço, pagamento, cliente, CRM ou tags.
   * O bookingId precisa pertencer ao telefone e o novo intervalo é revalidado
   * sob o mesmo lock usado na criação de reservas.
   */
  rescheduleFromAgent: (tenantId: string, input: AgentBookingRescheduleInput, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      if (!(await lockBooking(tx, tenantId, input.bookingId))) {
        throw new BookingAgentError("Agendamento não encontrado para este telefone.");
      }
      const existing = await bookingForAgent(tx, input.bookingId, input.phone);
      assertAgentMutable(existing.status);

      const setup = parseLocalDateTime(`${input.date}T${input.setupTime}`);
      const pickup = parseLocalDateTime(`${input.date}T${input.pickupTime}`);
      if (!(pickup > setup)) {
        throw new BookingAgentError("O horário de retirada precisa ser depois do de montagem.");
      }
      // A grade de slots já esconde horário passado; aqui é a rede de segurança
      // para a IA não empurrar a festa para trás quando erra a data.
      if (setup.getTime() < now.getTime()) {
        throw new BookingAgentError("Esse horário já passou — escolha uma data ou horário futuro.");
      }

      const toyIds = existing.items.map((item) => item.toyId);
      if (!toyIds.length) throw new BookingStateError("Este agendamento não possui brinquedos.");
      await lockToys(tx, toyIds);

      const conflicts = await findConflicts(tx, toyIds, setup, pickup, existing.id);
      if (conflicts.length) throw new BookingConflictError(conflicts);

      const unchanged =
        existing.setupTime?.getTime() === setup.getTime() &&
        existing.pickupTime?.getTime() === pickup.getTime();
      if (!unchanged) {
        await tx.booking.update({
          where: { id: existing.id },
          data: { eventDate: setup, setupTime: setup, pickupTime: pickup },
        });

        if (existing.status === "CONFIRMED") {
          await cancelBookingReminders(tx, existing.id);
          await createBookingReminders(tx, tenantId, existing.id, setup, pickup);
        }
        await pushNotification(tx, tenantId, {
          type: "BOOKING_RESCHEDULED",
          title: "Reserva reagendada",
          body: `Novo horário: entrega ${SP_DATETIME.format(setup)} · retirada ${SP_DATETIME.format(pickup)}`,
          bookingId: existing.id,
        });
      }

      return {
        bookingId: existing.id,
        date: input.date,
        setupTime: input.setupTime,
        pickupTime: input.pickupTime,
        setupISO: setup.toISOString(),
        pickupISO: pickup.toISOString(),
        toys: existing.items.map((item) => item.toy.name),
        calendarEventId: existing.googleCalendarEventId,
        alreadyUpdated: unchanged,
      };
    }),

  /**
   * Cancela uma reserva específica e libera seus horários. A operação é
   * idempotente e não apaga histórico financeiro, cliente, conversa ou tags.
   */
  cancelFromAgent: (tenantId: string, input: AgentBookingCancelInput) =>
    withTenant(tenantId, async (tx) => {
      if (!input.confirmed) throw new BookingAgentError("Confirmação de cancelamento ausente.");

      if (!(await lockBooking(tx, tenantId, input.bookingId))) {
        throw new BookingAgentError("Agendamento não encontrado para este telefone.");
      }
      const existing = await bookingForAgent(tx, input.bookingId, input.phone);
      if (existing.status === "CANCELED") {
        return {
          bookingId: existing.id,
          canceled: true,
          alreadyCanceled: true,
          calendarEventId: existing.googleCalendarEventId,
        };
      }
      assertAgentMutable(existing.status);

      // Sinal já recebido → devolução é conversa de gente. A IA não decide isso.
      const paid = await tx.payment.count({ where: { bookingId: existing.id } });
      if (paid > 0 || existing.paymentStatus === "DEPOSIT_PAID" || existing.paymentStatus === "PAID") {
        throw new BookingPaymentError(
          "Essa reserva já tem pagamento registrado — a equipe precisa tratar o cancelamento e a devolução."
        );
      }

      await tx.booking.update({ where: { id: existing.id }, data: { status: "CANCELED" } });
      await cancelBookingReminders(tx, existing.id);
      await syncToyStatus(tx, existing.id, "CANCELED");

      // A equipe precisa saber que a agenda abriu — senão o cancelamento da IA
      // só aparece pra quem for olhar o painel por acaso.
      const quando = existing.setupTime
        ? SP_DATETIME.format(existing.setupTime)
        : SP_DATE.format(existing.eventDate);
      await pushNotification(tx, tenantId, {
        type: "BOOKING_CANCEL_REQUESTED",
        title: "Festa cancelada pela IA",
        body: `${existing.customer.name} · ${quando} · ${existing.items.map((item) => item.toy.name).join(", ") || "sem brinquedo"}`,
        bookingId: existing.id,
      });

      return {
        bookingId: existing.id,
        canceled: true,
        alreadyCanceled: false,
        calendarEventId: existing.googleCalendarEventId,
      };
    }),

  /**
   * Reserva fechada pelo agente de IA (WhatsApp). Fecha DE VERDADE (status CONFIRMED,
   * segura o brinquedo e gera lembretes), mas com rede de segurança do banco:
   * - conflito de brinquedo é REJEITADO aqui (autoridade), mesmo que a IA tenha errado;
   * - cliente é encontrado pelo telefone ou criado na hora;
   * - total respeita a locação mínima do tenant;
   * - pagamento fica PENDING e a equipe é notificada (a IA nunca processa pagamento).
   * Retorna a reserva + um resumo pronto pro n8n espelhar no Google Calendar.
   */
  createFromAgent: (tenantId: string, input: AgentBookingInput) =>
    withTenant(tenantId, async (tx) => {
      const setup = parseLocalDateTime(`${input.date}T${input.setupTime}`);
      const pickup = parseLocalDateTime(`${input.date}T${input.pickupTime}`);
      if (!(pickup > setup)) throw new BookingAgentError("O horário de retirada precisa ser depois do de montagem.");

      // Resolve cada nome de brinquedo → exatamente 1 brinquedo. Fora do catálogo
      // da IA: aposentados e em manutenção (o painel é a autoridade do que existe).
      const available = await tx.toy.findMany({ where: { status: { notIn: ["RETIRED", "MAINTENANCE"] } } });
      const chosen: { id: string; name: string; price: number }[] = [];
      for (const wanted of input.toys) {
        const matches = available.filter((t) => matchesToyName(t.name, wanted));
        if (matches.length === 0) throw new BookingAgentError(`Não encontrei o brinquedo "${wanted}" no catálogo.`);
        if (matches.length > 1) throw new BookingAgentError(`"${wanted}" é ambíguo (${matches.map((m) => m.name).join(", ")}). Qual exatamente?`);
        const toy = matches[0]!;
        if (!chosen.some((c) => c.id === toy.id)) {
          chosen.push({ id: toy.id, name: toy.name, price: Number(toy.defaultRentPrice) });
        }
      }
      const toyIds = chosen.map((c) => c.id);

      // Rede de segurança: serializa chamadas dos mesmos brinquedos. Depois do
      // lock, um retry consegue enxergar a reserva que a primeira chamada criou.
      await lockToys(tx, toyIds);
      await lockCustomerPhone(tx, tenantId, input.phone);
      const phoneKey = customerPhoneKey(input.phone);
      const conversation = await tx.conversation.findUnique({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
        select: { customerId: true },
      });
      const matchingCustomers = (await tx.customer.findMany({
        include: { _count: { select: { bookings: true } } },
      }))
        .filter((customer) => customerPhoneKey(customer.phone) === phoneKey)
        .sort(
          (a, b) =>
            Number(b.id === conversation?.customerId) - Number(a.id === conversation?.customerId) ||
            b._count.bookings - a._count.bookings ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        );
      const matchingCustomerIds = matchingCustomers.map((customer) => customer.id);
      const replayCandidates = await tx.booking.findMany({
        where: {
          leadSource: "WHATSAPP",
          status: { in: ["CONFIRMED", "IN_DELIVERY", "MOUNTED"] },
          setupTime: setup,
          pickupTime: pickup,
          customerId: { in: matchingCustomerIds },
        },
        include: { customer: true, items: { include: { toy: true } } },
      });
      const replay = replayCandidates.find((booking) =>
        sameToySet(booking.items.map((item) => item.toyId), toyIds)
      );
      if (replay) {
        const result = {
          bookingId: replay.id,
          total: Number(replay.total),
          toys: replay.items.map((item) => item.toy.name),
          setupISO: setup.toISOString(),
          pickupISO: pickup.toISOString(),
          customerName: replay.customer.name,
          alreadyExists: true,
          replayed: true,
        };
        await markConversationScheduled(tx, tenantId, {
          phone: input.phone,
          customerId: replay.customerId,
          note: agentBookingNote(input, result),
          repairOnly: true,
        });
        // Repara apenas leads que já existiam quando essa reserva foi criada;
        // um novo interesse posterior do mesmo telefone não pode ser fechado.
        const leadIds = await matchingOpenLeadIds(tx, input.phone, replay.createdAt);
        if (leadIds.length) {
          await tx.lead.updateMany({
            where: { id: { in: leadIds } },
            data: { status: "WON", bookingId: replay.id },
          });
        }
        return result;
      }

      // Não é repetição: qualquer sobreposição continua sendo conflito real.
      const conflicts = await findConflicts(tx, toyIds, setup, pickup);
      if (conflicts.length) throw new BookingConflictError(conflicts);

      // Cliente: reaproveita pelo telefone; senão cria.
      let customer = matchingCustomers[0] ?? null;
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            tenantId,
            name: input.name,
            phone: toWhatsAppPhone(input.phone),
            neighborhood: input.neighborhood,
            address: input.address,
          },
          include: { _count: { select: { bookings: true } } },
        });
      }

      const settings = await tx.tenantSettings.findUnique({ where: { tenantId } });
      const total = quoteWithMinimum(chosen.map((c) => c.price), Number(settings?.minRentalPrice ?? 150));

      const booking = await tx.booking.create({
        data: {
          tenantId,
          customerId: customer.id,
          eventDate: setup,
          setupTime: setup,
          pickupTime: pickup,
          address: input.address,
          neighborhood: input.neighborhood,
          total,
          status: "CONFIRMED",
          leadSource: "WHATSAPP",
          notes: input.notes ? `[IA] ${input.notes}` : "[IA] Reserva fechada pelo agente no WhatsApp",
          items: { create: chosen.map((c) => ({ tenantId, toyId: c.id, price: c.price })) },
        },
      });
      await createBookingReminders(tx, tenantId, booking.id, setup, pickup);
      await pushNotification(tx, tenantId, {
        type: "BOOKING_RESCHEDULED",
        title: "🤖 Reserva fechada pelo agente de IA",
        body: `${customer.name} · ${SP_DATETIME.format(setup)} · ${chosen.map((c) => c.name).join(", ")} · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (sinal pendente)`,
        bookingId: booking.id,
      });

      const result = {
        bookingId: booking.id,
        total,
        toys: chosen.map((c) => c.name),
        setupISO: setup.toISOString(),
        pickupISO: pickup.toISOString(),
        customerName: customer.name,
        alreadyExists: false,
        replayed: false,
      };
      await markConversationScheduled(tx, tenantId, {
        phone: input.phone,
        customerId: customer.id,
        note: agentBookingNote(input, result),
      });
      const leadIds = await matchingOpenLeadIds(tx, input.phone);
      if (leadIds.length) {
        await tx.lead.updateMany({
          where: { id: { in: leadIds } },
          data: { status: "WON", bookingId: booking.id },
        });
      }
      return result;
    }),

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
      if (!(await lockBooking(tx, tenantId, id))) {
        throw new BookingStateError("Reserva não encontrada");
      }
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

      // Reserva já ativa → lembretes acompanham o novo horário de entrega/retirada.
      const timeChanged =
        existing.setupTime?.getTime() !== input.setupTime.getTime() ||
        existing.pickupTime?.getTime() !== input.pickupTime.getTime();
      if (["CONFIRMED", "IN_DELIVERY", "MOUNTED"].includes(existing.status)) {
        await cancelBookingReminders(tx, id);
        await createBookingReminders(tx, tenantId, id, input.setupTime, input.pickupTime);
        // Só avisa "reagendada" se o horário mudou de verdade (não em toda edição).
        if (timeChanged) {
          await pushNotification(tx, tenantId, {
            type: "BOOKING_RESCHEDULED",
            title: "Reserva reagendada",
            body: `Novo horário: entrega ${SP_DATETIME.format(input.setupTime)} · retirada ${SP_DATETIME.format(input.pickupTime)}`,
            bookingId: id,
          });
        }
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
      if (b.setupTime || b.pickupTime) {
        await cancelBookingReminders(tx, id);
        await createBookingReminders(tx, tenantId, id, b.setupTime, b.pickupTime);
      }
      return b;
    }),

  setStatus: (tenantId: string, id: string, status: BookingStatusLike) =>
    withTenant(tenantId, async (tx) => {
      // Retirado só com dinheiro registrado. A trava mora aqui, e não no botão,
      // porque a tela não é o único caminho: as tools da IA também chamam por
      // aqui. Marcar como retirado é o que encerra a festa — depois disso a
      // cobrança fica muito mais difícil de lembrar.
      if (status === "PICKED_UP") {
        const pago = await tx.payment.aggregate({ where: { bookingId: id }, _sum: { amount: true } });
        if (Number(pago._sum.amount ?? 0) <= 0) {
          throw new BookingStateError(
            "Registre o pagamento antes de marcar como retirado."
          );
        }
      }
      const b = await tx.booking.update({ where: { id }, data: { status } });
      if (status === "PICKED_UP" || status === "CANCELED" || status === "FINISHED") {
        await cancelBookingReminders(tx, id);
      }
      await syncToyStatus(tx, id, status);
      return b;
    }),

  /**
   * Exclusão definitiva restrita a reservas canceladas e sem movimentação
   * financeira. Itens e lembretes pertencem à reserva e saem por cascata;
   * cliente, conversa, tags, notas e brinquedos permanecem intactos.
   */
  removeCanceled: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const [existing] = await tx.$queryRaw<Array<{ id: string; status: BookingStatusLike }>>`
        SELECT "id", "status"
        FROM "Booking"
        WHERE "id" = ${id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (!existing) throw new BookingStateError("Reserva não encontrada");
      if (existing.status !== "CANCELED") {
        throw new BookingStateError("Cancele a reserva antes de excluí-la definitivamente");
      }

      const [payments, expenses] = await Promise.all([
        tx.payment.count({ where: { bookingId: id } }),
        tx.expense.count({ where: { bookingId: id } }),
      ]);
      if (payments > 0 || expenses > 0) {
        throw new BookingStateError(
          "Esta reserva possui movimentação financeira e deve permanecer cancelada para preservar o histórico"
        );
      }

      await tx.booking.delete({ where: { id } });
      return { id };
    }),
};

type BookingStatusLike =
  | "LEAD" | "QUOTE_SENT" | "WAITING_DEPOSIT" | "CONFIRMED"
  | "IN_DELIVERY" | "MOUNTED" | "PICKED_UP" | "FINISHED" | "CANCELED";
