import { CalendarClock, CalendarOff, Trash2 } from "lucide-react";

import { fmtDateTime } from "@/lib/format";
import { addTimeOffAction, removeTimeOffAction, saveScheduleAction } from "./actions";

/** Ordem de exibição: a semana começa na segunda para quem trabalha em salão. */
const DIAS = [
  { valor: "MONDAY", rotulo: "Seg" },
  { valor: "TUESDAY", rotulo: "Ter" },
  { valor: "WEDNESDAY", rotulo: "Qua" },
  { valor: "THURSDAY", rotulo: "Qui" },
  { valor: "FRIDAY", rotulo: "Sex" },
  { valor: "SATURDAY", rotulo: "Sáb" },
  { valor: "SUNDAY", rotulo: "Dom" },
] as const;

export interface ExpedienteDia {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  breaks: unknown;
}

export interface Folga {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
}

/** Primeira pausa gravada no Json `breaks`, para preencher os campos. */
function primeiraPausa(breaks: unknown): { start: string; end: string } {
  if (!Array.isArray(breaks)) return { start: "", end: "" };
  const p = breaks[0] as Record<string, unknown> | undefined;
  const start = typeof p?.start === "string" ? p.start : "";
  const end = typeof p?.end === "string" ? p.end : "";
  return { start, end };
}

/**
 * Expediente semanal + folgas de um profissional.
 *
 * Um formulário por DIA, de propósito: mudar o sábado não deve exigir reenviar
 * a semana inteira, e é assim que a pessoa pensa ("sábado eu fecho às 14h").
 */
export function ExpedienteEditor({
  professionalId,
  expediente,
  folgas,
}: {
  professionalId: string;
  expediente: ExpedienteDia[];
  folgas: Folga[];
}) {
  const configurado = expediente.length > 0;

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <CalendarClock className="size-4 text-[var(--color-primary)]" aria-hidden />
        Expediente
      </h3>
      {!configurado && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Sem expediente cadastrado, a agenda não restringe este profissional — ele aparece livre em
          qualquer horário que a casa esteja aberta.
        </p>
      )}

      <div className="mt-3 space-y-1.5">
        {DIAS.map((dia) => {
          const atual = expediente.find((e) => e.dayOfWeek === dia.valor);
          const pausa = primeiraPausa(atual?.breaks);
          return (
            <form
              key={dia.valor}
              action={saveScheduleAction}
              className="flex flex-wrap items-center gap-1.5 rounded-xl bg-[var(--color-surface)] px-2 py-1.5"
            >
              <input type="hidden" name="professionalId" value={professionalId} />
              <input type="hidden" name="dayOfWeek" value={dia.valor} />
              <label className="flex w-16 shrink-0 items-center gap-1.5 text-xs font-bold">
                <input type="checkbox" name="active" defaultChecked={Boolean(atual)} className="size-3.5 accent-[var(--color-primary)]" />
                {dia.rotulo}
              </label>
              <input
                type="time"
                name="startTime"
                defaultValue={atual?.startTime ?? "09:00"}
                aria-label={`${dia.rotulo}: entrada`}
                className="rounded-lg border border-black/10 bg-white px-1.5 py-1 text-xs"
              />
              <span className="text-xs text-[var(--color-muted)]">às</span>
              <input
                type="time"
                name="endTime"
                defaultValue={atual?.endTime ?? "18:00"}
                aria-label={`${dia.rotulo}: saída`}
                className="rounded-lg border border-black/10 bg-white px-1.5 py-1 text-xs"
              />
              <span className="ml-1 text-xs text-[var(--color-muted)]">pausa</span>
              <input
                type="time"
                name="breakStart"
                defaultValue={pausa.start}
                aria-label={`${dia.rotulo}: início da pausa`}
                className="rounded-lg border border-black/10 bg-white px-1.5 py-1 text-xs"
              />
              <input
                type="time"
                name="breakEnd"
                defaultValue={pausa.end}
                aria-label={`${dia.rotulo}: fim da pausa`}
                className="rounded-lg border border-black/10 bg-white px-1.5 py-1 text-xs"
              />
              <button className="ml-auto rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-bold hover:bg-[var(--color-surface)]">
                Salvar
              </button>
            </form>
          );
        })}
      </div>

      <h3 className="mt-4 flex items-center gap-2 text-sm font-bold">
        <CalendarOff className="size-4 text-amber-600" aria-hidden />
        Folgas e férias
      </h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        A IA não oferece nem fecha horário dentro desses períodos.
      </p>

      {folgas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {folgas.map((folga) => (
            <li key={folga.id} className="flex items-center gap-2 rounded-lg bg-[var(--color-surface)] px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate">
                {fmtDateTime(folga.startAt)} → {fmtDateTime(folga.endAt)}
                {folga.reason ? ` · ${folga.reason}` : ""}
              </span>
              <form action={removeTimeOffAction}>
                <input type="hidden" name="id" value={folga.id} />
                <button aria-label="Remover folga" className="grid size-6 place-items-center rounded-md text-red-600 hover:bg-red-50">
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addTimeOffAction} className="mt-2 flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="professionalId" value={professionalId} />
        <input type="datetime-local" name="startAt" required aria-label="Início da folga" className="rounded-lg border border-black/10 px-1.5 py-1 text-xs" />
        <input type="datetime-local" name="endAt" required aria-label="Fim da folga" className="rounded-lg border border-black/10 px-1.5 py-1 text-xs" />
        <input name="reason" placeholder="Motivo (opcional)" className="min-w-32 flex-1 rounded-lg border border-black/10 px-2 py-1 text-xs" />
        <button className="rounded-lg border border-black/10 px-2 py-1 text-xs font-bold hover:bg-[var(--color-surface)]">
          Adicionar folga
        </button>
      </form>
    </div>
  );
}
