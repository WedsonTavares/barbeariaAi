import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import {
  bufferedWindow,
  matchesCatalogName,
  parseBusinessHours,
  parseLocalDateTime,
  schemas,
  serviceBufferOf,
  services,
  spClock,
  windowsOverlap,
  ZodError,
  type BusyWindow,
} from "@barbearia-ai/core";

/** Chave da "cadeira sem dono" no mapa de ocupação (agendamento sem profissional). */
const SEM_PROFISSIONAL = "__sem_profissional__";

const DAY_MS = 86_400_000;

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
 *
 * A ocupação do dia é lida UMA vez e a grade é montada em memória. Antes cada
 * slot abria a sua própria transação — vinte idas ao banco para responder uma
 * pergunta só.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

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

  // Folga exigida pelos serviços pedidos — a mesma regra (e o mesmo código) que
  // o serviço de agendamento aplica ao gravar, senão a IA oferece um horário
  // que o backend depois recusa.
  const buffer = serviceBufferOf(activeServices);

  // Antecedência mínima do tenant. Sem isso a grade devolvia 08:00 para "hoje"
  // mesmo às 19h, e a IA oferecia um horário impossível.
  const now = new Date();
  const leadMinutes = settings?.minAppointmentLeadMinutes ?? 0;
  const earliest = now.getTime() + leadMinutes * 60_000;

  // Uma leitura só do dia inteiro; as janelas já vêm com a folga aplicada.
  const dayStart = input.date;
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const [busy, expediente] = await Promise.all([
    services.appointmentService.occupiedWindows(tenant.id, dayStart, dayEnd),
    // Expediente por profissional (com pausas, menos folgas). Quem não tem
    // expediente cadastrado não é restringido — ver schedule-service.
    services.scheduleService.workingWindows(tenant.id, dayStart, dayEnd),
  ]);
  const busyByResource = new Map<string, BusyWindow[]>();
  for (const window of busy) {
    const key = window.professionalId ?? SEM_PROFISSIONAL;
    const current = busyByResource.get(key) ?? [];
    current.push({ from: window.startAt.getTime(), to: window.endAt.getTime() });
    busyByResource.set(key, current);
  }

  /**
   * Sem nenhum profissional cadastrado, a casa é tratada como uma cadeira só —
   * é assim que o serviço de agendamento também enxerga (`professionalId` nulo
   * ocupa a agenda). Antes esta rota devolvia zero horários nesse cenário,
   * enquanto a ferramenta de agendar aceitava marcar.
   */
  const semProfissional = activeProfessionals.length === 0;
  const recursos = semProfissional ? [SEM_PROFISSIONAL] : activeProfessionals.map((professional) => professional.id);

  /** Livre = dentro do expediente dele E sem atendimento sobreposto. */
  const livre = (recurso: string, wanted: BusyWindow) => {
    if (recurso !== SEM_PROFISSIONAL && !services.trabalhaNoIntervalo(expediente.get(recurso), wanted)) {
      return false;
    }
    return !(busyByResource.get(recurso) ?? []).some((window) => windowsOverlap(window, wanted));
  };

  if (input.startTime && input.endTime) {
    const startAt = parseLocalDateTime(`${date}T${input.startTime}`);
    const endAt = parseLocalDateTime(`${date}T${input.endTime}`);
    const wanted = bufferedWindow(startAt, endAt, buffer);
    const cedoDemais = startAt.getTime() < earliest;

    return NextResponse.json({
      ok: true,
      date,
      scope: "interval",
      startTime: input.startTime,
      endTime: input.endTime,
      // Explícito pra IA não confundir "ninguém livre" com "horário inválido".
      tooSoon: cedoDemais,
      minLeadMinutes: leadMinutes,
      semProfissional,
      services: activeServices.map((service) => ({
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: Number(service.defaultPrice),
      })),
      professionals: activeProfessionals.map((professional) => ({
        id: professional.id,
        name: professional.name,
        available: !cedoDemais && livre(professional.id, wanted),
      })),
      available: !cedoDemais && recursos.some((recurso) => livre(recurso, wanted)),
      message: cedoDemais
        ? leadMinutes > 0
          ? `Esse horário está fora da antecedência mínima de ${leadMinutes} minutos. Ofereça um horário mais pra frente.`
          : "Esse horário já passou. Ofereça uma data ou horário futuro."
        : undefined,
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
    if (startAt.getTime() < earliest) continue;
    const endAt = parseLocalDateTime(`${date}T${endTime}`);
    const wanted = bufferedWindow(startAt, endAt, buffer);

    const livres = recursos.filter((recurso) => livre(recurso, wanted));
    if (livres.length === 0) continue;

    slots.push({
      startTime,
      endTime,
      professionals: semProfissional
        ? []
        : activeProfessionals
            .filter((professional) => livres.includes(professional.id))
            .map((professional) => ({ id: professional.id, name: professional.name })),
    });
  }

  return NextResponse.json({
    ok: true,
    date,
    scope: "slots",
    slotMinutes,
    durationMinutes,
    minLeadMinutes: leadMinutes,
    semProfissional,
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
