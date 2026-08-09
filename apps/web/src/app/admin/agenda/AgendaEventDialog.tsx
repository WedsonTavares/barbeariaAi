"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Save, Scissors, Trash2, UserRound, X } from "lucide-react";

import {
  cancelAgendaAppointmentAction,
  updateAgendaAppointmentAction,
} from "../agendamentos/actions";

export type AgendaEventDetails = {
  kind: "appointment" | "block";
  customer: string;
  customerPhone: string;
  professional: string;
  professionalId: string;
  services: string;
  serviceIds: string[];
  status: string;
  statusCode: string;
  notes: string;
};

export type AgendaEventSelection = AgendaEventDetails & {
  id: string;
  start: Date | null;
  end: Date | null;
  color: string;
};

export type AgendaServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
  priceLabel: string;
};

export type AgendaProfessionalOption = {
  id: string;
  name: string;
};

const SP_DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const SP_INPUT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Sao_Paulo",
});

function inputDateTime(date: Date | null) {
  if (!date) return "";
  const parts = SP_INPUT.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function AgendaEventDialog({
  selection,
  services,
  professionals,
  onClose,
}: {
  selection: AgendaEventSelection | null;
  services: AgendaServiceOption[];
  professionals: AgendaProfessionalOption[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mutationInFlight = useRef(false);
  const router = useRouter();
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [operation, setOperation] = useState<"save" | "delete" | null>(null);
  const [mutating, startMutation] = useTransition();

  useEffect(() => {
    if (!selection) return;
    setError("");
    setConfirmingDelete(false);
    setOperation(null);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, [selection]);

  function closeDialog() {
    if (!mutationInFlight.current) dialogRef.current?.close();
  }

  function finish() {
    router.refresh();
    dialogRef.current?.close();
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setError("");
    setOperation("save");
    const formData = new FormData(event.currentTarget);

    startMutation(async () => {
      try {
        const result = await updateAgendaAppointmentAction(formData);
        if (result.ok) finish();
        else setError(result.message);
      } catch {
        setError("Não foi possível salvar agora. Tente novamente.");
      } finally {
        mutationInFlight.current = false;
        setOperation(null);
      }
    });
  }

  function remove() {
    if (!selection || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setError("");
    setOperation("delete");

    startMutation(async () => {
      try {
        const result = await cancelAgendaAppointmentAction(selection.id);
        if (result.ok) finish();
        else setError(result.message);
      } catch {
        setError("Não foi possível excluir agora. Tente novamente.");
      } finally {
        mutationInFlight.current = false;
        setOperation(null);
      }
    });
  }

  const editable = selection?.kind === "appointment" && selection.statusCode !== "COMPLETED";
  const fieldClass =
    "w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        setError("");
        setConfirmingDelete(false);
        onClose();
      }}
      onCancel={(event) => {
        if (mutationInFlight.current) event.preventDefault();
      }}
      onClick={(event) => {
        const dialog = dialogRef.current;
        if (!dialog || mutationInFlight.current) return;
        const rect = dialog.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) closeDialog();
      }}
      aria-labelledby="agenda-event-title"
      aria-modal="true"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      {selection && (
        <div style={{ borderTopColor: selection.color }} className="border-t-4">
          <header className="flex items-start justify-between gap-4 border-b border-black/5 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <div className="text-xs font-bold text-[var(--color-muted)]">{selection.status}</div>
              <h2 id="agenda-event-title" className="truncate font-extrabold">{selection.customer}</h2>
              {selection.customerPhone && (
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">{selection.customerPhone}</p>
              )}
            </div>
            <button
              type="button"
              onClick={closeDialog}
              disabled={mutating}
              aria-label="Fechar agendamento"
              title="Fechar"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)] disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          {editable ? (
            <form onSubmit={save} className="space-y-4 p-4 sm:p-5">
              <input type="hidden" name="id" value={selection.id} />
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Data e hora</span>
                  <input
                    name="startAt"
                    required
                    type="datetime-local"
                    defaultValue={inputDateTime(selection.start)}
                    disabled={mutating}
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Profissional</span>
                  <select
                    name="professionalId"
                    defaultValue={selection.professionalId}
                    disabled={mutating}
                    className={fieldClass}
                  >
                    <option value="">Sem profissional</option>
                    {professionals.map((professional) => (
                      <option key={professional.id} value={professional.id}>{professional.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset disabled={mutating}>
                <legend className="mb-1.5 text-xs font-bold text-[var(--color-muted)]">Serviços</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {services.map((service) => (
                    <label key={service.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{service.name}</span>
                        <span className="text-xs text-[var(--color-muted)]">
                          {service.durationMinutes} min · {service.priceLabel}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        name="serviceIds"
                        value={service.id}
                        defaultChecked={selection.serviceIds.includes(service.id)}
                        className="size-4 shrink-0 accent-[var(--color-primary)]"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Observações</span>
                <textarea
                  name="notes"
                  defaultValue={selection.notes}
                  disabled={mutating}
                  className={`${fieldClass} min-h-20 resize-y`}
                />
              </label>

              {confirmingDelete && (
                <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-red-800">
                    O agendamento sairá da Agenda e ficará salvo no histórico como cancelado.
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={mutating}
                      className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-700 disabled:opacity-50"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={remove}
                      disabled={mutating}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-bold text-white disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {operation === "delete" ? "Excluindo..." : "Confirmar exclusão"}
                    </button>
                  </div>
                </div>
              )}

              <footer className="flex flex-col-reverse gap-2 border-t border-black/5 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={mutating || confirmingDelete}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                  Excluir
                </button>
                <div className="flex gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={mutating}
                    className="h-10 flex-1 rounded-lg border border-black/10 px-4 text-sm font-semibold hover:bg-[var(--color-surface)] disabled:opacity-50 sm:flex-none"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={mutating || confirmingDelete}
                    aria-busy={operation === "save"}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50 sm:flex-none"
                  >
                    <Save className="size-4" aria-hidden />
                    {operation === "save" ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </footer>
            </form>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
              <dl className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <Clock3 className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                  <div>
                    <dt className="sr-only">Horário</dt>
                    <dd>
                      {selection.start ? SP_DATE_TIME.format(selection.start) : "Horário indisponível"}
                      {selection.end ? ` até ${SP_DATE_TIME.format(selection.end).split(" ").at(-1)}` : ""}
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <UserRound className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                  <div>
                    <dt className="sr-only">Profissional</dt>
                    <dd>{selection.professional}</dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Scissors className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                  <div>
                    <dt className="sr-only">Serviços</dt>
                    <dd>{selection.services}</dd>
                  </div>
                </div>
              </dl>
              <div className="flex justify-end border-t border-black/5 pt-4">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="h-10 rounded-lg border border-black/10 px-4 text-sm font-semibold hover:bg-[var(--color-surface)]"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
