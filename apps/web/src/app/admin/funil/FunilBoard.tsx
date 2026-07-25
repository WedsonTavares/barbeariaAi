"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
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

/** Colunas do funil: rótulo + cor da faixa. A ordem é a do quadro. */
/** Cada coluna tem um tom suave: o card herda a cor da etapa em que está. */
const COLUMNS = [
  { key: "IA_ATENDENDO",   label: "IA atendendo",   accent: "#7C3AED", card: "bg-violet-50/70 border-violet-200/70",   hint: "Dinha conduzindo" },
  { key: "SUPORTE_HUMANO", label: "Suporte humano", accent: "#EF4444", card: "bg-red-50/70 border-red-200/70",         hint: "IA pausada" },
  { key: "AGENDADO",       label: "Agendado",       accent: "#16A34A", card: "bg-green-50/70 border-green-200/70",     hint: "Festa fechada" },
  { key: "POS_FESTA",      label: "Pós-festa",      accent: "#0891B2", card: "bg-cyan-50/70 border-cyan-200/70",       hint: "Acompanhamento" },
] as const;

const STAGE_TAGS = ["novo-lead", "atendimento-humano", "agendado", "pos-festa"];

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function FunilBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState<Board>(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; tags?: boolean } | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const prev = useRef<Board | null>(null);

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

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const cards = board[col.key] ?? [];
          const isOver = over === col.key;
          return (
            <section
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setOver(col.key); }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={() => drop(col.key)}
              className={`flex w-60 shrink-0 flex-col rounded-xl border bg-[var(--color-surface)] p-1.5 transition ${
                isOver ? "border-dashed border-black/30 bg-black/5" : "border-black/5"
              }`}
            >
              <header className="flex items-center gap-1.5 px-1.5 py-1.5" title={col.hint}>
                <span className="h-2 w-2 rounded-full" style={{ background: col.accent }} />
                <h2 className="text-[13px] font-bold">{col.label}</h2>
                <span className="ml-auto rounded-full bg-white px-1.5 text-[11px] font-bold leading-5 text-[var(--color-muted)]">
                  {cards.length}
                </span>
              </header>

              <div className="flex min-h-16 flex-col gap-1.5">
                {cards.map((c) => {
                  const livres = c.tags.filter((t) => !STAGE_TAGS.includes(t));
                  return (
                    <article
                      key={c.id}
                      draggable
                      onDragStart={() => setDragging(c.id)}
                      onDragEnd={() => { setDragging(null); setOver(null); }}
                      className={`group/card relative cursor-grab rounded-lg border px-2 py-1.5 shadow-sm transition active:cursor-grabbing ${col.card} ${
                        dragging === c.id ? "opacity-40" : "hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {/* nome: hover mostra prévia, clique abre o workspace */}
                        <div className="group/name relative min-w-0 flex-1">
                          <button
                            onClick={() => setOpen({ id: c.id })}
                            className="block min-w-0 max-w-full truncate text-left text-[13px] font-semibold leading-tight hover:underline"
                          >
                            {c.contactName || c.phone}
                          </button>

                          <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-60 rounded-xl border border-black/10 bg-white p-3 text-left shadow-xl group-hover/name:block">
                            <div className="text-xs font-bold">{c.contactName || "Sem nome"}</div>
                            <div className="text-[11px] text-[var(--color-muted)]">{c.phone}</div>
                            {c.notes && <p className="mt-1 line-clamp-3 text-[11px] text-amber-900">📝 {c.notes}</p>}
                            <div className="mt-2 text-[10px] font-semibold text-[var(--color-primary)]">Clique para abrir</div>
                          </div>
                        </div>

                        {c.botPaused && <span className="shrink-0 text-[10px]" title="IA pausada">⏸</span>}
                        {c.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-[#25D366] px-1.5 text-[10px] font-bold leading-4 text-white">
                            {c.unread}
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                        <span className="truncate">{timeAgo(c.lastMessageAt)}</span>
                        {c.notes && <span title={c.notes}>📝</span>}

                        {/* ícone de tags: hover lista, clique abre o modal */}
                        <span className="group/tag relative ml-auto shrink-0">
                          <button
                            onClick={() => setOpen({ id: c.id, tags: true })}
                            aria-label={livres.length ? `Tags: ${livres.join(", ")}` : "Adicionar tags"}
                            className={`flex items-center gap-0.5 rounded-full px-1 py-0.5 hover:bg-black/5 ${
                              livres.length ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
                            }`}
                          >
                            <Tag className="size-3" />
                            {livres.length > 0 && <span className="text-[10px] font-bold">{livres.length}</span>}
                          </button>
                          <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden w-44 rounded-xl border border-black/10 bg-white p-2 shadow-xl group-hover/tag:block">
                            {livres.length ? (
                              <span className="flex flex-wrap gap-1">
                                {livres.map((t) => (
                                  <span key={t} className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold">{t}</span>
                                ))}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--color-muted)]">Sem tags — clique para adicionar</span>
                            )}
                          </span>
                        </span>
                      </div>
                    </article>
                  );
                })}
                {cards.length === 0 && (
                  <p className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-xs text-[var(--color-muted)]">
                    Arraste um card pra cá
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
