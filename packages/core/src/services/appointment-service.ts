import { withTenant, type Tx } from "../db/withTenant";
import type {
  AppointmentInput,
  AppointmentUpdateInput,
  AgentAppointmentCancelInput,
  AgentAppointmentInput,
  AgentAppointmentRescheduleInput,
} from "../schemas";
import { createAppointmentReminders, cancelAppointmentReminders } from "./reminder-service";
import { pushNotification } from "./notification-service";
import { APP_TZ, parseLocalDateTime } from "../time";
import { customerPhoneKey, toWhatsAppPhone } from "../phone";
import { normalizeMatchTerm } from "../text";
import { markConversationScheduled } from "./conversation-service";

const SP_DATETIME = new Intl.DateTimeFormat("pt-BR", { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" });

const BLOCKING_STATUSES = ["REQUESTED", "CONFIRMED", "ARRIVED", "IN_SERVICE"] as const;
const AGENT_MUTABLE_STATUSES = new Set(["REQUESTED", "CONFIRMED"]);

export class AppointmentConflictError extends Error {
  conflicts: string[];
  constructor(conflicts: string[]) {
    super("Profissional já ocupado nesse intervalo");
    this.name = "AppointmentConflictError";
    this.conflicts = conflicts;
  }
}

export class AppointmentAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentAgentError";
  }
}

export class AppointmentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentStateError";
  }
}

export class AppointmentPaymentError extends AppointmentStateError {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentPaymentError";
  }
}

async function lockProfessionals(tx: Tx, professionalIds: string[]) {
  for (const professionalId of [...new Set(professionalIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${professionalId}, 0))`;
  }
}

async function lockCustomerPhone(tx: Tx, tenantId: string, phone: string) {
  const key = customerPhoneKey(phone);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer:${tenantId}:${key}`}))`;
}

async function lockAppointment(tx: Tx, tenantId: string, appointmentId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Appointment"
    WHERE "id" = ${appointmentId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  return rows.length > 0;
}

function matchesCatalogName(catalogName: string, said: string) {
  const catalog = normalizeMatchTerm(catalogName);
  const term = normalizeMatchTerm(said);
  return Boolean(term && (catalog.includes(term) || term.includes(catalog)));
}

async function findConflicts(
  tx: Tx,
  professionalIds: string[],
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string
): Promise<string[]> {
  if (professionalIds.length === 0) return [];
  const rows = await tx.appointment.findMany({
    where: {
      professionalId: { in: professionalIds },
      status: { in: [...BLOCKING_STATUSES] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { professionalId: true },
  });
  return [...new Set(rows.map((row) => row.professionalId).filter(Boolean) as string[])];
}

function assertAgentMutable(status: string) {
  if (!AGENT_MUTABLE_STATUSES.has(status)) {
    throw new AppointmentStateError("Este agendamento não pode mais ser alterado automaticamente.");
  }
}

async function appointmentForAgent(tx: Tx, appointmentId: string, phone: string) {
  const appointment = await tx.appointment.findFirst({
    where: { id: appointmentId },
    include: {
      customer: true,
      professional: true,
      services: { include: { service: true } },
      payments: true,
    },
  });
  if (!appointment || customerPhoneKey(appointment.customer.phone) !== customerPhoneKey(phone)) {
    throw new AppointmentAgentError("Agendamento não encontrado para este telefone.");
  }
  return appointment;
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

async function resolveServices(tx: Tx, names: string[]) {
  const catalog = await tx.service.findMany({ where: { status: "ACTIVE" } });
  const chosen: typeof catalog = [];
  for (const wanted of names) {
    const matches = catalog.filter((service) => matchesCatalogName(service.name, wanted));
    if (matches.length === 0) throw new AppointmentAgentError(`Não encontrei o serviço "${wanted}" no catálogo.`);
    if (matches.length > 1) {
      throw new AppointmentAgentError(`"${wanted}" é ambíguo (${matches.map((service) => service.name).join(", ")}). Qual exatamente?`);
    }
    const service = matches[0]!;
    if (!chosen.some((item) => item.id === service.id)) chosen.push(service);
  }
  return chosen;
}

async function resolveProfessional(tx: Tx, serviceIds: string[], name?: string | null, startAt?: Date, endAt?: Date) {
  const professionals = await tx.professional.findMany({
    where: { status: "ACTIVE" },
    include: { services: true },
    orderBy: { name: "asc" },
  });
  if (professionals.length === 0) return null;

  const canDoAll = (professional: (typeof professionals)[number]) => {
    const active = professional.services.filter((item) => item.active);
    if (active.length === 0) return true;
    return serviceIds.every((serviceId) => active.some((item) => item.serviceId === serviceId));
  };

  if (name?.trim()) {
    const matches = professionals.filter((professional) => matchesCatalogName(professional.name, name));
    if (matches.length === 0) throw new AppointmentAgentError(`Não encontrei o profissional "${name}".`);
    if (matches.length > 1) {
      throw new AppointmentAgentError(`"${name}" é ambíguo (${matches.map((professional) => professional.name).join(", ")}). Qual exatamente?`);
    }
    const professional = matches[0]!;
    if (!canDoAll(professional)) throw new AppointmentAgentError(`${professional.name} não executa todos esses serviços.`);
    return professional;
  }

  for (const professional of professionals.filter(canDoAll)) {
    if (!startAt || !endAt) return professional;
    const conflicts = await findConflicts(tx, [professional.id], startAt, endAt);
    if (conflicts.length === 0) return professional;
  }
  throw new AppointmentConflictError(professionals.map((professional) => professional.id));
}

async function snapshotsFor(
  tx: Tx,
  serviceIds: string[],
  professionalId: string | null
) {
  const services = await tx.service.findMany({ where: { id: { in: serviceIds }, status: { not: "ARCHIVED" } } });
  if (services.length !== serviceIds.length) throw new AppointmentStateError("Serviço não encontrado.");
  const assignments = professionalId
    ? await tx.professionalService.findMany({ where: { professionalId, serviceId: { in: serviceIds }, active: true } })
    : [];
  return serviceIds.map((serviceId) => {
    const service = services.find((item) => item.id === serviceId)!;
    const assignment = assignments.find((item) => item.serviceId === serviceId);
    return {
      serviceId,
      professionalId,
      serviceNameSnapshot: service.name,
      durationMinutes: assignment?.durationMinutes ?? service.durationMinutes,
      price: Number(assignment?.price ?? service.defaultPrice),
      commissionType: assignment?.commissionType ?? "NONE",
      commissionValue: assignment?.commissionValue ? Number(assignment.commissionValue) : null,
    };
  });
}

function totalDurationMs(snapshots: Awaited<ReturnType<typeof snapshotsFor>>) {
  return snapshots.reduce((sum, item) => sum + item.durationMinutes, 0) * 60_000;
}

function agentAppointmentNote(
  input: AgentAppointmentInput,
  result: { services: string[]; professionalName: string | null; total: number }
) {
  return (
    `Agendamento fechado: ${result.services.join(", ")} — ${input.date} às ${input.startTime}` +
    (result.professionalName ? ` com ${result.professionalName}` : "") +
    `. Total R$ ${result.total}.`
  );
}

export const appointmentService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.appointment.findMany({
        orderBy: { startAt: "asc" },
        include: {
          customer: true,
          professional: true,
          services: { include: { service: true } },
        },
      })
    ),

  upcomingForPhone: (tenantId: string, phone: string, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const phoneKey = customerPhoneKey(phone);
      const customers = await tx.customer.findMany({ select: { id: true, phone: true } });
      const customerIds = customers
        .filter((customer) => customerPhoneKey(customer.phone) === phoneKey)
        .map((customer) => customer.id);
      if (!customerIds.length) return [];
      return tx.appointment.findMany({
        where: {
          customerId: { in: customerIds },
          status: { in: [...BLOCKING_STATUSES] },
          endAt: { gte: now },
        },
        orderBy: { startAt: "asc" },
        include: {
          professional: true,
          services: { include: { service: true } },
        },
      });
    }),

  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) =>
      tx.appointment.findFirst({
        where: { id },
        include: {
          customer: true,
          professional: true,
          services: { include: { service: true } },
          payments: true,
          expenses: true,
        },
      })
    ),

  checkAvailability: (tenantId: string, professionalIds: string[], startAt: Date, endAt: Date, excludeAppointmentId?: string) =>
    withTenant(tenantId, (tx) => findConflicts(tx, professionalIds, startAt, endAt, excludeAppointmentId)),

  create: (tenantId: string, input: AppointmentInput) =>
    withTenant(tenantId, async (tx) => {
      const professionalId = input.professionalId ?? null;
      if (professionalId) {
        await lockProfessionals(tx, [professionalId]);
        const conflicts = await findConflicts(tx, [professionalId], input.startAt, input.endAt);
        if (conflicts.length) throw new AppointmentConflictError(conflicts);
      }
      const snapshots = await snapshotsFor(tx, input.serviceIds, professionalId);
      return tx.appointment.create({
        data: {
          tenantId,
          customerId: input.customerId,
          professionalId,
          resourceId: input.resourceId ?? null,
          startAt: input.startAt,
          endAt: input.endAt,
          total: input.total,
          leadSource: input.leadSource,
          notes: input.notes,
          status: "CONFIRMED",
          services: {
            create: snapshots.map((item) => ({
              tenantId,
              serviceId: item.serviceId,
              professionalId: item.professionalId,
              serviceNameSnapshot: item.serviceNameSnapshot,
              durationMinutes: item.durationMinutes,
              price: item.price,
              commissionType: item.commissionType,
              commissionValue: item.commissionValue,
            })),
          },
        },
        include: { services: true },
      });
    }),

  update: (tenantId: string, id: string, input: AppointmentUpdateInput) =>
    withTenant(tenantId, async (tx) => {
      if (!(await lockAppointment(tx, tenantId, id))) throw new AppointmentStateError("Agendamento não encontrado");
      const existing = await tx.appointment.findFirst({ where: { id } });
      if (!existing) throw new AppointmentStateError("Agendamento não encontrado");
      if (existing.status === "CANCELED" || existing.status === "COMPLETED") {
        throw new AppointmentStateError("Agendamento encerrado não pode ser editado");
      }

      const professionalId = input.professionalId ?? null;
      if (professionalId) {
        await lockProfessionals(tx, [professionalId]);
        const conflicts = await findConflicts(tx, [professionalId], input.startAt, input.endAt, id);
        if (conflicts.length) throw new AppointmentConflictError(conflicts);
      }

      const snapshots = await snapshotsFor(tx, input.serviceIds, professionalId);
      await tx.appointmentService.deleteMany({ where: { appointmentId: id } });
      const appointment = await tx.appointment.update({
        where: { id },
        data: {
          professionalId,
          resourceId: input.resourceId ?? null,
          startAt: input.startAt,
          endAt: input.endAt,
          total: input.total,
          notes: input.notes,
          services: {
            create: snapshots.map((item) => ({
              tenantId,
              serviceId: item.serviceId,
              professionalId: item.professionalId,
              serviceNameSnapshot: item.serviceNameSnapshot,
              durationMinutes: item.durationMinutes,
              price: item.price,
              commissionType: item.commissionType,
              commissionValue: item.commissionValue,
            })),
          },
        },
        include: { services: true },
      });

      const paid = Number((await tx.payment.aggregate({ where: { appointmentId: id }, _sum: { amount: true } }))._sum.amount ?? 0);
      if (paid > 0) {
        const paymentStatus = paid >= Number(appointment.total) && Number(appointment.total) > 0 ? "PAID" : "PARTIAL";
        if (paymentStatus !== appointment.paymentStatus) {
          await tx.appointment.update({ where: { id }, data: { paymentStatus } });
        }
      }

      const timeChanged = existing.startAt.getTime() !== input.startAt.getTime() || existing.endAt.getTime() !== input.endAt.getTime();
      if (timeChanged && ["REQUESTED", "CONFIRMED"].includes(existing.status)) {
        await cancelAppointmentReminders(tx, id);
        await createAppointmentReminders(tx, tenantId, id, input.startAt, input.endAt);
        await pushNotification(tx, tenantId, {
          type: "APPOINTMENT_RESCHEDULED",
          title: "Agendamento remarcado",
          body: `Novo horário: ${SP_DATETIME.format(input.startAt)}`,
          appointmentId: id,
        });
      }
      return appointment;
    }),

  setStatus: (tenantId: string, id: string, status: AppointmentStatusLike) =>
    withTenant(tenantId, async (tx) => {
      const appointment = await tx.appointment.update({ where: { id }, data: { status } });
      if (status === "CANCELED" || status === "COMPLETED" || status === "NO_SHOW") {
        await cancelAppointmentReminders(tx, id);
      }
      return appointment;
    }),

  removeCanceled: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const [existing] = await tx.$queryRaw<Array<{ id: string; status: AppointmentStatusLike }>>`
        SELECT "id", "status"
        FROM "Appointment"
        WHERE "id" = ${id} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      if (!existing) throw new AppointmentStateError("Agendamento não encontrado");
      if (existing.status !== "CANCELED") {
        throw new AppointmentStateError("Cancele o agendamento antes de excluí-lo definitivamente");
      }
      const [payments, expenses] = await Promise.all([
        tx.payment.count({ where: { appointmentId: id } }),
        tx.expense.count({ where: { appointmentId: id } }),
      ]);
      if (payments > 0 || expenses > 0) {
        throw new AppointmentStateError("Este agendamento possui movimentação financeira e deve permanecer cancelado para preservar o histórico");
      }
      await tx.appointment.delete({ where: { id } });
      return { id };
    }),

  createFromAgent: (tenantId: string, input: AgentAppointmentInput) =>
    withTenant(tenantId, async (tx) => {
      const startAt = parseLocalDateTime(`${input.date}T${input.startTime}`);
      const chosenServices = await resolveServices(tx, input.serviceNames);
      const roughEndAt = new Date(startAt.getTime() + chosenServices.reduce((sum, item) => sum + item.durationMinutes, 0) * 60_000);
      const professional = await resolveProfessional(tx, chosenServices.map((item) => item.id), input.professionalName, startAt, roughEndAt);
      const snapshots = await snapshotsFor(tx, chosenServices.map((item) => item.id), professional?.id ?? null);
      const endAt = new Date(startAt.getTime() + totalDurationMs(snapshots));

      if (professional) {
        await lockProfessionals(tx, [professional.id]);
        const conflicts = await findConflicts(tx, [professional.id], startAt, endAt);
        if (conflicts.length) throw new AppointmentConflictError(conflicts);
      }

      await lockCustomerPhone(tx, tenantId, input.phone);
      const phoneKey = customerPhoneKey(input.phone);
      const conversation = await tx.conversation.findUnique({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
        select: { customerId: true },
      });
      const matchingCustomers = (await tx.customer.findMany({
        include: { _count: { select: { appointments: true } } },
      }))
        .filter((customer) => customerPhoneKey(customer.phone) === phoneKey)
        .sort(
          (a, b) =>
            Number(b.id === conversation?.customerId) - Number(a.id === conversation?.customerId) ||
            b._count.appointments - a._count.appointments ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        );

      const serviceIds = snapshots.map((item) => item.serviceId).sort();
      const replayCandidates = await tx.appointment.findMany({
        where: {
          leadSource: "WHATSAPP",
          status: { in: ["REQUESTED", "CONFIRMED", "ARRIVED", "IN_SERVICE"] },
          startAt,
          endAt,
          professionalId: professional?.id ?? null,
          customerId: { in: matchingCustomers.map((customer) => customer.id) },
        },
        include: { customer: true, services: true, professional: true },
      });
      const replay = replayCandidates.find((appointment) => {
        const current = appointment.services.map((item) => item.serviceId).sort();
        return current.length === serviceIds.length && current.every((id, index) => id === serviceIds[index]);
      });
      if (replay) {
        const result = {
          appointmentId: replay.id,
          total: Number(replay.total),
          services: replay.services.map((item) => item.serviceNameSnapshot),
          startISO: startAt.toISOString(),
          endISO: endAt.toISOString(),
          customerName: replay.customer.name,
          professionalName: replay.professional?.name ?? null,
          alreadyExists: true,
          replayed: true,
        };
        await markConversationScheduled(tx, tenantId, {
          phone: input.phone,
          customerId: replay.customerId,
          note: agentAppointmentNote(input, result),
          repairOnly: true,
        });
        const leadIds = await matchingOpenLeadIds(tx, input.phone, replay.createdAt);
        if (leadIds.length) await tx.lead.updateMany({ where: { id: { in: leadIds } }, data: { status: "WON", appointmentId: replay.id } });
        return result;
      }

      let customer = matchingCustomers[0] ?? null;
      if (!customer) {
        customer = await tx.customer.create({
          data: { tenantId, name: input.name, phone: toWhatsAppPhone(input.phone) },
          include: { _count: { select: { appointments: true } } },
        });
      }

      const total = snapshots.reduce((sum, item) => sum + item.price, 0);
      const appointment = await tx.appointment.create({
        data: {
          tenantId,
          customerId: customer.id,
          professionalId: professional?.id ?? null,
          startAt,
          endAt,
          total,
          status: "CONFIRMED",
          leadSource: "WHATSAPP",
          notes: input.notes ? `[IA] ${input.notes}` : "[IA] Agendamento fechado pelo agente no WhatsApp",
          services: {
            create: snapshots.map((item) => ({
              tenantId,
              serviceId: item.serviceId,
              professionalId: item.professionalId,
              serviceNameSnapshot: item.serviceNameSnapshot,
              durationMinutes: item.durationMinutes,
              price: item.price,
              commissionType: item.commissionType,
              commissionValue: item.commissionValue,
            })),
          },
        },
      });
      await createAppointmentReminders(tx, tenantId, appointment.id, startAt, endAt);
      await pushNotification(tx, tenantId, {
        type: "APPOINTMENT_CREATED",
        title: "Agendamento fechado pela IA",
        body: `${customer.name} · ${SP_DATETIME.format(startAt)} · ${snapshots.map((item) => item.serviceNameSnapshot).join(", ")}`,
        appointmentId: appointment.id,
      });

      const result = {
        appointmentId: appointment.id,
        total,
        services: snapshots.map((item) => item.serviceNameSnapshot),
        startISO: startAt.toISOString(),
        endISO: endAt.toISOString(),
        customerName: customer.name,
        professionalName: professional?.name ?? null,
        alreadyExists: false,
        replayed: false,
      };
      await markConversationScheduled(tx, tenantId, {
        phone: input.phone,
        customerId: customer.id,
        note: agentAppointmentNote(input, result),
      });
      const leadIds = await matchingOpenLeadIds(tx, input.phone);
      if (leadIds.length) await tx.lead.updateMany({ where: { id: { in: leadIds } }, data: { status: "WON", appointmentId: appointment.id } });
      return result;
    }),

  rescheduleFromAgent: (tenantId: string, input: AgentAppointmentRescheduleInput, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      if (!(await lockAppointment(tx, tenantId, input.appointmentId))) throw new AppointmentAgentError("Agendamento não encontrado para este telefone.");
      const existing = await appointmentForAgent(tx, input.appointmentId, input.phone);
      assertAgentMutable(existing.status);

      const startAt = parseLocalDateTime(`${input.date}T${input.startTime}`);
      if (startAt.getTime() < now.getTime()) throw new AppointmentAgentError("Esse horário já passou — escolha uma data ou horário futuro.");
      const serviceIds = existing.services.map((item) => item.serviceId);
      const professional = await resolveProfessional(tx, serviceIds, input.professionalName ?? existing.professional?.name ?? undefined);
      const snapshots = await snapshotsFor(tx, serviceIds, professional?.id ?? null);
      const endAt = new Date(startAt.getTime() + totalDurationMs(snapshots));

      if (professional) {
        await lockProfessionals(tx, [professional.id]);
        const conflicts = await findConflicts(tx, [professional.id], startAt, endAt, existing.id);
        if (conflicts.length) throw new AppointmentConflictError(conflicts);
      }

      const unchanged =
        existing.startAt.getTime() === startAt.getTime() &&
        existing.endAt.getTime() === endAt.getTime() &&
        existing.professionalId === (professional?.id ?? null);
      if (!unchanged) {
        await tx.appointment.update({
          where: { id: existing.id },
          data: { startAt, endAt, professionalId: professional?.id ?? null },
        });
        await cancelAppointmentReminders(tx, existing.id);
        await createAppointmentReminders(tx, tenantId, existing.id, startAt, endAt);
        await pushNotification(tx, tenantId, {
          type: "APPOINTMENT_RESCHEDULED",
          title: "Agendamento remarcado",
          body: `Novo horário: ${SP_DATETIME.format(startAt)}`,
          appointmentId: existing.id,
        });
      }

      return {
        appointmentId: existing.id,
        date: input.date,
        startTime: input.startTime,
        startISO: startAt.toISOString(),
        endISO: endAt.toISOString(),
        services: existing.services.map((item) => item.serviceNameSnapshot),
        professionalName: professional?.name ?? null,
        calendarEventId: existing.googleCalendarEventId,
        alreadyUpdated: unchanged,
      };
    }),

  cancelFromAgent: (tenantId: string, input: AgentAppointmentCancelInput) =>
    withTenant(tenantId, async (tx) => {
      if (!input.confirmed) throw new AppointmentAgentError("Confirmação de cancelamento ausente.");
      if (!(await lockAppointment(tx, tenantId, input.appointmentId))) throw new AppointmentAgentError("Agendamento não encontrado para este telefone.");
      const existing = await appointmentForAgent(tx, input.appointmentId, input.phone);
      if (existing.status === "CANCELED") {
        return { appointmentId: existing.id, canceled: true, alreadyCanceled: true, calendarEventId: existing.googleCalendarEventId };
      }
      assertAgentMutable(existing.status);

      const paid = existing.payments.length;
      if (paid > 0 || existing.paymentStatus === "PARTIAL" || existing.paymentStatus === "PAID") {
        throw new AppointmentPaymentError("Esse agendamento já tem pagamento registrado — a equipe precisa tratar o cancelamento.");
      }

      await tx.appointment.update({ where: { id: existing.id }, data: { status: "CANCELED" } });
      await cancelAppointmentReminders(tx, existing.id);
      await pushNotification(tx, tenantId, {
        type: "APPOINTMENT_CANCEL_REQUESTED",
        title: "Agendamento cancelado pela IA",
        body: `${existing.customer.name} · ${SP_DATETIME.format(existing.startAt)} · ${existing.services.map((item) => item.serviceNameSnapshot).join(", ")}`,
        appointmentId: existing.id,
      });

      return { appointmentId: existing.id, canceled: true, alreadyCanceled: false, calendarEventId: existing.googleCalendarEventId };
    }),
};

type AppointmentStatusLike =
  | "REQUESTED"
  | "CONFIRMED"
  | "ARRIVED"
  | "IN_SERVICE"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELED";
