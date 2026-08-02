"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Bot,
  Camera,
  Check,
  ImagePlus,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { TOY_CATEGORY, TOY_STATUS, label } from "@/lib/labels";
import { removeToy, setToyStatus, updateToy, uploadToyPhoto } from "./actions";

const STATUSES = ["AVAILABLE", "RENTED", "MAINTENANCE"];
const CATEGORIES = ["INFLAVEL", "PISCINA_BOLINHAS", "CAMA_ELASTICA", "ESCORREGADOR", "MESA_CADEIRA", "OUTRO"];
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

const PHOTO_ERRORS: Record<string, string> = {
  foto: "Não foi possível enviar a foto. Tente novamente.",
  foto_arquivo: "Escolha uma imagem válida para este brinquedo.",
  foto_tipo: "Formato não aceito. Use uma imagem JPG, PNG ou WebP.",
  foto_tamanho: "A imagem ultrapassa 4 MB. Escolha um arquivo menor.",
  foto_config: "O envio de fotos não está configurado neste ambiente.",
  foto_storage: "O armazenamento não concluiu o envio. Tente novamente.",
};

export type ToyCardData = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  status: string;
  description: string | null;
  priceLabel: string;
  /** Valores crus, para preencher o formulário de edição (priceLabel já vem formatado). */
  purchasePrice: number;
  defaultRentPrice: number;
  imageUrl: string | null;
  busyNow: boolean;
  upcoming: number;
  nextBooking: { customerName: string; eventDateLabel: string } | null;
  situation: {
    text: string;
    chipClass: string;
    bar: string;
    inAiCatalog: boolean;
  };
};

type Filter = "ALL" | "AI" | "SCHEDULED" | "MAINTENANCE";
type PendingAction =
  | { kind: "status"; toy: ToyCardData; status: string }
  | { kind: "remove"; toy: ToyCardData };

function PhotoSubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!canSubmit || pending}
      aria-busy={pending}
      className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Enviando..." : "Salvar foto"}
    </button>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function ConfirmDialog({
  pending,
  onClose,
}: {
  pending: PendingAction | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (pending && dialog && !dialog.open) {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      scrollLocked.current = true;
      dialog.showModal();
    } else if (!pending && dialog?.open) {
      dialog.close();
    }
    return () => {
      if (dialog?.open) dialog.close();
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
  }, [pending]);

  function restorePage() {
    if (scrollLocked.current) {
      document.body.style.overflow = previousOverflow.current;
      scrollLocked.current = false;
    }
  }

  if (!pending) {
    return (
      <dialog ref={dialogRef} className="hidden" aria-hidden>
        <span />
      </dialog>
    );
  }

  const isStatus = pending.kind === "status";
  const statusLabel = isStatus ? label(TOY_STATUS, pending.status) : "";
  const statusDescription =
    isStatus && pending.status === "MAINTENANCE"
      ? "Durante a manutenção, este brinquedo fica fora do catálogo da IA."
      : isStatus && pending.toy.status === "RETIRED"
        ? "O brinquedo voltará ao catálogo com o status escolhido."
        : "A situação do brinquedo será atualizada imediatamente.";

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        if (submitting) event.preventDefault();
      }}
      onClose={() => {
        restorePage();
        onClose();
      }}
      onClick={(event) => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (submitting) return;
        const rect = dialog.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) dialog.close();
      }}
      aria-labelledby="toy-confirm-title"
      aria-describedby="toy-confirm-description"
      aria-modal="true"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-2xl ${
              isStatus ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"
            }`}
          >
            {isStatus ? <Check className="size-5" aria-hidden /> : <AlertTriangle className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h2 id="toy-confirm-title" className="font-extrabold">
              {isStatus ? `Mudar para ${statusLabel}?` : `Remover ${pending.toy.name}?`}
            </h2>
            <p id="toy-confirm-description" className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
              {isStatus
                ? statusDescription
                : "Sem reservas no histórico, ele será excluído. Se já foi usado, sairá do catálogo, mas o histórico será preservado."}
            </p>
          </div>
        </div>

        <form
          action={async (formData) => {
            setSubmitting(true);
            if (isStatus) {
              await setToyStatus(formData);
              setSubmitting(false);
              onClose();
              return;
            }
            await removeToy(formData);
          }}
          className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
        >
          <input type="hidden" name="id" value={pending.toy.id} />
          {isStatus && <input type="hidden" name="status" value={pending.status} />}
          <button
            type="button"
            disabled={submitting}
            onClick={() => dialogRef.current?.close()}
            className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <SubmitButton
            pendingText={isStatus ? "Atualizando..." : "Removendo..."}
            className={`rounded-full px-5 py-2.5 text-sm font-bold text-white hover:brightness-95 ${
              isStatus ? "bg-[var(--color-primary)]" : "bg-red-600"
            }`}
          >
            {isStatus ? "Confirmar status" : "Confirmar remoção"}
          </SubmitButton>
        </form>
      </div>
    </dialog>
  );
}

function PhotoDialog({
  toy,
  errorCode,
  onClose,
}: {
  toy: ToyCardData | null;
  errorCode?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [hideServerError, setHideServerError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (toy && dialog && !dialog.open) {
      setHideServerError(false);
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      scrollLocked.current = true;
      dialog.showModal();
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else if (!toy && dialog?.open) {
      dialog.close();
    }
    return () => {
      if (dialog?.open) dialog.close();
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
  }, [toy]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function restorePage() {
    if (scrollLocked.current) {
      document.body.style.overflow = previousOverflow.current;
      scrollLocked.current = false;
    }
    setSelectedFile(null);
    setClientError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function chooseFile(file: File | null) {
    setSelectedFile(null);
    setClientError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });

    if (!file) return;
    setHideServerError(true);
    if (file.size === 0) {
      setClientError("A imagem escolhida está vazia.");
      return;
    }
    if (!PHOTO_TYPES.includes(file.type)) {
      setClientError("Use uma imagem JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setClientError("A imagem deve ter no máximo 4 MB.");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        restorePage();
        onClose();
      }}
      onClick={(event) => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const rect = dialog.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) dialog.close();
      }}
      aria-labelledby="toy-photo-title"
      aria-describedby="toy-photo-description"
      aria-modal="true"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      {toy && (
        <>
          <div className="border-b border-black/5 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                  <ImagePlus className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="toy-photo-title" className="truncate font-extrabold">
                    Trocar foto
                  </h2>
                  <p id="toy-photo-description" className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                    {toy.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Fechar troca de foto"
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          <form action={uploadToyPhoto} className="space-y-4 p-5">
            <input type="hidden" name="id" value={toy.id} />

            {!hideServerError && errorCode && PHOTO_ERRORS[errorCode] && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                {PHOTO_ERRORS[errorCode]}
              </p>
            )}

            <div className="overflow-hidden rounded-2xl border border-dashed border-black/10 bg-[var(--color-surface)]">
              {previewUrl || toy.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl ?? toy.imageUrl ?? ""}
                  alt={previewUrl ? "Prévia da nova foto" : `Foto atual de ${toy.name}`}
                  className="h-48 w-full object-cover"
                />
              ) : (
                <div className="grid h-48 place-items-center text-center text-[var(--color-muted)]">
                  <div>
                    <Camera className="mx-auto size-7" aria-hidden />
                    <p className="mt-2 text-xs font-semibold">Sem foto cadastrada</p>
                  </div>
                </div>
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Nova imagem</span>
              <input
                ref={inputRef}
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-black/10 bg-white text-xs text-[var(--color-muted)] file:mr-3 file:border-0 file:border-r file:border-black/5 file:bg-[var(--color-surface)] file:px-3 file:py-2.5 file:text-xs file:font-bold file:text-[var(--color-ink)]"
              />
            </label>

            <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-700">
              JPG, PNG ou WebP, com no máximo 4 MB. A imagem será recortada visualmente para caber nos cards.
            </div>

            {selectedFile && (
              <p className="text-xs text-[var(--color-muted)]">
                <b className="text-[var(--color-ink)]">{selectedFile.name}</b>
                {" · "}
                {(selectedFile.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB
              </p>
            )}
            {clientError && (
              <p role="alert" className="text-sm font-semibold text-red-600">
                {clientError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)]"
              >
                Cancelar
              </button>
              <PhotoSubmitButton canSubmit={Boolean(selectedFile) && !clientError} />
            </div>
          </form>
        </>
      )}
    </dialog>
  );
}

/** Edição do cadastro: nome, categoria, valores e descrição. Foto e status têm botão próprio. */
function EditDialog({
  toy,
  showError,
  onClose,
}: {
  toy: ToyCardData | null;
  showError: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (toy && dialog && !dialog.open) {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      scrollLocked.current = true;
      dialog.showModal();
      window.setTimeout(() => nameRef.current?.focus(), 0);
    } else if (!toy && dialog?.open) {
      dialog.close();
    }
    return () => {
      if (dialog?.open) dialog.close();
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
  }, [toy]);

  function restorePage() {
    if (scrollLocked.current) {
      document.body.style.overflow = previousOverflow.current;
      scrollLocked.current = false;
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        restorePage();
        onClose();
      }}
      onClick={(event) => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const rect = dialog.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) dialog.close();
      }}
      aria-labelledby="toy-edit-title"
      aria-modal="true"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      {toy && (
        <>
          <div className="border-b border-black/5 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
                  <Pencil className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 id="toy-edit-title" className="font-extrabold">
                    Editar brinquedo
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{toy.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Fechar edição"
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {/*
            `key` força o React a recriar os campos ao trocar de brinquedo — sem
            isso os defaultValue ficariam presos no primeiro que foi aberto.
          */}
          <form key={toy.id} action={updateToy} className="space-y-4 p-5">
            <input type="hidden" name="id" value={toy.id} />

            {showError && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                Alterações não salvas. Confira os campos abaixo.
              </p>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Nome</span>
              <input
                ref={nameRef}
                name="name"
                required
                defaultValue={toy.name}
                className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Categoria</span>
              <select
                name="category"
                defaultValue={toy.category}
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
                    required
                    defaultValue={toy.purchasePrice}
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
                    required
                    defaultValue={toy.defaultRentPrice}
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
                defaultValue={toy.description ?? ""}
                placeholder="Informações que ajudam a apresentar o brinquedo"
                className="w-full resize-none rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-700">
              O que você salvar aqui vale também para o site e para a IA. Foto e situação
              continuam nos botões do card.
            </p>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)]"
              >
                Cancelar
              </button>
              <SubmitButton
                pendingText="Salvando..."
                className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
              >
                Salvar alterações
              </SubmitButton>
            </div>
          </form>
        </>
      )}
    </dialog>
  );
}

function ToyCard({
  toy,
  onConfirm,
  onPhoto,
  onEdit,
}: {
  toy: ToyCardData;
  onConfirm: (action: PendingAction) => void;
  onPhoto: (toy: ToyCardData) => void;
  onEdit: (toy: ToyCardData) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState(toy.status === "RETIRED" ? "" : toy.status);

  useEffect(() => {
    setSelectedStatus(toy.status === "RETIRED" ? "" : toy.status);
  }, [toy.status]);

  const statusChanged = Boolean(selectedStatus) && selectedStatus !== toy.status;

  return (
    <article
      style={{ borderLeftColor: toy.situation.bar }}
      className={`flex min-w-0 flex-col rounded-2xl border border-black/5 border-l-4 bg-white p-3.5 shadow-sm ${
        toy.status === "RETIRED" ? "opacity-70" : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={() => onPhoto(toy)}
          aria-label={`Trocar foto de ${toy.name}`}
          title="Trocar foto"
          className="group relative size-16 shrink-0 overflow-hidden rounded-xl bg-[var(--color-surface)] outline-none ring-blue-300 transition focus-visible:ring-2"
        >
          {toy.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={toy.imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-2xl" aria-hidden>
              🎈
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 grid h-6 place-items-center bg-slate-950/65 text-white opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
            <Camera className="size-3.5" aria-hidden />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h2 className="max-w-full truncate text-sm font-extrabold sm:text-base">{toy.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toy.situation.chipClass}`}>
              {toy.situation.text}
            </span>
            {!toy.situation.inAiCatalog && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                <Bot className="size-3" aria-hidden />
                fora da IA
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {toy.categoryLabel} · <b className="text-[var(--color-ink)]">{toy.priceLabel}</b>
          </p>
          {toy.description && (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[var(--color-muted)]">{toy.description}</p>
          )}
        </div>
      </div>

      <div className="mt-3 min-h-9 rounded-xl bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-muted)]">
        {toy.nextBooking ? (
          <>
            Próxima: <b className="text-[var(--color-ink)]">{toy.nextBooking.customerName}</b>
            {" · "}
            {toy.nextBooking.eventDateLabel}
          </>
        ) : (
          "Nenhuma reserva futura"
        )}
      </div>

      <div className="mt-auto flex min-w-0 flex-wrap items-center gap-2 pt-3">
        <select
          value={selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
          aria-label={`Status de ${toy.name}`}
          className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-2.5 py-2 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          {toy.status === "RETIRED" && (
            <option value="" disabled>
              Escolha para reativar
            </option>
          )}
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {label(TOY_STATUS, status)}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={!statusChanged}
          onClick={() => {
            if (selectedStatus) onConfirm({ kind: "status", toy, status: selectedStatus });
          }}
          aria-label={`Confirmar novo status de ${toy.name}`}
          title={statusChanged ? "Confirmar novo status" : "Escolha outro status"}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[var(--color-primary)] transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Check className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => onEdit(toy)}
          aria-label={`Editar ${toy.name}`}
          title="Editar brinquedo"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-black/10 text-[var(--color-ink)] transition hover:bg-[var(--color-surface)]"
        >
          <Pencil className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => onConfirm({ kind: "remove", toy })}
          aria-label={`Remover ${toy.name}`}
          title="Remover brinquedo"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-red-100 text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}

export function ToysCatalog({
  toys,
  photoErrorCode,
  photoErrorToyId,
  editErrorToyId,
}: {
  toys: ToyCardData[];
  photoErrorCode?: string;
  photoErrorToyId?: string;
  editErrorToyId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [photoToy, setPhotoToy] = useState<ToyCardData | null>(null);
  const [photoErrorConsumed, setPhotoErrorConsumed] = useState(false);
  const [editToy, setEditToy] = useState<ToyCardData | null>(null);
  const [editErrorConsumed, setEditErrorConsumed] = useState(false);

  useEffect(() => {
    if (photoErrorConsumed || !photoErrorToyId) return;
    const toy = toys.find((item) => item.id === photoErrorToyId);
    if (toy) setPhotoToy(toy);
  }, [photoErrorConsumed, photoErrorToyId, toys]);

  // Validação falhou no servidor: reabre a edição no brinquedo certo.
  useEffect(() => {
    if (editErrorConsumed || !editErrorToyId) return;
    const toy = toys.find((item) => item.id === editErrorToyId);
    if (toy) setEditToy(toy);
  }, [editErrorConsumed, editErrorToyId, toys]);

  /**
   * Aposentado sai do catálogo principal e vai para a gaveta do rodapé: ele não
   * volta a ser alugado, então poluía a lista do dia a dia. Continua acessível
   * (e reativável pelo select do card) porque o histórico de reservas depende dele.
   */
  const [activeToys, retiredToys] = useMemo(
    () => [
      toys.filter((toy) => toy.status !== "RETIRED"),
      toys.filter((toy) => toy.status === "RETIRED"),
    ],
    [toys],
  );

  const filterCounts = useMemo(
    () => ({
      ALL: activeToys.length,
      AI: activeToys.filter((toy) => toy.situation.inAiCatalog).length,
      SCHEDULED: activeToys.filter((toy) => toy.busyNow || toy.upcoming > 0).length,
      MAINTENANCE: activeToys.filter((toy) => toy.status === "MAINTENANCE").length,
    }),
    [activeToys],
  );

  const visibleToys = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return activeToys.filter((toy) => {
      const matchesQuery =
        !normalizedQuery ||
        normalize(`${toy.name} ${toy.categoryLabel} ${toy.description ?? ""}`).includes(normalizedQuery);
      const matchesFilter =
        filter === "ALL" ||
        (filter === "AI" && toy.situation.inAiCatalog) ||
        (filter === "SCHEDULED" && (toy.busyNow || toy.upcoming > 0)) ||
        (filter === "MAINTENANCE" && toy.status === "MAINTENANCE");
      return matchesQuery && matchesFilter;
    });
  }, [activeToys, filter, query]);

  const filters: { id: Filter; label: string }[] = [
    { id: "ALL", label: "Todos" },
    { id: "AI", label: "Catálogo IA" },
    { id: "SCHEDULED", label: "Agendados" },
    { id: "MAINTENANCE", label: "Manutenção" },
  ];

  return (
    <>
      <section aria-label="Filtros dos brinquedos" className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]"
              aria-hidden
            />
            <span className="sr-only">Buscar brinquedo</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nome, categoria ou descrição"
              className="w-full rounded-xl border border-black/10 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Filtrar catálogo">
            {filters.map((item) => {
              const active = filter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full px-3 py-2 text-xs font-bold transition ${
                    active
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  {item.label} <span className={active ? "text-white/80" : "text-[var(--color-muted)]"}>{filterCounts[item.id]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {visibleToys.length > 0 ? (
        <section aria-label="Lista de brinquedos" className="grid min-w-0 gap-3 md:grid-cols-2">
          {visibleToys.map((toy) => (
            <ToyCard key={toy.id} toy={toy} onConfirm={setPending} onPhoto={setPhotoToy} onEdit={setEditToy} />
          ))}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-5 py-10 text-center">
          <Search className="mx-auto size-6 text-[var(--color-muted)]" aria-hidden />
          <p className="mt-2 text-sm font-bold">Nenhum brinquedo encontrado</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Ajuste a busca ou escolha outro filtro.</p>
        </div>
      )}

      {retiredToys.length > 0 && (
        <details className="group rounded-2xl border border-black/5 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--color-muted)]">
            <Archive className="size-4 shrink-0" aria-hidden />
            Aposentados
            <span className="tabular-nums opacity-60">{retiredToys.length}</span>
            <span className="ml-auto text-xs font-semibold opacity-70 group-open:hidden">mostrar</span>
            <span className="ml-auto hidden text-xs font-semibold opacity-70 group-open:inline">ocultar</span>
          </summary>
          <div className="border-t border-black/5 p-3">
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Fora do site e da IA. Ficam guardados porque as reservas antigas dependem deles —
              para trazer um de volta, escolha um status no card e confirme.
            </p>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              {retiredToys.map((toy) => (
                <ToyCard key={toy.id} toy={toy} onConfirm={setPending} onPhoto={setPhotoToy} onEdit={setEditToy} />
              ))}
            </div>
          </div>
        </details>
      )}

      <ConfirmDialog pending={pending} onClose={() => setPending(null)} />
      <PhotoDialog
        toy={photoToy}
        errorCode={
          !photoErrorConsumed && photoToy?.id === photoErrorToyId ? photoErrorCode : undefined
        }
        onClose={() => {
          setPhotoToy(null);
          if (photoErrorCode) {
            setPhotoErrorConsumed(true);
            router.replace("/admin/brinquedos", { scroll: false });
          }
        }}
      />
      <EditDialog
        toy={editToy}
        showError={!editErrorConsumed && Boolean(editErrorToyId) && editToy?.id === editErrorToyId}
        onClose={() => {
          setEditToy(null);
          if (editErrorToyId) {
            setEditErrorConsumed(true);
            router.replace("/admin/brinquedos", { scroll: false });
          }
        }}
      />
    </>
  );
}
