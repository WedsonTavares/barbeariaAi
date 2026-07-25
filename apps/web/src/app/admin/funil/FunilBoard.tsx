"use client";
import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { moveCardAction } from "./actions";

export type Card = {
  id: string;
  phone: string;
  contactName: string | null;
  tags: string[];
  botPaused: boolean;
  unread: number;
  lastMessageAt: string;
};
export type Board = Record<string, Card[]>;

/** Colunas do funil: rótulo + cor da faixa. A ordem é a do quadro. */
const COLUMNS = [
  { key: "NOVO_LEAD", label: "Novo lead", accent: "#2563EB", hint: "Chegou agora" },
  { key: "IA_ATENDENDO", label: "IA atendendo", accent: "#7C3AED", hint: "Dinha conduzindo" },
  { key: "SUPORTE_HUMANO", label: "Suporte humano", accent: "#F59E0B", hint: "IA pausada" },
  { key: "AGENDADO", label: "Agendado", accent: "#16A34A", hint: "Festa fechada" },
  { key: "POS_FESTA", label: "Pós-festa", accent: "#0891B2", hint: "Acompanhamento" },
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
  const [, startTransition] = useTransition();
  // guarda o estado anterior pra desfazer se o servidor recusar
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

    // move na hora (otimista) e persiste em segundo plano
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
            className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-[var(--color-surface)] p-2 transition ${
              isOver ? "border-dashed border-black/30 bg-black/5" : "border-black/5"
            }`}
          >
            <header className="flex items-center gap-2 px-2 py-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.accent }} />
              <h2 className="text-sm font-bold">{col.label}</h2>
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[var(--color-muted)]">
                {cards.length}
              </span>
            </header>
            <p className="px-2 pb-2 text-[11px] text-[var(--color-muted)]">{col.hint}</p>

            <div className="flex min-h-24 flex-col gap-2">
              {cards.map((c) => (
                <article
                  key={c.id}
                  draggable
                  onDragStart={() => setDragging(c.id)}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  className={`group cursor-grab rounded-xl border border-black/5 bg-white p-3 shadow-sm transition active:cursor-grabbing ${
                    dragging === c.id ? "opacity-40" : "hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/admin/conversas/${c.id}`}
                      draggable={false}
                      className="min-w-0 font-semibold hover:underline"
                    >
                      {c.contactName || c.phone}
                    </Link>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-[#25D366] px-2 py-0.5 text-[11px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    {c.phone} · {timeAgo(c.lastMessageAt)}
                  </div>
                  {(() => {
                    const livres = c.tags.filter((t) => !STAGE_TAGS.includes(t));
                    return livres.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {livres.map((t) => (
                          <span key={t} className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  {c.botPaused && (
                    <div className="mt-2 text-[10px] font-bold text-amber-700">IA pausada</div>
                  )}
                </article>
              ))}
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
  );
}
