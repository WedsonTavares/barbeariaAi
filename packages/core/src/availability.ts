const MINUTES_PER_DAY = 24 * 60;

export const AVAILABILITY_SLOT_MINUTES = 30;

/** Folga de preparo/limpeza, em minutos, exigida antes e depois do atendimento. */
export interface ServiceBuffer {
  before: number;
  after: number;
}

export const NO_BUFFER: ServiceBuffer = { before: 0, after: 0 };

/** Intervalo ocupado, em milissegundos desde a época. */
export interface BusyWindow {
  from: number;
  to: number;
}

/**
 * Folga exigida por um conjunto de serviços.
 *
 * Usa o MAIOR valor do conjunto, não a soma: o intervalo acontece uma vez antes
 * e uma vez depois do atendimento inteiro, não a cada serviço encadeado.
 */
export function serviceBufferOf(
  services: { bufferBeforeMinutes: number; bufferAfterMinutes: number }[]
): ServiceBuffer {
  return {
    before: Math.max(0, ...services.map((service) => service.bufferBeforeMinutes)),
    after: Math.max(0, ...services.map((service) => service.bufferAfterMinutes)),
  };
}

/** O atendimento esticado pela folga — é isto que de fato ocupa a agenda. */
export function bufferedWindow(startAt: Date, endAt: Date, buffer: ServiceBuffer = NO_BUFFER): BusyWindow {
  return {
    from: startAt.getTime() - buffer.before * 60_000,
    to: endAt.getTime() + buffer.after * 60_000,
  };
}

/**
 * Intervalos meio-abertos: quem termina às 14:00 libera o horário que começa às
 * 14:00. Encostar não é conflitar.
 */
export function windowsOverlap(a: BusyWindow, b: BusyWindow): boolean {
  return a.from < b.to && a.to > b.from;
}

/** `wanted` cabe inteiro dentro de alguma das janelas? */
export function windowContains(janelas: BusyWindow[], wanted: BusyWindow): boolean {
  return janelas.some((janela) => janela.from <= wanted.from && janela.to >= wanted.to);
}

/* ───────────────────────── Expediente do profissional ───────────────────────── */

/** Dia da semana do Prisma a partir do índice JS (0 = domingo). */
export const WEEKDAY_BY_INDEX = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

export type WeekdayName = (typeof WEEKDAY_BY_INDEX)[number];

/** Minutos desde a meia-noite. Devolve null no que não for "HH:mm" válido. */
export function parseHhmm(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 24 || minuto > 59 || (hora === 24 && minuto > 0)) return null;
  return hora * 60 + minuto;
}

/** Intervalo em minutos desde a meia-noite do dia local. */
export interface MinuteRange {
  inicio: number;
  fim: number;
}

/**
 * Pausas gravadas em `WorkingSchedule.breaks` (Json livre).
 *
 * Lê de forma tolerante: o campo é Json e pode ter vindo de versões diferentes
 * da tela. O que não parsear é ignorado, nunca derruba a agenda.
 */
export function parseBreaks(raw: unknown): MinuteRange[] {
  if (!Array.isArray(raw)) return [];
  const pausas: MinuteRange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const inicio = parseHhmm(o.start ?? o.inicio);
    const fim = parseHhmm(o.end ?? o.fim);
    if (inicio === null || fim === null || fim <= inicio) continue;
    pausas.push({ inicio, fim });
  }
  return pausas.sort((a, b) => a.inicio - b.inicio);
}

/**
 * O expediente de um dia, já descontadas as pausas.
 *
 * Ex.: 09:00–18:00 com almoço 12:00–13:00 vira duas janelas,
 * 09:00–12:00 e 13:00–18:00. Um atendimento não pode atravessar o almoço.
 */
export function scheduleRanges(
  startTime: string,
  endTime: string,
  breaks: unknown
): MinuteRange[] {
  const inicio = parseHhmm(startTime);
  const fim = parseHhmm(endTime);
  if (inicio === null || fim === null || fim <= inicio) return [];

  let janelas: MinuteRange[] = [{ inicio, fim }];
  for (const pausa of parseBreaks(breaks)) {
    const proximas: MinuteRange[] = [];
    for (const janela of janelas) {
      if (pausa.fim <= janela.inicio || pausa.inicio >= janela.fim) {
        proximas.push(janela);
        continue;
      }
      if (pausa.inicio > janela.inicio) proximas.push({ inicio: janela.inicio, fim: pausa.inicio });
      if (pausa.fim < janela.fim) proximas.push({ inicio: pausa.fim, fim: janela.fim });
    }
    janelas = proximas;
  }
  return janelas;
}

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
