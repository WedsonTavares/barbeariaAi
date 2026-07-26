"use client";

import { useEffect, useRef } from "react";
import { Boxes, Plus, X } from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { TOY_CATEGORY, label } from "@/lib/labels";
import { createToy } from "./actions";

const CATEGORIES = ["INFLAVEL", "PISCINA_BOLINHAS", "CAMA_ELASTICA", "ESCORREGADOR", "MESA_CADEIRA", "OUTRO"];

export function NewToyDialog({ initialOpen = false }: { initialOpen?: boolean }) {
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
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
    // Abre uma única vez quando a action volta com erro de validação.
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
        Novo brinquedo
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
        aria-labelledby="new-toy-dialog-title"
        aria-describedby="new-toy-dialog-description"
        aria-modal="true"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="border-b border-black/5 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
                <Boxes className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 id="new-toy-dialog-title" className="font-extrabold">
                  Novo brinquedo
                </h2>
                <p id="new-toy-dialog-description" className="mt-0.5 text-xs text-[var(--color-muted)]">
                  Ao salvar, ele entra no catálogo do sistema e nos relatórios.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              aria-label="Fechar cadastro de brinquedo"
              className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <form action={createToy} className="space-y-4 p-5">
          {initialOpen && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              Brinquedo não adicionado. Confira os campos abaixo.
            </p>
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Nome</span>
            <input
              ref={nameRef}
              name="name"
              required
              placeholder="Ex.: Pula-pula Castelo"
              className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Categoria</span>
            <select
              name="category"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {label(TOY_CATEGORY, category)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Valor de compra</span>
              <div className="flex overflow-hidden rounded-xl border border-black/10 bg-white transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <span className="grid place-items-center border-r border-black/5 bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-muted)]">
                  R$
                </span>
                <input
                  name="purchasePrice"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  required
                  className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Valor do aluguel</span>
              <div className="flex overflow-hidden rounded-xl border border-black/10 bg-white transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                <span className="grid place-items-center border-r border-black/5 bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-muted)]">
                  R$
                </span>
                <input
                  name="defaultRentPrice"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  required
                  className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"
                />
              </div>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
              Descrição <span className="font-normal">(opcional)</span>
            </span>
            <textarea
              name="description"
              rows={3}
              placeholder="Informações que ajudam a apresentar o brinquedo"
              className="w-full resize-none rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
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
              Adicionar brinquedo
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
