"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Check, ImagePlus, Trash2 } from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { moveEventPhoto, removeEventPhoto, updateEventPhotoCaption, uploadEventPhoto } from "./actions";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type PhotoCard = {
  id: string;
  imageUrl: string;
  caption: string;
};

/** Envio de uma foto nova, com prévia local antes de subir. */
function UploadCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function escolher(file: File | null) {
    setErro(null);
    setNome(null);
    setPreview((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
    if (!file) return;

    if (file.size === 0) return setErro("A imagem escolhida está vazia.");
    if (!PHOTO_TYPES.includes(file.type)) return setErro("Use uma imagem JPG, PNG ou WebP.");
    if (file.size > MAX_PHOTO_BYTES) return setErro("A imagem deve ter no máximo 4 MB.");

    setNome(file.name);
    setPreview(URL.createObjectURL(file));
  }

  return (
    <form
      action={async (formData) => {
        await uploadEventPhoto(formData);
        // Só chega aqui se a action não redirecionou (não acontece hoje),
        // mas limpar o input evita reenviar a mesma foto sem querer.
        if (inputRef.current) inputRef.current.value = "";
      }}
      className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-600">
          <ImagePlus className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-extrabold">Adicionar foto</h2>
          <p className="text-xs text-[var(--color-muted)]">JPG, PNG ou WebP com até 4 MB.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[200px_1fr] md:items-start">
        <div className="overflow-hidden rounded-2xl border border-dashed border-black/10 bg-[var(--color-surface)]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Prévia da foto escolhida" className="h-36 w-full object-cover" />
          ) : (
            <div className="grid h-36 place-items-center text-center text-[var(--color-muted)]">
              <div>
                <Camera className="mx-auto size-6" aria-hidden />
                <p className="mt-1.5 text-[11px] font-semibold">Nenhuma foto escolhida</p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Imagem</span>
            <input
              ref={inputRef}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              required
              onChange={(event) => escolher(event.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-black/10 bg-white text-xs text-[var(--color-muted)] file:mr-3 file:border-0 file:border-r file:border-black/5 file:bg-[var(--color-surface)] file:px-3 file:py-2.5 file:text-xs file:font-bold file:text-[var(--color-ink)]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
              Legenda <span className="font-medium opacity-70">(opcional)</span>
            </span>
            <input
              type="text"
              name="caption"
              maxLength={200}
              placeholder="Ex.: Aniversário da Lorena, 5 anos"
              className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          {nome && <p className="truncate text-xs text-[var(--color-muted)]">{nome}</p>}
          {erro && (
            <p role="alert" className="text-sm font-semibold text-red-600">
              {erro}
            </p>
          )}

          <div className="flex justify-end">
            <SubmitButton
              pendingText="Enviando..."
              disabled={!preview || Boolean(erro)}
              className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
            >
              Publicar no site
            </SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}

function RemoveDialog({ foto, onClose }: { foto: PhotoCard | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (foto && dialog && !dialog.open) dialog.showModal();
    else if (!foto && dialog?.open) dialog.close();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [foto]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="foto-remove-title"
      aria-modal="true"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      {foto && (
        <div className="p-5">
          <h2 id="foto-remove-title" className="font-extrabold">
            Remover esta foto?
          </h2>
          <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
            Ela sai do site e o arquivo é apagado do armazenamento. Não dá para desfazer.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto.imageUrl}
            alt=""
            className="mt-4 h-32 w-full rounded-2xl object-cover"
          />
          <form action={removeEventPhoto} className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="id" value={foto.id} />
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)]"
            >
              Cancelar
            </button>
            <SubmitButton
              pendingText="Removendo..."
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
            >
              Confirmar remoção
            </SubmitButton>
          </form>
        </div>
      )}
    </dialog>
  );
}

function PhotoTile({
  foto,
  posicao,
  total,
  onRemove,
}: {
  foto: PhotoCard;
  posicao: number;
  total: number;
  onRemove: (foto: PhotoCard) => void;
}) {
  const [caption, setCaption] = useState(foto.caption);

  // O servidor é a fonte da verdade: se a legenda mudou por outro caminho
  // (outra aba, outro usuário), o campo acompanha em vez de segurar o antigo.
  useEffect(() => setCaption(foto.caption), [foto.caption]);

  const alterada = caption !== foto.caption;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto.imageUrl} alt={foto.caption || "Foto de evento"} className="h-44 w-full object-cover" />
        <span className="absolute left-2 top-2 rounded-full bg-slate-950/65 px-2 py-0.5 text-[10px] font-bold text-white">
          {posicao + 1}º
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <form action={updateEventPhotoCaption} className="flex min-w-0 items-center gap-2">
          <input type="hidden" name="id" value={foto.id} />
          <input
            type="text"
            name="caption"
            value={caption}
            maxLength={200}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Sem legenda"
            aria-label="Legenda da foto"
            className="min-w-0 flex-1 rounded-xl border border-black/10 px-2.5 py-2 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <SubmitButton
            pendingText="..."
            disabled={!alterada}
            title={alterada ? "Salvar legenda" : "Edite a legenda para salvar"}
            aria-label="Salvar legenda"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[var(--color-primary)] transition hover:bg-blue-100"
          >
            <Check className="size-4" aria-hidden />
          </SubmitButton>
        </form>

        <div className="mt-auto flex items-center gap-2">
          <form action={moveEventPhoto}>
            <input type="hidden" name="id" value={foto.id} />
            <input type="hidden" name="direcao" value="up" />
            <SubmitButton
              pendingText="..."
              disabled={posicao === 0}
              title="Mover para trás"
              aria-label="Mover foto para trás"
              className="grid size-9 place-items-center rounded-full border border-black/10 text-[var(--color-ink)] transition hover:bg-[var(--color-surface)]"
            >
              <ArrowUp className="size-4" aria-hidden />
            </SubmitButton>
          </form>
          <form action={moveEventPhoto}>
            <input type="hidden" name="id" value={foto.id} />
            <input type="hidden" name="direcao" value="down" />
            <SubmitButton
              pendingText="..."
              disabled={posicao === total - 1}
              title="Mover para frente"
              aria-label="Mover foto para frente"
              className="grid size-9 place-items-center rounded-full border border-black/10 text-[var(--color-ink)] transition hover:bg-[var(--color-surface)]"
            >
              <ArrowDown className="size-4" aria-hidden />
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={() => onRemove(foto)}
            title="Remover foto"
            aria-label="Remover foto"
            className="ml-auto grid size-9 place-items-center rounded-full border border-red-100 text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </article>
  );
}

export function GaleriaBoard({ fotos }: { fotos: PhotoCard[] }) {
  const [remover, setRemover] = useState<PhotoCard | null>(null);

  return (
    <>
      <UploadCard />

      {fotos.length > 0 ? (
        <section aria-label="Fotos publicadas" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fotos.map((foto, i) => (
            <PhotoTile key={foto.id} foto={foto} posicao={i} total={fotos.length} onRemove={setRemover} />
          ))}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white px-5 py-10 text-center">
          <Camera className="mx-auto size-6 text-[var(--color-muted)]" aria-hidden />
          <p className="mt-2 text-sm font-bold">Nenhuma foto na galeria</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Envie a primeira foto acima — a seção só aparece no site quando existe pelo menos uma.
          </p>
        </div>
      )}

      <RemoveDialog foto={remover} onClose={() => setRemover(null)} />
    </>
  );
}
