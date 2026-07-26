import { withTenant, type Tx } from "../db/withTenant";
import type { BookingInput, BookingUpdateInput, AgentBookingInput } from "../schemas";
import { createBookingReminders, cancelBookingReminders } from "./reminder-service";
import { pushNotification } from "./notification-service";
import { APP_TZ, parseLocalDateTime } from "../time";
import { quoteWithMinimum } from "../calculations";
import { customerPhoneKey, toWhatsAppPhone } from "../phone";
import { markConversationScheduled } from "./conversation-service";

const SP_DATETIME = new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" });

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
        const term = wanted.trim().toLowerCase();
        const matches = available.filter((t) => t.name.toLowerCase().includes(term));
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
      const b = await tx.booking.update({ where: { id }, data: { status } });
      if (status === "PICKED_UP" || status === "CANCELED" || status === "FINISHED") {
        await cancelBookingReminders(tx, id);
      }
      await syncToyStatus(tx, id, status);
      return b;
    }),
};

type BookingStatusLike =
  | "LEAD" | "QUOTE_SENT" | "WAITING_DEPOSIT" | "CONFIRMED"
  | "IN_DELIVERY" | "MOUNTED" | "PICKED_UP" | "FINISHED" | "CANCELED";
