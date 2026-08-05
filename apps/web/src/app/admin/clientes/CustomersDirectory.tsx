"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  LockKeyhole,
  MessageCircle,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { SubmitButton } from "@/components/SubmitButton";
import { waUrl } from "@/lib/format";
import { initials } from "@/lib/stage";
import {
  archiveCustomerEntry,
  removeCustomer,
  restoreCustomerEntry,
  updateCustomer,
} from "./actions";

export type CustomerDirectoryItem = {
  key: string;
  kind: "CUSTOMER" | "CONTACT" | "LEAD";
  customerId: string | null;
  conversationId: string | null;
  leadId: string | null;
  name: string;
  phone: string;
  email: string | null;
  neighborhood: string | null;
  address: string | null;
  imageConsent: boolean;
  appointmentCount: number;
  duplicateCount: number;
  source: string | null;
  stage: string | null;
  leadStatus: string | null;
  lastActivityLabel: string;
  archived: boolean;
};

type Filter = "ALL" | "CUSTOMERS" | "NEW";
type CustomerItem = CustomerDirectoryItem & { customerId: string };

const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WEBSITE: "Site",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  GOOGLE: "Google",
  INDICATION: "Indicação",
  PAID_ADS: "Anúncio",
  PARTNER: "Parceiro",
  OTHER: "Outro",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function isCustomer(item: CustomerDirectoryItem): item is CustomerItem {
  return item.kind === "CUSTOMER" && Boolean(item.customerId);
}

function EditCustomerDialog({
  customer,
  showError,
  onClose,
}: {
  customer: CustomerItem | null;
  showError: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (customer && dialog && !dialog.open) {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      scrollLocked.current = true;
      dialog.showModal();
      window.setTimeout(() => nameRef.current?.focus(), 0);
    }
    return () => {
      if (dialog?.open) dialog.close();
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
  }, [customer]);

  function restorePage() {
    if (scrollLocked.current) {
      document.body.style.overflow = previousOverflow.current;
      scrollLocked.current = false;
    }
  }

  if (!customer) return null;

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
      aria-labelledby="edit-customer-title"
      aria-describedby="edit-customer-description"
      aria-modal="true"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      <div className="border-b border-black/5 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
              <Pencil className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 id="edit-customer-title" className="truncate font-extrabold">
                Editar cliente
              </h2>
              <p id="edit-customer-description" className="mt-0.5 text-xs text-[var(--color-muted)]">
                Atualiza o cadastro e o nome exibido na conversa atual.
              </p>
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

      <form key={customer.customerId} action={updateCustomer} className="space-y-4 p-5">
        <input type="hidden" name="id" value={customer.customerId} />
        {showError && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
            Alteração não salva. Confira o nome e o e-mail.
          </p>
        )}

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Nome</span>
          <input
            ref={nameRef}
            name="name"
            required
            defaultValue={customer.name}
            className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">WhatsApp</span>
          <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-[var(--color-surface)] px-3 py-2.5 text-sm">
            <LockKeyhole className="size-3.5 shrink-0 text-[var(--color-muted)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold">{customer.phone}</span>
            <span className="text-[11px] text-[var(--color-muted)]">protegido</span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
            O número liga este cliente às conversas e agendamentos, por isso não é alterado aqui.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
              E-mail <span className="font-normal">(opcional)</span>
            </span>
            <input
              name="email"
              type="email"
              defaultValue={customer.email ?? ""}
              className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Bairro</span>
            <input
              name="neighborhood"
              defaultValue={customer.neighborhood ?? ""}
              className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Endereço</span>
            <input
              name="address"
              defaultValue={customer.address ?? ""}
              className="w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <label className="flex items-start gap-2.5 rounded-xl bg-[var(--color-surface)] px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            name="imageConsent"
            defaultChecked={customer.imageConsent}
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
          />
          <span>
            <span className="font-semibold">Autoriza uso de imagem</span>
            <span className="block text-xs text-[var(--color-muted)]">Consentimento registrado no cadastro.</span>
          </span>
        </label>

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
    </dialog>
  );
}

function RemoveCustomerDialog({
  customer,
  showArchived = false,
  onClose,
}: {
  customer: CustomerItem | null;
  showArchived?: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef("");
  const scrollLocked = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (customer && dialog && !dialog.open) {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      scrollLocked.current = true;
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) dialog.close();
      if (scrollLocked.current) {
        document.body.style.overflow = previousOverflow.current;
        scrollLocked.current = false;
      }
    };
  }, [customer]);

  function restorePage() {
    if (scrollLocked.current) {
      document.body.style.overflow = previousOverflow.current;
      scrollLocked.current = false;
    }
  }

  if (!customer) return null;
  const hasAppointments = customer.appointmentCount > 0;
  const isDuplicate = customer.duplicateCount > 1;

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
        if (!dialog || submitting) return;
        const rect = dialog.getBoundingClientRect();
        const outside =
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (outside) dialog.close();
      }}
      aria-labelledby="remove-customer-title"
      aria-describedby="remove-customer-description"
      aria-modal="true"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="remove-customer-title" className="font-extrabold">
              {hasAppointments ? "Este cadastro não pode ser removido" : `Remover ${customer.name}?`}
            </h2>
            <p id="remove-customer-description" className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
              {hasAppointments
                ? `Há ${customer.appointmentCount} agendamento${customer.appointmentCount === 1 ? "" : "s"} ligado${customer.appointmentCount === 1 ? "" : "s"} a ele. O histórico será preservado.`
                : isDuplicate
                  ? "Existe outro cadastro com o mesmo WhatsApp. Se os dados forem equivalentes, este registro pode ser removido e os vínculos serão mantidos no outro."
                  : "Somente o cadastro será excluído. Se houver conversa, lead ou orçamento ligado a ele, o sistema bloqueará a ação para preservar o histórico."}
            </p>
          </div>
        </div>

        {hasAppointments ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
            >
              Entendi
            </button>
          </div>
        ) : (
          <form
            action={removeCustomer}
            onSubmit={() => setSubmitting(true)}
            className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
          >
            <input type="hidden" name="id" value={customer.customerId} />
            <input type="hidden" name="arquivados" value={showArchived ? "1" : "0"} />
            <button
              type="button"
              disabled={submitting}
              onClick={() => dialogRef.current?.close()}
              className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50"
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
        )}
      </div>
    </dialog>
  );
}

/**
 * Confirmação de arquivar/restaurar. Arquivar é reversível e não apaga nada, por
 * isso o tom é neutro — o vermelho fica reservado para a exclusão definitiva.
 */
function ArchiveDialog({
  item,
  mode,
  onClose,
}: {
  item: CustomerDirectoryItem | null;
  mode: "archive" | "restore";
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (item && dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [item]);

  if (!item) return null;
  const archiving = mode === "archive";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="archive-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
            {archiving ? <Archive className="size-5" aria-hidden /> : <ArchiveRestore className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <h2 id="archive-title" className="font-extrabold">
              {archiving ? `Arquivar ${item.name}?` : `Restaurar ${item.name}?`}
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
              {archiving
                ? "Sai de Clientes, do inbox e do funil. Nada é apagado: agendamentos, conversas e leads continuam guardados, e você pode restaurar quando quiser. Se o contato mandar uma mensagem nova, ele volta sozinho."
                : "Volta para Clientes e para o inbox, do jeito que estava."}
            </p>
          </div>
        </div>

        <form
          action={archiving ? archiveCustomerEntry : restoreCustomerEntry}
          className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
        >
          <input type="hidden" name="customerId" value={item.customerId ?? ""} />
          <input type="hidden" name="conversationId" value={item.conversationId ?? ""} />
          <input type="hidden" name="leadId" value={item.leadId ?? ""} />
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-semibold hover:bg-[var(--color-surface)]"
          >
            Cancelar
          </button>
          <SubmitButton
            pendingText={archiving ? "Arquivando..." : "Restaurando..."}
            className="rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white hover:brightness-95"
          >
            {archiving ? "Arquivar" : "Restaurar"}
          </SubmitButton>
        </form>
      </div>
    </dialog>
  );
}

export function CustomersDirectory({
  items,
  canRemove,
  showArchived = false,
  archivedCount = 0,
  initialEditId,
  editHasError = false,
}: {
  items: CustomerDirectoryItem[];
  canRemove: boolean;
  showArchived?: boolean;
  archivedCount?: number;
  initialEditId?: string;
  editHasError?: boolean;
}) {
  const initialEdit = items.find(
    (item): item is CustomerItem => isCustomer(item) && item.customerId === initialEditId,
  ) ?? null;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState<CustomerItem | null>(initialEdit);
  const [removing, setRemoving] = useState<CustomerItem | null>(null);
  const [archiving, setArchiving] = useState<CustomerDirectoryItem | null>(null);

  const counts = useMemo(
    () => ({
      ALL: items.length,
      CUSTOMERS: items.filter((item) => item.kind === "CUSTOMER").length,
      NEW: items.filter((item) => item.kind !== "CUSTOMER").length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return items.filter((item) => {
      if (filter === "CUSTOMERS" && item.kind !== "CUSTOMER") return false;
      if (filter === "NEW" && item.kind === "CUSTOMER") return false;
      if (!needle) return true;
      return normalize(
        [item.name, item.phone, item.email, item.neighborhood, SOURCE_LABEL[item.source ?? ""]]
          .filter(Boolean)
          .join(" "),
      ).includes(needle);
    });
  }, [filter, items, query]);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "ALL", label: "Todos" },
    { key: "CUSTOMERS", label: "Clientes" },
    { key: "NEW", label: "Novos contatos" },
  ];

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-black/5 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 sm:max-w-md">
            <Search className="size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, telefone, e-mail ou bairro"
              aria-label="Buscar clientes e contatos"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Limpar busca"
                className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-xl bg-[var(--color-surface)] p-1">
            {!showArchived &&
              filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  aria-pressed={filter === item.key}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    filter === item.key
                      ? "bg-white text-[var(--color-ink)] shadow-sm"
                      : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  }`}
                >
                  {item.label} <span className="ml-0.5 tabular-nums opacity-60">{counts[item.key]}</span>
                </button>
              ))}

            {/* Arquivados é outra consulta, não um filtro em memória — por isso é link. */}
            <Link
              href={showArchived ? "/admin/clientes" : "/admin/clientes?arquivados=1"}
              className={`flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                showArchived
                  ? "bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {showArchived ? (
                <>← Voltar</>
              ) : (
                <>
                  <Archive className="size-3.5" aria-hidden /> Arquivados
                  <span className="tabular-nums opacity-60">{archivedCount}</span>
                </>
              )}
            </Link>
          </div>
        </div>

        <div className="divide-y divide-black/5">
          {filtered.map((item) => {
            const customer = isCustomer(item) ? item : null;
            const destination = customer ? `/admin/clientes/${customer.customerId}` : null;

            return (
              <article
                key={item.key}
                className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-slate-50/70 sm:px-4"
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-2xl text-xs font-extrabold ${
                    item.kind === "CUSTOMER"
                      ? "bg-blue-50 text-blue-700"
                      : item.kind === "LEAD"
                        ? "bg-violet-50 text-violet-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {initials(item.name, item.phone)}
                </span>

                {/* Só nome e telefone: o resto (etapa, agendamentos, origem, bairro, e-mail,
                    duplicidade) continua no cadastro e abre ao clicar no nome. */}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  {destination ? (
                    <Link
                      href={destination}
                      className="min-w-0 truncate font-bold hover:text-[var(--color-primary)] hover:underline"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span className="min-w-0 truncate font-bold">{item.name}</span>
                  )}
                  <a
                    href={waUrl(item.phone)}
                    target="_blank"
                    rel="noopener"
                    className="text-xs font-semibold text-[var(--color-muted)] hover:text-[#128C7E] hover:underline"
                  >
                    {item.phone}
                  </a>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  {customer ? (
                    <button
                      type="button"
                      onClick={() => setEditing(customer)}
                      aria-label={`Editar ${customer.name}`}
                      title="Editar cliente"
                      className="grid size-10 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  ) : (
                    <span
                      title="Contato ainda sem cadastro de cliente para editar"
                      className="grid size-10 place-items-center rounded-full text-[var(--color-muted)] opacity-30"
                    >
                      <Pencil className="size-4" aria-hidden />
                      <span className="sr-only">Sem cadastro de cliente para editar</span>
                    </span>
                  )}

                  {item.conversationId ? (
                    <Link
                      href={`/admin/conversas?c=${item.conversationId}`}
                      aria-label={`Abrir conversa com ${item.name}`}
                      title="Abrir conversa"
                      className="grid size-10 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-blue-50 hover:text-blue-700"
                    >
                      <MessageCircle className="size-4" aria-hidden />
                    </Link>
                  ) : (
                    <span
                      title="Ainda não há conversa de WhatsApp com este contato"
                      className="grid size-10 place-items-center rounded-full text-[var(--color-muted)] opacity-30"
                    >
                      <MessageCircle className="size-4" aria-hidden />
                      <span className="sr-only">Sem conversa vinculada</span>
                    </span>
                  )}

                  {/* Arquivar funciona para qualquer linha (cliente, contato ou lead);
                      excluir de vez só faz sentido no cadastro, e só na lixeira. */}
                  {canRemove && !showArchived && (
                    <button
                      type="button"
                      onClick={() => setArchiving(item)}
                      aria-label={`Arquivar ${item.name}`}
                      title="Arquivar (sai do painel, nada é apagado)"
                      className="grid size-10 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-amber-50 hover:text-amber-700"
                    >
                      <Archive className="size-4" aria-hidden />
                    </button>
                  )}

                  {canRemove && showArchived && (
                    <>
                      <button
                        type="button"
                        onClick={() => setArchiving(item)}
                        aria-label={`Restaurar ${item.name}`}
                        title="Restaurar para o painel"
                        className="grid size-10 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <ArchiveRestore className="size-4" aria-hidden />
                      </button>
                      {customer && (
                        <button
                          type="button"
                          onClick={() => setRemoving(customer)}
                          aria-label={`Excluir definitivamente o cadastro de ${customer.name}`}
                          title="Excluir definitivamente"
                          className="grid size-10 place-items-center rounded-full text-[var(--color-muted)] transition hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-4 py-12 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-muted)]">
                <Search className="size-5" aria-hidden />
              </span>
              <p className="mt-3 font-bold">{showArchived ? "Nada arquivado" : "Nenhum resultado"}</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {showArchived
                  ? "Ao arquivar um contato, ele aparece aqui e pode voltar quando você quiser."
                  : "Tente outro nome, telefone ou filtro."}
              </p>
            </div>
          )}
        </div>
      </section>

      <EditCustomerDialog
        customer={editing}
        showError={Boolean(editHasError && editing?.customerId === initialEditId)}
        onClose={() => setEditing(null)}
      />
      <RemoveCustomerDialog
        customer={removing}
        showArchived={showArchived}
        onClose={() => setRemoving(null)}
      />
      <ArchiveDialog
        item={archiving}
        mode={showArchived ? "restore" : "archive"}
        onClose={() => setArchiving(null)}
      />
    </>
  );
}
