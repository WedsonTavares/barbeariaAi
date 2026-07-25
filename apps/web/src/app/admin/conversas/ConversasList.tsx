"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { stageUi, initials } from "@/lib/stage";

export type ConversaRow = {
  id: string;
  phone: string;
  contactName: string | null;
  tags: string[];
  botPaused: boolean;
  unread: number;
  stage: string;
  lastMessageAt: string;
};

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Lista de conversas: busca por nome/telefone/tag + card no estilo do CRM (avatar, chip de etapa, tags). */
export function ConversasList({ items }: { items: ConversaRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (c) =>
        (c.contactName ?? "").toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        c.tags.some((t) => t.includes(term))
    );
  }, [items, q]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar por nome, telefone ou tag"
          className="w-full rounded-lg border border-black/10 bg-white py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="mt-3 space-y-2">
        {filtered.map((c) => {
          const s = stageUi(c.stage);
          const tags = c.tags.filter((t) => !["novo-lead", "atendimento-humano", "agendado", "pos-festa"].includes(t));
          return (
            <Link
              key={c.id}
              href={`/admin/conversas/${c.id}`}
              className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 transition hover:shadow-md"
            >
              <span
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-xs font-bold text-[var(--color-muted)]"
                aria-hidden
              >
                {initials(c.contactName, c.phone)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{c.contactName || c.phone}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>{s.label}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <span>{c.phone}</span>
                  <span>· {timeAgo(c.lastMessageAt)}</span>
                  {tags.map((t) => (
                    <span key={t} className="rounded border border-black/10 px-1.5 py-0.5 text-[10px] font-medium">{t}</span>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                {c.unread > 0 && (
                  <span className="rounded-full bg-[#25D366] px-2 py-0.5 text-xs font-bold text-white">{c.unread}</span>
                )}
                {c.botPaused && <span className="text-[10px] font-bold text-rose-600">⏸ IA pausada</span>}
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="rounded-xl border border-dashed border-black/10 px-3 py-8 text-center text-sm text-[var(--color-muted)]">
            Nada encontrado.
          </p>
        )}
      </div>
    </>
  );
}
