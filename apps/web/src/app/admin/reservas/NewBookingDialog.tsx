"use client";

import { useEffect, useRef } from "react";
import { CalendarPlus, Plus, X } from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { createBooking } from "./actions";

export type PickerOption = { id: string; name: string };

/**
 * "Nova reserva" em modal, no mesmo padrão de Clientes e Brinquedos — antes o
 * formulário ficava fixo numa coluna ao lado da lista, ocupando metade da tela
 * mesmo quando ninguém ia cadastrar nada.
 *
 * Os campos e a action são exatamente os de antes: só mudou onde aparecem.
 */
export function NewBookingDialog({
  customers,
  toys,
  initialOpen = false,
  hasError = false,
  phone,
  contactName,
}: {
  customers: PickerOption[];
  toys: PickerOption[];
  initialOpen?: boolean;
  hasError?: boolean;
  /** Vindo do atalho "Agendar" de uma conversa: telefone já conhecido. */
  phone?: string;
  contactName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);
  const responsavelRef = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    scrollLocked.current = true;
    dialog.showModal();
    // Foca o primeiro campo que existe no modo atual (responsável ou cliente).
    window.setTimeout(() => (responsavelRef.current ?? firstRef.current)?.focus(), 0);
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
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
    // Abre uma vez só: vindo da Agenda (?nova=1) ou quando a action volta com erro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  const field =
    "w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  const labelText = "mb-1.5 block text-xs font-bold text-[var(--color-muted)]";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 sm:w-auto"
      >
        <Plus className="size-4" aria-hidden />
        Nova reserva
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
        aria-labelledby="new-booking-title"
        aria-modal="true"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="border-b border-black/5 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
                <CalendarPlus className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="new-booking-title" className="font-extrabold">Nova reserva</h2>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  Brinquedo já reservado no mesmo horário é bloqueado ao salvar.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              aria-label="Fechar nova reserva"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <form action={createBooking} className="space-y-4 p-5">
          {hasError && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              Reserva não criada. Confira os campos abaixo.
            </p>
          )}

          {/*
            Dois modos. Vindo de uma conversa (`phone`), o telefone já é
            conhecido e a única pergunta que falta é QUEM responde pela festa —
            o pushName do WhatsApp raramente é o nome do responsável. O cadastro
            é criado/encontrado na hora pelo telefone.
            Sem conversa, segue a lista de clientes já cadastrados.
          */}
          {phone ? (
            <>
              <input type="hidden" name="phone" value={phone} />
              <label className="block">
                <span className={labelText}>Nome do responsável</span>
                <input
                  ref={responsavelRef}
                  name="responsavel"
                  required
                  defaultValue={contactName ?? ""}
                  placeholder="Quem responde pela festa"
                  className={field}
                />
                <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
                  WhatsApp {phone} — o cadastro é criado se ainda não existir.
                </span>
              </label>
            </>
          ) : (
            <label className="block">
              <span className={labelText}>Cliente</span>
              <select ref={firstRef} name="customerId" required className={field}>
                <option value="">Selecione...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className={labelText}>Data do evento</span>
            <input name="eventDate" type="date" required className={field} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>Montagem</span>
              <input name="setupTime" type="datetime-local" required className={field} />
            </label>
            <label className="block">
              <span className={labelText}>Retirada</span>
              <input name="pickupTime" type="datetime-local" required className={field} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>Valor total</span>
              <input name="total" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0,00" required className={field} />
            </label>
            <label className="block">
              <span className={labelText}>Sinal previsto <span className="font-normal">(opcional)</span></span>
              <input name="depositAmount" type="number" inputMode="decimal" step="0.01" min="0" placeholder="0,00" className={field} />
            </label>
          </div>

          {/*
            Bairro e endereço são obrigatórios: sem eles a equipe sai pra montar
            sem saber onde, e o aviso de 30 minutos chega sem o "📍". A trava é
            só do formulário — o schema segue aceitando vazio, porque reserva
            criada pela IA nem sempre tem o endereço na primeira conversa.
          */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelText}>Bairro</span>
              <input name="neighborhood" required className={field} />
            </label>
            <label className="block">
              <span className={labelText}>Endereço</span>
              <input name="address" required className={field} />
            </label>
          </div>

          <fieldset className="rounded-xl border border-black/10 p-3">
            <legend className="px-1 text-xs font-bold text-[var(--color-muted)]">Brinquedos</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {toys.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-[var(--color-surface)]">
                  <input type="checkbox" name="toyIds" value={t.id} className="size-4 accent-[var(--color-primary)]" />
                  {t.name}
                </label>
              ))}
              {toys.length === 0 && (
                <p className="px-1 py-1 text-xs text-[var(--color-muted)]">Nenhum brinquedo ativo no catálogo.</p>
              )}
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)]"
            >
              Cancelar
            </button>
            <SubmitButton
              pendingText="Criando..."
              className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
            >
              Criar reserva
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
