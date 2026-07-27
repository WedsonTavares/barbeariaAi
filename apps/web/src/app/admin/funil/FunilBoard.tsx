"use client";
import { useEffect, useState, useTransition, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tag, Search, Phone, MessageSquare, FileText, Bot, Pause, CalendarDays, ChevronLeft, ChevronRight, Plus, X, RotateCw } from "lucide-react";
import { TAG_CATALOG, STAGE_ONLY_TAGS, normalizeTag } from "@/lib/tags";
import { moveCardAction, toggleTagFromFunilAction } from "./actions";

export type Card = {
  id: string;
  phone: string;
  contactName: string | null;
  tags: string[];
  botPaused: boolean;
  unread: number;
  lastMessageAt: string;
  activeBookingAt: string | null;
  notes?: string | null;
};
export type Board = Record<string, Card[]>;

/** Colunas do funil: cada uma com sua cor de cabeçalho (bloco pastel). */
const COLUMNS = [
  { key: "IA_ATENDENDO",   label: "IA Atendendo",     head: "bg-sky-100 text-sky-900",         hint: "Dinha conduzindo" },
  { key: "SUPORTE_HUMANO", label: "Precisa de Suporte", head: "bg-rose-100 text-rose-900",     hint: "IA pausada" },
  { key: "AGENDADO",       label: "Agendado",         head: "bg-emerald-100 text-emerald-900", hint: "Festa fechada" },
  { key: "POS_FESTA",      label: "Pós-festa",        head: "bg-violet-100 text-violet-900",   hint: "Acompanhamento" },
] as const;


const fmtActivity = (iso: string) => {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
};

const bookingDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "short",
});

const bookingTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const fullDateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

const agendaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const agendaDayKey = (iso: string) => {
  const parts = agendaDay.formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const fmtBooking = (iso: string) => {
  const value = new Date(iso);
  const dateParts = bookingDate.formatToParts(value);
  const day = dateParts.find((part) => part.type === "day")?.value ?? "";
  const month = (dateParts.find((part) => part.type === "month")?.value ?? "").replace(".", "");
  const timeParts = bookingTime.formatToParts(value);
  const hour = timeParts.find((part) => part.type === "hour")?.value ?? "";
  const minute = timeParts.find((part) => part.type === "minute")?.value ?? "";
  return `${day} ${month} · ${minute === "00" ? `${hour}h` : `${hour}:${minute}`}`;
};
export function FunilBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState<Board>(initial);
  // `useState(initial)` só lê o valor inicial UMA vez — sem isto, um
  // `router.refresh()` (ex.: o botão de recarregar) buscaria dado novo no
  // servidor, mas o quadro continuaria mostrando o snapshot velho da primeira
  // carga. Sincroniza sempre que o servidor mandar um `initial` novo.
  useEffect(() => setBoard(initial), [initial]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [tagging, setTagging] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  const [tagPending, startTagTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();
  const prev = useRef<Board | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return board;
    const out: Board = {};
    for (const [stage, cards] of Object.entries(board)) {
      out[stage] = cards.filter(
        (c) =>
          (c.contactName ?? "").toLowerCase().includes(term) ||
          c.phone.includes(term) ||
          c.tags.some((t) => t.includes(term))
      );
    }
    return out;
  }, [board, q]);

  function findCard(id: string): { card: Card; from: string } | null {
    for (const [stage, cards] of Object.entries(board)) {
      const card = cards.find((c) => c.id === id);
      if (card) return { card, from: stage };
    }
    return null;
  }

  function drop(toStage: string) {
    setOver(null);
    const id = dragging;
    setDragging(null);
    if (!id) return;
    const found = findCard(id);
    if (!found || found.from === toStage) return;
    // AGENDADO espelha uma reserva ativa: não entra nem sai por arraste.
    if (found.card.activeBookingAt || toStage === "AGENDADO") return;

    prev.current = board;
    setBoard((b) => ({
      ...b,
      [found.from]: (b[found.from] ?? []).filter((c) => c.id !== id),
      [toStage]: [{ ...found.card }, ...(b[toStage] ?? [])],
    }));
    startTransition(async () => {
      const res = await moveCardAction(id, toStage);
      if (!res?.ok && prev.current) setBoard(prev.current);
    });
  }

  function applyTagChange(id: string, changed: { tags: string[]; stage: string; botPaused: boolean }) {
    setBoard((current) => {
      const found = Object.entries(current).find(([, cards]) => cards.some((card) => card.id === id));
      if (!found) return current;

      const [fromStage, cards] = found;
      const card = cards.find((item) => item.id === id)!;
      const updated = { ...card, tags: changed.tags, botPaused: changed.botPaused };
      // Assumir/devolver muda apenas quem responde; uma reserva ativa continua
      // visualmente na coluna AGENDADO.
      const targetStage = card.activeBookingAt
        ? "AGENDADO"
        : changed.stage === "AGENDADO"
          ? (changed.tags.includes("atendimento-humano") ? "SUPORTE_HUMANO" : "IA_ATENDENDO")
          : changed.stage;

      if (fromStage === targetStage) {
        return {
          ...current,
          [fromStage]: cards.map((item) => (item.id === id ? updated : item)),
        };
      }

      return {
        ...current,
        [fromStage]: cards.filter((item) => item.id !== id),
        [targetStage]: [updated, ...(current[targetStage] ?? [])],
      };
    });
  }

  function toggleCardTag(id: string, tag: string, on: boolean) {
    startTagTransition(async () => {
      const result = await toggleTagFromFunilAction(id, tag, on);
      if (!result.ok) return;
      applyTagChange(id, result);
      router.refresh();
    });
  }

  const totalCards = Object.values(board).reduce((n, c) => n + c.length, 0);
  const tagCard = tagging ? findCard(tagging)?.card ?? null : null;

  return (
    <>
      {/* barra de ferramentas */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-muted)]">
          {totalCards} conversa{totalCards === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar conversas"
              className="w-full rounded-lg border border-black/10 bg-white py-2 pl-9 pr-3 text-sm sm:w-64"
            />
          </div>
          <button
            type="button"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            title="Recarregar os leads"
            aria-label="Recarregar os leads"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-black/10 bg-white text-[var(--color-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            <RotateCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const cards = filtered[col.key] ?? [];
          const all = board[col.key] ?? [];
          const unread = all.reduce((n, c) => n + c.unread, 0);
          const isOver = over === col.key;
          const isCollapsed = collapsed[col.key];

          if (isCollapsed) {
            return (
              <section key={col.key} className="flex w-12 shrink-0 flex-col">
                <button
                  onClick={() => setCollapsed((s) => ({ ...s, [col.key]: false }))}
                  className={`flex h-full min-h-32 flex-col items-center gap-2 rounded-lg px-2 py-3 ${col.head}`}
                  aria-label={`Expandir ${col.label}`}
                >
                  <ChevronRight className="size-4" />
                  <span className="text-xs font-bold [writing-mode:vertical-rl]">{col.label}</span>
                  <span className="rounded-full bg-white/70 px-1.5 text-[11px] font-bold">{all.length}</span>
                </button>
              </section>
            );
          }

          return (
            <section
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={() => drop(col.key)}
              className="flex w-72 shrink-0 flex-col"
            >
              {/* cabeçalho colorido */}
              <header className={`rounded-lg px-3 py-2 ${col.head}`} title={col.hint}>
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-bold">{col.label}</h2>
                  <button
                    onClick={() => setCollapsed((s) => ({ ...s, [col.key]: true }))}
                    aria-label={`Recolher ${col.label}`}
                    className="ml-auto rounded p-0.5 hover:bg-black/10"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[11px] font-semibold opacity-80">
                  <span>{all.length} conversa{all.length === 1 ? "" : "s"}</span>
                  <span>{unread} não lida{unread === 1 ? "" : "s"}</span>
                </div>
              </header>

              {/* lista de cards */}
              <div className={`mt-2 flex max-h-[calc(100vh-16rem)] min-h-24 flex-col gap-2 overflow-y-auto rounded-lg p-0.5 transition ${
                isOver ? "bg-black/5 outline-2 outline-dashed outline-black/20" : ""
              }`}>
                {cards.map((c) => {
                  const livres = c.tags.filter((t) => !STAGE_ONLY_TAGS.has(t));
                  const iaDesligada = c.tags.includes("desligar-ia");
                  const outrasTags = livres.filter((tag) => tag !== "desligar-ia");
                  return (
                    <article
                      key={c.id}
                      draggable={!c.activeBookingAt}
                      onDragStart={() => setDragging(c.id)}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                      className={`rounded-lg border border-black/10 bg-white p-3 shadow-sm transition ${
                        c.activeBookingAt ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                      } ${
                        dragging === c.id ? "opacity-40" : "hover:shadow-md"
                      }`}
                    >
                      {/* título + última atividade */}
                      <div className="flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <Link
                            href={`/admin/conversas?c=${c.id}`}
                            draggable={false}
                            className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline"
                          >
                            {c.contactName || c.phone}
                          </Link>
                          {iaDesligada && (
                            <span className="shrink-0 rounded bg-red-50 px-1 py-0.5 text-[9px] font-bold leading-none text-red-600">
                              IA desligada
                            </span>
                          )}
                        </div>
                        <span
                          suppressHydrationWarning
                          className="shrink-0 text-[10px] font-medium text-[var(--color-muted)]"
                          title={`Última interação: ${fullDateTime.format(new Date(c.lastMessageAt))}`}
                        >
                          {fmtActivity(c.lastMessageAt)}
                        </span>
                      </div>

                      {/* linha de dado */}
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="font-semibold text-[var(--color-muted)]">Telefone:</span>
                        <span className="text-[var(--color-muted)]">{c.phone}</span>
                      </div>

                      {/* barra de ícones */}
                      <div className="mt-2 flex items-center gap-3 border-t border-black/5 pt-2 text-[var(--color-muted)]">
                        <a
                          href={`https://wa.me/${c.phone}`}
                          target="_blank"
                          rel="noreferrer"
                          draggable={false}
                          title="Abrir no WhatsApp"
                          className="hover:text-[var(--color-primary)]"
                        >
                          <Phone className="size-4" />
                        </a>
                        <Link
                          href={`/admin/conversas?c=${c.id}`}
                          draggable={false}
                          title="Abrir em Conversas"
                          className="relative hover:text-[var(--color-primary)]"
                        >
                          <MessageSquare className="size-4" />
                          {c.unread > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#25D366] px-1 text-[9px] font-bold leading-3 text-white">
                              {c.unread}
                            </span>
                          )}
                        </Link>
                        <button
                          type="button"
                          draggable={false}
                          onClick={() => setTagging(c.id)}
                          title={livres.length ? `Tags: ${livres.join(", ")}` : "Adicionar tags"}
                          className={`relative hover:text-[var(--color-primary)] ${livres.length ? "text-[var(--color-primary)]" : ""}`}
                        >
                          <Tag className="size-4" />
                          {outrasTags.length > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--color-primary)] px-1 text-[9px] font-bold leading-3 text-white">
                              {outrasTags.length}
                            </span>
                          )}
                        </button>
                        {c.notes && (
                          <Link
                            href={`/admin/conversas?c=${c.id}`}
                            draggable={false}
                            title={c.notes}
                            className="text-amber-600 hover:text-amber-700"
                          >
                            <FileText className="size-4" />
                          </Link>
                        )}
                        {c.activeBookingAt && (
                          <Link
                            href={`/admin/agenda?data=${agendaDayKey(c.activeBookingAt)}`}
                            draggable={false}
                            className="flex items-center gap-0.5 whitespace-nowrap text-[10px] font-semibold text-emerald-700 hover:underline"
                            title={`Abrir na agenda: ${fullDateTime.format(new Date(c.activeBookingAt))}`}
                            aria-label={`Abrir reserva de ${fullDateTime.format(new Date(c.activeBookingAt))} na agenda`}
                          >
                            <span>{fmtBooking(c.activeBookingAt)}</span>
                            <CalendarDays className="size-3" />
                          </Link>
                        )}
                        <span className="ml-auto" title={c.botPaused ? "IA pausada" : "IA ativa"}>
                          {c.botPaused ? <Pause className="size-4 text-rose-500" /> : <Bot className="size-4 text-sky-500" />}
                        </span>
                      </div>
                    </article>
                  );
                })}
                {cards.length === 0 && (
                  <p className="rounded-lg border border-dashed border-black/10 px-3 py-8 text-center text-xs text-[var(--color-muted)]">
                    {q ? "Nada encontrado" : "Arraste um card pra cá"}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {tagCard && (
        <CardTagsDialog
          key={tagCard.id}
          card={tagCard}
          pending={tagPending}
          onClose={() => setTagging(null)}
          onToggle={(tag, on) => toggleCardTag(tagCard.id, tag, on)}
        />
      )}
    </>
  );
}

/** Seletor enxuto do ícone de tag: cada checkbox salva uma única tag na hora. */
function CardTagsDialog({
  card, pending, onClose, onToggle,
}: {
  card: Card;
  pending: boolean;
  onClose: () => void;
  onToggle: (tag: string, on: boolean) => void;
}) {
  const [custom, setCustom] = useState("");
  const extras = card.tags.filter(
    (tag) => !STAGE_ONLY_TAGS.has(tag) && !TAG_CATALOG.some((item) => item.tag === tag)
  );
  const options = [
    ...TAG_CATALOG,
    ...extras.map((tag) => ({ tag, label: tag, hint: undefined })),
  ];

  function addCustom() {
    const tag = normalizeTag(custom);
    if (!tag || card.tags.includes(tag) || STAGE_ONLY_TAGS.has(tag)) {
      setCustom("");
      return;
    }
    onToggle(tag, true);
    setCustom("");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-tags-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="card-tags-title" className="font-bold">Tags</h3>
            <p className="truncate text-xs text-[var(--color-muted)]">{card.contactName || card.phone}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-[var(--color-surface)]">
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Marque ou desmarque. A alteração é salva na hora.
        </p>

        <ul className="mt-2 max-h-64 overflow-y-auto">
          {options.map(({ tag, label, hint }) => {
            const checked = card.tags.includes(tag);
            return (
              <li key={tag}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[var(--color-surface)]">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pending}
                    onChange={(event) => onToggle(tag, event.target.checked)}
                    className="size-4 accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {hint && <span className="shrink-0 text-[9px] font-bold uppercase text-rose-600">{hint}</span>}
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex gap-2 border-t border-black/5 pt-3">
          <input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            placeholder="nova tag"
            className="min-w-0 flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={pending || !custom.trim()}
            aria-label="Adicionar tag"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-white disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <p className="mt-2 text-[10px] text-[var(--color-muted)]">
          Agendado e Pós-festa continuam sendo controlados ao arrastar o card.
        </p>
      </div>
    </div>
  );
}
