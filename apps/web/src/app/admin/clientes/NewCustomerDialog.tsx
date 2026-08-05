"use client";

import { useEffect, useRef } from "react";
import { Plus, UserPlus, X } from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { createCustomer } from "./actions";

const CREATE_ERRORS: Record<string, string> = {
  validacao: "Confira o nome e o WhatsApp antes de salvar.",
  duplicado: "Este WhatsApp já possui um cadastro. Use a busca para localizar e editar o cliente existente.",
};

export function NewCustomerDialog({ errorCode }: { errorCode?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);
  const initialOpen = Boolean(errorCode && CREATE_ERRORS[errorCode]);

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
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
    // Abre uma vez quando o servidor devolve erro do novo cadastro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 sm:w-auto"
      >
        <Plus className="size-4" aria-hidden />
        Novo cliente
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
        aria-labelledby="new-customer-title"
        aria-describedby="new-customer-description"
        aria-modal="true"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="border-b border-black/5 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
                <UserPlus className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="new-customer-title" className="font-extrabold">
                  Novo cliente
                </h2>
                <p id="new-customer-description" className="mt-0.5 text-xs text-[var(--color-muted)]">
                  Cadastre os dados sem criar um agendamento.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              aria-label="Fechar cadastro de cliente"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <form action={createCustomer} className="space-y-4 p-5">
          {errorCode && CREATE_ERRORS[errorCode] && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              {CREATE_ERRORS[errorCode]}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Nome</span>
              <input
                ref={nameRef}
                name="name"
                required
                placeholder="Nome do cliente"
                className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">WhatsApp</span>
              <input
                name="phone"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="5516999999999"
                className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
                E-mail <span className="font-normal">(opcional)</span>
              </span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="cliente@email.com"
                className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
                Bairro <span className="font-normal">(opcional)</span>
              </span>
              <input
                name="neighborhood"
                autoComplete="address-level3"
                className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
                Endereço <span className="font-normal">(opcional)</span>
              </span>
              <input
                name="address"
                autoComplete="street-address"
                className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl bg-[var(--color-surface)] px-3 py-2.5 text-sm">
            <input type="checkbox" name="imageConsent" className="mt-0.5 size-4 accent-[var(--color-primary)]" />
            <span>
              <span className="font-semibold">Autoriza uso de imagem</span>
              <span className="block text-xs text-[var(--color-muted)]">Consentimento de imagem registrado no cadastro.</span>
            </span>
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
              pendingText="Adicionando..."
              className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
            >
              Adicionar cliente
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
