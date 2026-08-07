import type { Weekday } from "@prisma/client";

import {
  scheduleRanges,
  WEEKDAY_BY_INDEX,
  windowContains,
  type BusyWindow,
} from "../availability";
import { withTenant, type Tx } from "../db/withTenant";
import type { TimeOffInput, WorkingScheduleInput } from "../schemas";
import { spClock } from "../time";

const DIA_MS = 86_400_000;

/**
 * Expediente por profissional: quando cada um atende, com pausas, e quando está
 * de folga.
 *
 * O expediente do TENANT (`TenantSettings.businessHours`) diz quando a casa
 * abre. Isto aqui diz quando CADA profissional trabalha dentro disso — que é o
 * que uma barbearia realmente precisa: um corta de terça a sábado, outro só à
 * tarde, um tira férias em janeiro.
 *
 * Regra de compatibilidade: **profissional SEM expediente cadastrado não é
 * restringido**. Assim a funcionalidade pode ser adotada aos poucos, sem
 * derrubar a agenda de quem ainda não configurou nada.
 */
export const scheduleService = {
  /** Expediente semanal de um profissional, na ordem dos dias. */
  listByProfessional: (tenantId: string, professionalId: string) =>
    withTenant(tenantId, (tx) =>
      tx.workingSchedule.findMany({
        where: { professionalId },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      })
    ),

  /** Todos os expedientes do tenant, para montar a tela de uma vez só. */
  listAll: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.workingSchedule.findMany({ orderBy: [{ professionalId: "asc" }, { dayOfWeek: "asc" }] })
    ),

  /**
   * Grava o expediente de um dia. Um registro por (profissional, dia): salvar
   * de novo substitui, em vez de acumular faixas duplicadas.
   */
  setDay: (tenantId: string, data: WorkingScheduleInput) =>
    withTenant(tenantId, async (tx) => {
      await tx.workingSchedule.deleteMany({
        where: { professionalId: data.professionalId, dayOfWeek: data.dayOfWeek },
      });
      if (!data.active) return null;
      return tx.workingSchedule.create({
        data: {
          tenantId,
          professionalId: data.professionalId,
          dayOfWeek: data.dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          breaks: data.breaks ?? [],
          active: true,
        },
      });
    }),

  listTimeOff: (tenantId: string, professionalId?: string, desde = new Date()) =>
    withTenant(tenantId, (tx) =>
      tx.timeOff.findMany({
        where: { ...(professionalId ? { professionalId } : {}), endAt: { gte: desde } },
        orderBy: { startAt: "asc" },
      })
    ),

  addTimeOff: (tenantId: string, data: TimeOffInput) =>
    withTenant(tenantId, (tx) =>
      tx.timeOff.create({
        data: {
          tenantId,
          professionalId: data.professionalId,
          startAt: data.startAt,
          endAt: data.endAt,
          reason: data.reason || null,
        },
      })
    ),

  removeTimeOff: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.timeOff.deleteMany({ where: { id } })),

  /**
   * Janelas em que cada profissional PODE atender no período.
   *
   * `null` para um profissional significa "sem expediente cadastrado" — e é
   * diferente de uma lista vazia, que significa "cadastrado e não trabalha
   * nesse período". Quem consome precisa distinguir: o primeiro caso não
   * restringe nada, o segundo bloqueia tudo.
   */
  workingWindows: (tenantId: string, from: Date, to: Date) =>
    withTenant(tenantId, (tx) => workingWindowsIn(tx, from, to)),
};

/** Índice do dia da semana (0 = domingo) → nome do enum do Prisma. */
function weekdayOf(date: Date): Weekday {
  return WEEKDAY_BY_INDEX[spClock(date).weekday] as Weekday;
}

/** Meia-noite local do dia que contém `date`, como instante UTC. */
function localMidnight(date: Date): number {
  const { dayKey } = spClock(date);
  return Date.parse(`${dayKey}T00:00:00-03:00`);
}

export async function workingWindowsIn(
  tx: Tx,
  from: Date,
  to: Date
): Promise<Map<string, BusyWindow[] | null>> {
  const [schedules, timeOffs] = await Promise.all([
    tx.workingSchedule.findMany({ where: { active: true } }),
    tx.timeOff.findMany({ where: { startAt: { lt: to }, endAt: { gt: from } } }),
  ]);

  const resultado = new Map<string, BusyWindow[] | null>();
  const comExpediente = new Set(schedules.map((s) => s.professionalId));

  // Percorre dia a dia: o expediente é semanal, o período consultado pode
  // atravessar mais de um dia (e sábado não tem o mesmo horário de terça).
  const dias: number[] = [];
  for (let t = localMidnight(from); t < to.getTime(); t += DIA_MS) dias.push(t);
  if (dias.length === 0) dias.push(localMidnight(from));

  for (const professionalId of comExpediente) {
    const janelas: BusyWindow[] = [];
    for (const meiaNoite of dias) {
      const dia = weekdayOf(new Date(meiaNoite));
      for (const schedule of schedules) {
        if (schedule.professionalId !== professionalId || schedule.dayOfWeek !== dia) continue;
        for (const faixa of scheduleRanges(schedule.startTime, schedule.endTime, schedule.breaks)) {
          janelas.push({
            from: meiaNoite + faixa.inicio * 60_000,
            to: meiaNoite + faixa.fim * 60_000,
          });
        }
      }
    }
    resultado.set(professionalId, subtrairFolgas(janelas, timeOffs, professionalId));
  }

  return resultado;
}

/** Remove das janelas de trabalho os períodos de folga do profissional. */
function subtrairFolgas(
  janelas: BusyWindow[],
  timeOffs: { professionalId: string; startAt: Date; endAt: Date }[],
  professionalId: string
): BusyWindow[] {
  let atuais = janelas;
  for (const folga of timeOffs) {
    if (folga.professionalId !== professionalId) continue;
    const fFrom = folga.startAt.getTime();
    const fTo = folga.endAt.getTime();
    const proximas: BusyWindow[] = [];
    for (const janela of atuais) {
      if (fTo <= janela.from || fFrom >= janela.to) {
        proximas.push(janela);
        continue;
      }
      if (fFrom > janela.from) proximas.push({ from: janela.from, to: fFrom });
      if (fTo < janela.to) proximas.push({ from: fTo, to: janela.to });
    }
    atuais = proximas;
  }
  return atuais;
}

/**
 * O profissional atende nesse intervalo?
 *
 * `true` também quando ele não tem expediente cadastrado — ver a regra de
 * compatibilidade no topo do arquivo.
 */
export function trabalhaNoIntervalo(
  janelas: BusyWindow[] | null | undefined,
  wanted: BusyWindow
): boolean {
  if (janelas == null) return true;
  return windowContains(janelas, wanted);
}
