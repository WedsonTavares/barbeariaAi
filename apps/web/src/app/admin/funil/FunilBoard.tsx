"use client";
import { useState, useTransition, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Tag, Search, Phone, MessageSquare, FileText, Bot, Pause, ChevronLeft, ChevronRight } from "lucide-react";
import { initials } from "@/lib/stage";
import { moveCardAction } from "./actions";
import { CardDrawer } from "./CardDrawer";

export type Card = {
  id: string;
  phone: string;
  contactName: string | null;
  tags: string[];
  botPaused: boolean;
  unread: number;
  lastMessageAt: string;
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

/** Tags de etapa não viram chip no card (a coluna já diz isso). */
const STAGE_TAGS = ["novo-lead", "atendimento-humano", "agendado", "pos-festa"];

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}`;
};
export function FunilBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState<Board>(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; tags?: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
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

  const totalCards = Object.values(board).reduce((n, c) => n + c.length, 0);

  return (
    <>
      {/* barra de ferramentas */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--color-muted)]">
          {totalCards} conversa{totalCards === 1 ? "" : "s"}
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar conversas"
            className="w-full rounded-lg border border-black/10 bg-white py-2 pl-9 pr-3 text-sm sm:w-64"
          />
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
                  const livres = c.tags.filter((t) => !STAGE_TAGS.includes(t));
                  return (
                    <article
                      key={c.id}
                      draggable
                      onDragStart={() => setDragging(c.id)}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                      className={`cursor-grab rounded-lg border border-black/10 bg-white p-3 shadow-sm transition active:cursor-grabbing ${
                        dragging === c.id ? "opacity-40" : "hover:shadow-md"
                      }`}
                    >
                      {/* título + avatar */}
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => setOpen({ id: c.id })}
                          className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline"
                        >
                          {c.contactName || c.phone} <span className="font-normal text-[var(--color-muted)]">- {fmtWhen(c.lastMessageAt)}</span>
                        </button>
                        <span
                          className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-[10px] font-bold text-[var(--color-muted)]"
                          title={c.contactName ?? c.phone}
                        >
                          {initials(c.contactName, c.phone)}
                        </span>
                      </div>

                      {/* tags como chips — sempre visíveis */}
                      {livres.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {livres.map((t) => (
                            <span key={t} className="rounded border border-black/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-muted)]">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}

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
                        <button onClick={() => setOpen({ id: c.id })} title="Abrir conversa" className="relative hover:text-[var(--color-primary)]">
                          <MessageSquare className="size-4" />
                          {c.unread > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#25D366] px-1 text-[9px] font-bold leading-3 text-white">
                              {c.unread}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setOpen({ id: c.id, tags: true })}
                          title={livres.length ? `Tags: ${livres.join(", ")}` : "Adicionar tags"}
                          className={`relative hover:text-[var(--color-primary)] ${livres.length ? "text-[var(--color-primary)]" : ""}`}
                        >
                          <Tag className="size-4" />
                          {livres.length > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--color-primary)] px-1 text-[9px] font-bold leading-3 text-white">
                              {livres.length}
                            </span>
                          )}
                        </button>
                        {c.notes && (
                          <button onClick={() => setOpen({ id: c.id })} title={c.notes} className="text-amber-600 hover:text-amber-700">
                            <FileText className="size-4" />
                          </button>
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

      {open && (
        <CardDrawer
          id={open.id}
          openTags={open.tags}
          onClose={() => setOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}
