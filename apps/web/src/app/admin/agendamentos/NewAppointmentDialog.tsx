"use client";

import { useEffect, useRef } from "react";
import { CalendarPlus, X } from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { createAppointmentAction } from "./actions";

type CustomerOption = { id: string; name: string; phone: string };
type ServiceOption = { id: string; name: string; durationMinutes: number; priceLabel: string };
type ProfessionalOption = { id: string; name: string };

export function NewAppointmentDialog({
  customers,
  services,
  professionals,
  defaultName,
  defaultPhone,
  errorMessage,
  initialOpen,
  returnTo = "/admin/agendamentos",
}: {
  customers: CustomerOption[];
  services: ServiceOption[];
  professionals: ProfessionalOption[];
  defaultName: string;
  defaultPhone: string;
  errorMessage?: string;
  initialOpen: boolean;
  returnTo?: "/admin/agenda" | "/admin/agendamentos";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    scrollLocked.current = true;
    dialog.showModal();
    window.setTimeout(() => nameRef.current?.focus(), 0);
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  function restorePage() {
    if (scrollLocked.current) {
      document.body.style.overflow = previousOverflow.current;
      scrollLocked.current = false;
    }
    if (!initialOpen) dialogRef.current?.querySelector("form")?.reset();
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (initialOpen) openDialog();
    return () => {
      if (dialogRef.current?.open) dialogRef.current.close();
      if (scrollLocked.current) document.body.style.overflow = previousOverflow.current;
    };
    // Abre uma vez ao chegar por outro fluxo ou ao retornar com erro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  const fieldClass =
    "w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white hover:brightness-95"
      >
        <CalendarPlus className="size-4" aria-hidden />
        Novo agendamento
      </button>

      <dialog
        ref={dialogRef}
        onClose={restorePage}
        onClick={(event) => {
          const dialog = dialogRef.current;
          if (!dialog) return;
          const rect = dialog.getBoundingClientRect();
          const outside =
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom;
          if (outside) closeDialog();
        }}
        aria-labelledby="new-appointment-title"
        aria-modal="true"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-lg border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-black/5 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <CalendarPlus className="size-5" aria-hidden />
            </span>
            <h2 id="new-appointment-title" className="font-extrabold">Novo agendamento</h2>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            aria-label="Fechar novo agendamento"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <form action={createAppointmentAction} className="space-y-4 p-5">
          <input type="hidden" name="returnTo" value={returnTo} />
          {errorMessage && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              {errorMessage}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Cliente cadastrado</span>
              <select name="customerId" defaultValue="" className={fieldClass}>
                <option value="">Novo cliente pelo telefone</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Nome do cliente</span>
              <input ref={nameRef} name="name" defaultValue={defaultName} placeholder="Nome do cliente" className={fieldClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">WhatsApp</span>
              <input name="phone" defaultValue={defaultPhone} inputMode="tel" autoComplete="tel" placeholder="5516999999999" className={fieldClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Data e hora</span>
              <input name="startAt" required type="datetime-local" className={fieldClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Profissional</span>
              <select name="professionalId" defaultValue="" className={fieldClass}>
                <option value="">Sem profissional</option>
                {professionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professional.name}</option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-bold text-[var(--color-muted)]">Serviços</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <label key={service.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2 text-sm">
                  <span>
                    <span className="block font-semibold">{service.name}</span>
                    <span className="text-xs text-[var(--color-muted)]">{service.durationMinutes} min · {service.priceLabel}</span>
                  </span>
                  <input type="checkbox" name="serviceIds" value={service.id} className="size-4 accent-[var(--color-primary)]" />
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Observações</span>
            <textarea name="notes" className={`${fieldClass} min-h-20 resize-y`} />
          </label>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)]"
            >
              Cancelar
            </button>
            <SubmitButton
              pendingText="Agendando..."
              className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
            >
              Agendar
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
