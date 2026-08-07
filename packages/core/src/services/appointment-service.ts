import {
  bufferedWindow,
  serviceBufferOf as bufferOf,
  windowsOverlap,
  NO_BUFFER,
  type ServiceBuffer,
} from "../availability";
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
const BLOCKING = new Set<string>(BLOCKING_STATUSES);
const AGENT_MUTABLE_STATUSES = new Set(["REQUESTED", "CONFIRMED"]);

const UNASSIGNED_CONFLICT_MESSAGE = "Já existe um atendimento sem profissional nesse horário";

export class AppointmentConflictError extends Error {
  conflicts: string[];
  constructor(conflicts: string[], message = "Profissional já ocupado nesse intervalo") {
    super(message);
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

/**
 * Trava a "cadeira sem dono": agendamento sem profissional não tem id pra
 * serializar, então o tenant inteiro vira a chave do lock.
 */
async function lockUnassigned(tx: Tx, tenantId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment-unassigned:${tenantId}`}))`;
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

/**
 * Maior folga configurada no catálogo. Serve só para alargar a busca inicial o
 * bastante pra nenhum candidato escapar do filtro SQL — a sobreposição de
 * verdade é conferida depois, agendamento por agendamento.
 */
async function catalogSlack(tx: Tx) {
  const { _max } = await tx.service.aggregate({
    _max: { bufferBeforeMinutes: true, bufferAfterMinutes: true },
  });
  return Math.max(_max.bufferBeforeMinutes ?? 0, _max.bufferAfterMinutes ?? 0);
}

/**
 * A folga não fica gravada na linha do agendamento: é lida do catálogo na hora.
 * Evita uma migration e mantém a regra num lugar só — mudou a folga do serviço,
 * muda o espaçamento exigido daqui pra frente.
 */
const OCCUPANCY_SELECT = {
  professionalId: true,
  startAt: true,
  endAt: true,
  services: {
    select: { service: { select: { bufferBeforeMinutes: true, bufferAfterMinutes: true } } },
  },
} as const;

interface OccupancyRow {
  professionalId: string | null;
  startAt: Date;
  endAt: Date;
  services: { service: { bufferBeforeMinutes: number; bufferAfterMinutes: number } }[];
}

/** O atendimento existente esticado pela folga dos próprios serviços. */
function occupiedWindow(row: OccupancyRow) {
  return bufferedWindow(row.startAt, row.endAt, bufferOf(row.services.map((item) => item.service)));
}

/**
 * Agendamentos que realmente colidem com [startAt, endAt] depois de aplicar a
 * folga dos dois lados. `professionalIds === null` procura na fila sem
 * profissional atribuído.
 */
async function collidingAppointments(
  tx: Tx,
  professionalIds: string[] | null,
  startAt: Date,
  endAt: Date,
  excludeAppointmentId: string | undefined,
  buffer: ServiceBuffer
): Promise<OccupancyRow[]> {
  const slack = await catalogSlack(tx);
  const wanted = bufferedWindow(startAt, endAt, buffer);
  const rows = await tx.appointment.findMany({
    where: {
      professionalId: professionalIds ? { in: professionalIds } : null,
      status: { in: [...BLOCKING_STATUSES] },
      startAt: { lt: new Date(wanted.to + slack * 60_000) },
      endAt: { gt: new Date(wanted.from - slack * 60_000) },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: OCCUPANCY_SELECT,
  });
  return rows.filter((row) => windowsOverlap(occupiedWindow(row), wanted));
}

async function findConflicts(
  tx: Tx,
  professionalIds: string[],
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string,
  buffer: ServiceBuffer = NO_BUFFER
): Promise<string[]> {
  if (professionalIds.length === 0) return [];
  const rows = await collidingAppointments(tx, professionalIds, startAt, endAt, excludeAppointmentId, buffer);
  return [...new Set(rows.map((row) => row.professionalId).filter(Boolean) as string[])];
}

/**
 * Agendamento SEM profissional também ocupa a casa.
 *
 * Antes, `professionalId` nulo saía da checagem inteira — e "Sem profissional" é
 * a opção padrão do formulário, então uma barbearia de uma cadeira só marcava
 * dois clientes no mesmo horário sem nenhum aviso.
 */
async function hasUnassignedConflict(
  tx: Tx,
  startAt: Date,
  endAt: Date,
  excludeAppointmentId?: string,
  buffer: ServiceBuffer = NO_BUFFER
): Promise<boolean> {
  const rows = await collidingAppointments(tx, null, startAt, endAt, excludeAppointmentId, buffer);
  return rows.length > 0;
}

/**
 * Reserva o intervalo: trava o recurso certo (profissional ou a fila sem
 * profissional) e recusa se já houver alguém ali. Um único lugar para as duas
 * formas de ocupar a agenda — antes só a primeira era conferida.
 */
async function assertSlotFree(
  tx: Tx,
  tenantId: string,
  professionalId: string | null,
  startAt: Date,
  endAt: Date,
  buffer: ServiceBuffer,
  excludeAppointmentId?: string
) {
  if (professionalId) {
    await lockProfessionals(tx, [professionalId]);
    const conflicts = await findConflicts(tx, [professionalId], startAt, endAt, excludeAppointmentId, buffer);
    if (conflicts.length) throw new AppointmentConflictError(conflicts);
    return;
  }
  await lockUnassigned(tx, tenantId);
  if (await hasUnassignedConflict(tx, startAt, endAt, excludeAppointmentId, buffer)) {
    throw new AppointmentConflictError([], UNASSIGNED_CONFLICT_MESSAGE);
  }
}

/**
 * Antecedência mínima configurada pelo tenant. Vale para o agente: o painel
 * pode registrar um atendimento que já aconteceu (encaixe, walk-in), a IA não.
 */
async function assertLeadTime(tx: Tx, tenantId: string, startAt: Date, now: Date) {
  const settings = await tx.tenantSettings.findUnique({
    where: { tenantId },
    select: { minAppointmentLeadMinutes: true },
  });
  const leadMinutes = settings?.minAppointmentLeadMinutes ?? 0;
  const earliest = new Date(now.getTime() + leadMinutes * 60_000);
  if (startAt.getTime() >= earliest.getTime()) return;
  if (startAt.getTime() < now.getTime()) {
    throw new AppointmentAgentError("Esse horário já passou — escolha uma data ou horário futuro.");
  }
  throw new AppointmentAgentError(
    `Preciso de pelo menos ${leadMinutes} minutos de antecedência para marcar. Escolha um horário um pouco mais pra frente.`
  );
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

async function resolveProfessional(
  tx: Tx,
  serviceIds: string[],
  name?: string | null,
  startAt?: Date,
  endAt?: Date,
  buffer: ServiceBuffer = NO_BUFFER
) {
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
    const conflicts = await findConflicts(tx, [professional.id], startAt, endAt, undefined, buffer);
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
      // Não vai pro banco: só alimenta o cálculo de folga na checagem de conflito.
      bufferBeforeMinutes: service.bufferBeforeMinutes,
      bufferAfterMinutes: service.bufferAfterMinutes,
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

  checkAvailability: (
    tenantId: string,
    professionalIds: string[],
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
    buffer: ServiceBuffer = NO_BUFFER
  ) => withTenant(tenantId, (tx) => findConflicts(tx, professionalIds, startAt, endAt, excludeAppointmentId, buffer)),

  /**
   * Janelas ocupadas do período, já esticadas pela folga de cada atendimento.
   *
   * Existe pra grade de horários ser montada com UMA leitura: a rota de
   * disponibilidade abria uma transação por slot — vinte idas ao banco para
   * responder "que horas tem amanhã?".
   */
  occupiedWindows: (tenantId: string, from: Date, to: Date) =>
    withTenant(tenantId, async (tx) => {
      const slack = await catalogSlack(tx);
      const rows = await tx.appointment.findMany({
        where: {
          status: { in: [...BLOCKING_STATUSES] },
          startAt: { lt: new Date(to.getTime() + slack * 60_000) },
          endAt: { gt: new Date(from.getTime() - slack * 60_000) },
        },
        select: OCCUPANCY_SELECT,
      });
      return rows.map((row) => {
        const window = occupiedWindow(row);
        return {
          professionalId: row.professionalId,
          startAt: new Date(window.from),
          endAt: new Date(window.to),
        };
      });
    }),

  create: (tenantId: string, input: AppointmentInput) =>
    withTenant(tenantId, async (tx) => {
      const professionalId = input.professionalId ?? null;
      // Snapshots antes da trava: além de validar os serviços cedo, é deles que
      // sai a folga usada na checagem de conflito.
      const snapshots = await snapshotsFor(tx, input.serviceIds, professionalId);
      await assertSlotFree(tx, tenantId, professionalId, input.startAt, input.endAt, bufferOf(snapshots));
      const appointment = await tx.appointment.create({
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
      // Lembretes valem para o agendamento do painel também: antes só o caminho
      // da IA os criava, então tudo que a equipe marcava entrava mudo.
      await createAppointmentReminders(tx, tenantId, appointment.id, input.startAt, input.endAt);
      return appointment;
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
      const snapshots = await snapshotsFor(tx, input.serviceIds, professionalId);
      await assertSlotFree(tx, tenantId, professionalId, input.startAt, input.endAt, bufferOf(snapshots), id);

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

  /**
   * Troca o status conferindo o que a troca implica.
   *
   * COMPLETED, NO_SHOW e CANCELED soltam o horário (não estão em
   * BLOCKING_STATUSES). Voltar de um deles para um status que ocupa a agenda é
   * uma RESERVA NOVA e precisa passar pela mesma checagem de conflito da
   * criação — antes era um `update` cru, então cancelar, ver o horário ser
   * vendido pra outra pessoa e reabrir colocava dois clientes na mesma cadeira.
   */
  setStatus: (tenantId: string, id: string, status: AppointmentStatusLike) =>
    withTenant(tenantId, async (tx) => {
      if (!(await lockAppointment(tx, tenantId, id))) throw new AppointmentStateError("Agendamento não encontrado");
      const existing = await tx.appointment.findFirst({
        where: { id },
        include: {
          services: { select: { service: { select: { bufferBeforeMinutes: true, bufferAfterMinutes: true } } } },
        },
      });
      if (!existing) throw new AppointmentStateError("Agendamento não encontrado");
      if (existing.status === status) return existing;

      const reopening = !BLOCKING.has(existing.status) && BLOCKING.has(status);
      if (reopening) {
        if (existing.endAt.getTime() <= Date.now()) {
          throw new AppointmentStateError("Esse horário já passou — crie um novo agendamento em vez de reabrir este");
        }
        const buffer = bufferOf(existing.services.map((item) => item.service));
        await assertSlotFree(tx, tenantId, existing.professionalId, existing.startAt, existing.endAt, buffer, id);
        // Os lembretes foram cancelados quando o atendimento saiu do ar; reabrir
        // precisa recriá-los, senão o cliente volta pra agenda sem aviso nenhum.
        await createAppointmentReminders(tx, tenantId, id, existing.startAt, existing.endAt);
      }

      const appointment = await tx.appointment.update({ where: { id }, data: { status } });
      if (!BLOCKING.has(status)) await cancelAppointmentReminders(tx, id);
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

  createFromAgent: (tenantId: string, input: AgentAppointmentInput, now = new Date()) =>
    withTenant(tenantId, async (tx) => {
      const startAt = parseLocalDateTime(`${input.date}T${input.startTime}`);
      const chosenServices = await resolveServices(tx, input.serviceNames);
      const buffer = bufferOf(chosenServices);
      const roughEndAt = new Date(startAt.getTime() + chosenServices.reduce((sum, item) => sum + item.durationMinutes, 0) * 60_000);
      const professional = await resolveProfessional(
        tx,
        chosenServices.map((item) => item.id),
        input.professionalName,
        startAt,
        roughEndAt,
        buffer
      );
      const snapshots = await snapshotsFor(tx, chosenServices.map((item) => item.id), professional?.id ?? null);
      const endAt = new Date(startAt.getTime() + totalDurationMs(snapshots));

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

      // Reserva de verdade: só a partir daqui. A checagem fica DEPOIS do replay
      // porque, antes, uma repetição do n8n batia no agendamento que ela mesma
      // criou e voltava "horário ocupado" em vez de "já estava confirmado".
      await assertLeadTime(tx, tenantId, startAt, now);
      await assertSlotFree(tx, tenantId, professional?.id ?? null, startAt, endAt, buffer);

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
      const serviceIds = existing.services.map((item) => item.serviceId);
      const professional = await resolveProfessional(tx, serviceIds, input.professionalName ?? existing.professional?.name ?? undefined);
      const snapshots = await snapshotsFor(tx, serviceIds, professional?.id ?? null);
      const buffer = bufferOf(snapshots);
      const endAt = new Date(startAt.getTime() + totalDurationMs(snapshots));

      const unchanged =
        existing.startAt.getTime() === startAt.getTime() &&
        existing.endAt.getTime() === endAt.getTime() &&
        existing.professionalId === (professional?.id ?? null);
      if (!unchanged) {
        // Só valida horário/conflito quando algo muda de fato: repetir a mesma
        // chamada continua sendo idempotente, mesmo perto do horário.
        await assertLeadTime(tx, tenantId, startAt, now);
        await assertSlotFree(tx, tenantId, professional?.id ?? null, startAt, endAt, buffer, existing.id);
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
