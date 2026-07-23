/**
 * Datas no fuso do negócio (America/Sao_Paulo, UTC-3 fixo — sem DST desde 2019).
 * O servidor (Vercel) roda em UTC: inputs `datetime-local`/`date` chegam SEM offset
 * e precisam ser ancorados em SP, senão lembretes e cortes de dia/mês saem 3h errados.
 */
export const APP_TZ = "America/Sao_Paulo";
export const TZ_OFFSET = "-03:00";
const OFFSET_MS = 3 * 3_600_000;

/** "2026-07-22T14:00" (datetime-local, sem offset) → instante UTC do horário de SP. */
export function parseLocalDateTime(s: string): Date {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return new Date(s); // já tem offset
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseLocalDate(s);
  return new Date(`${s}${s.length === 16 ? ":00" : ""}${TZ_OFFSET}`);
}

/** "2026-07-22" (input date) → meia-noite de SP (03:00 UTC). */
export function parseLocalDate(s: string): Date {
  return new Date(`${s}T00:00:00${TZ_OFFSET}`);
}

/** Partes de calendário de `d` vistas de SP. */
function spParts(d: Date) {
  const shifted = new Date(d.getTime() - OFFSET_MS);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** Intervalo [início, fim) do DIA de SP que contém `now`. */
export function spDayRange(now = new Date()): { start: Date; end: Date } {
  const { y, m, day } = spParts(now);
  const start = new Date(Date.UTC(y, m, day) + OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/** Intervalo [início, fim) do MÊS de SP que contém `ref`. */
export function spMonthRange(ref = new Date()): { start: Date; end: Date } {
  const { y, m } = spParts(ref);
  return {
    start: new Date(Date.UTC(y, m, 1) + OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 1) + OFFSET_MS),
  };
}
