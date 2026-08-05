import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import {
  matchesCatalogName,
  parseBusinessHours,
  parseLocalDateTime,
  schemas,
  services,
  spClock,
  ZodError,
} from "@barbearia-ai/core";

function hhmmToMin(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function minToHhmm(value: number): string {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function byName<T extends { name: string }>(items: T[], name?: string) {
  return name?.trim() ? items.filter((item) => matchesCatalogName(item.name, name)) : items;
}

/**
 * Ferramenta pro agente de IA: consulta horários livres por serviço e
 * profissional. Só leitura; nunca cria nem altera agendamento.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || req.headers.get("x-barbearia-ai-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  let input;
  try {
    input = schemas.agentAvailabilityInput.parse(await req.json());
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "dados inválidos", details: error.issues }, { status: 400 });
    throw error;
  }

  const [settings, catalog, professionals] = await Promise.all([
    services.tenantService.getSettings(tenant.id),
    services.serviceCatalogService.active(tenant.id),
    services.professionalService.list(tenant.id),
  ]);

  const activeServices = byName(catalog, input.serviceName);
  const activeProfessionals = byName(
    professionals.filter((professional) => professional.status === "ACTIVE"),
    input.professionalName
  ).filter((professional) => {
    if (activeServices.length === 0) return true;
    const links = professional.services.filter((item) => item.active);
    if (links.length === 0) return true;
    return activeServices.every((service) => links.some((item) => item.serviceId === service.id));
  });

  const date = spClock(input.date).dayKey;
  const slotMinutes = settings?.defaultSlotMinutes ?? 30;
  const durationMinutes =
    activeServices.length > 0
      ? activeServices.reduce((sum, service) => sum + service.durationMinutes, 0)
      : slotMinutes;

  if (input.startTime && input.endTime) {
    const startAt = parseLocalDateTime(`${date}T${input.startTime}`);
    const endAt = parseLocalDateTime(`${date}T${input.endTime}`);
    const conflicts = activeProfessionals.length
      ? await services.appointmentService.checkAvailability(
          tenant.id,
          activeProfessionals.map((professional) => professional.id),
          startAt,
          endAt
        )
      : [];
    const conflictSet = new Set(conflicts);

    return NextResponse.json({
      ok: true,
      date,
      scope: "interval",
      startTime: input.startTime,
      endTime: input.endTime,
      services: activeServices.map((service) => ({
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: Number(service.defaultPrice),
      })),
      professionals: activeProfessionals.map((professional) => ({
        id: professional.id,
        name: professional.name,
        available: !conflictSet.has(professional.id),
      })),
    });
  }

  const hours = parseBusinessHours(settings?.businessHours);
  const opensAt = hhmmToMin(hours.serviceStart);
  const closesAt = hhmmToMin(hours.serviceEnd);
  const slots = [];
  for (let start = opensAt; start + durationMinutes <= closesAt; start += slotMinutes) {
    const startTime = minToHhmm(start);
    const endTime = minToHhmm(start + durationMinutes);
    const startAt = parseLocalDateTime(`${date}T${startTime}`);
    const endAt = parseLocalDateTime(`${date}T${endTime}`);
    const conflicts = activeProfessionals.length
      ? await services.appointmentService.checkAvailability(
          tenant.id,
          activeProfessionals.map((professional) => professional.id),
          startAt,
          endAt
        )
      : [];
    const availableProfessionals = activeProfessionals
      .filter((professional) => !conflicts.includes(professional.id))
      .map((professional) => ({ id: professional.id, name: professional.name }));
    if (availableProfessionals.length > 0) slots.push({ startTime, endTime, professionals: availableProfessionals });
  }

  return NextResponse.json({
    ok: true,
    date,
    scope: "slots",
    slotMinutes,
    durationMinutes,
    businessHours: hours,
    services: activeServices.map((service) => ({
      name: service.name,
      durationMinutes: service.durationMinutes,
      price: Number(service.defaultPrice),
    })),
    professionals: activeProfessionals.map((professional) => ({ id: professional.id, name: professional.name })),
    slots,
  });
}
