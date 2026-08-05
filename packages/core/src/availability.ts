const MINUTES_PER_DAY = 24 * 60;

export const AVAILABILITY_SLOT_MINUTES = 30;

export interface OccupiedResourceInterval {
  resourceId: string;
  startAt: Date;
  endAt: Date;
}

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

function timeLabel(totalMinutes: number): string {
  if (totalMinutes === MINUTES_PER_DAY) return "24:00";
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Gera uma grade [início, fim) para cada recurso/profissional. Intervalos
 * adjacentes não conflitam: um atendimento que termina às 14:00 libera o slot
 * iniciado às 14:00.
 *
 * `now` derruba os slots que já começaram: sem isso, uma consulta feita hoje às
 * 19h devolveria 08:00 como livre e a IA ofereceria um horário impossível.
 */
export function buildDailyAvailabilitySlots(
  dayStart: Date,
  resourceIds: string[],
  occupied: OccupiedResourceInterval[],
  slotMinutes = AVAILABILITY_SLOT_MINUTES,
  now?: Date
): Record<string, AvailabilitySlot[]> {
  if (
    !Number.isInteger(slotMinutes) ||
    slotMinutes <= 0 ||
    MINUTES_PER_DAY % slotMinutes !== 0
  ) {
    throw new RangeError("slotMinutes deve dividir um dia completo");
  }

  const slotMs = slotMinutes * 60_000;
  const slotCount = MINUTES_PER_DAY / slotMinutes;
  const occupiedByResource = new Map<string, OccupiedResourceInterval[]>();

  for (const interval of occupied) {
    const current = occupiedByResource.get(interval.resourceId) ?? [];
    current.push(interval);
    occupiedByResource.set(interval.resourceId, current);
  }

  return Object.fromEntries(
    resourceIds.map((resourceId) => {
      const resourceIntervals = occupiedByResource.get(resourceId) ?? [];
      const slots = Array.from({ length: slotCount }, (_, index) => {
        const startMinutes = index * slotMinutes;
        const endMinutes = startMinutes + slotMinutes;
        const start = new Date(dayStart.getTime() + index * slotMs);
        const end = new Date(start.getTime() + slotMs);
        const alreadyStarted = now ? start.getTime() < now.getTime() : false;
        const hasConflict = resourceIntervals.some(
          (interval) => interval.startAt < end && interval.endAt > start
        );

        return {
          startTime: timeLabel(startMinutes),
          endTime: timeLabel(endMinutes),
          available: !hasConflict && !alreadyStarted,
        };
      });

      return [resourceId, slots];
    })
  );
}
