"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Search } from "lucide-react";

import { BookingModal } from "../agenda/BookingModal";
import { ui } from "../agenda/status";

export type BookingRow = {
  id: string;
  customerName: string;
  status: string;
  dateLabel: string;
  /** YYYY-MM-DD no fuso de SP — só para ordenar/filtrar, nunca exibido. */
  daySort: string;
};

type Filtro = "proximas" | "todas";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/**
 * Lista de reservas reduzida ao essencial: nome, data e status.
 *
 * Os botões de operação (confirmar, avançar, pagar, cancelar, editar) saíram da
 * linha e vivem no `BookingModal` — o MESMO da Agenda, aberto ao clicar. Nada de
 * ação se perdeu; o que mudou é que a linha voltou a ser legível de relance.
 */
export function ReservasList({ rows, todayKey }: { rows: BookingRow[]; todayKey: string }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("proximas");

  const counts = useMemo(
    () => ({
      proximas: rows.filter((r) => r.daySort >= todayKey).length,
      todas: rows.length,
    }),
    [rows, todayKey],
  );

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    return rows.filter((r) => {
      if (filtro === "proximas" && r.daySort < todayKey) return false;
      if (!needle) return true;
      return normalize(r.customerName).includes(needle);
    });
  }, [filtro, query, rows, todayKey]);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-black/5 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" aria-hidden />
            <span className="sr-only">Buscar reserva pelo cliente</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pelo cliente"
              className="w-full rounded-xl border border-black/10 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div className="flex gap-1 rounded-xl bg-[var(--color-surface)] p-1">
            {([
              { key: "proximas", label: "Próximas" },
              { key: "todas", label: "Todas" },
            ] as const).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFiltro(f.key)}
                aria-pressed={filtro === f.key}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  filtro === f.key
                    ? "bg-white text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {f.label} <span className="ml-0.5 tabular-nums opacity-60">{counts[f.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-black/5">
          {visible.map((r) => {
            const s = ui(r.status);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setOpenId(r.id)}
                style={{ borderLeftColor: s.bar }}
                className="flex w-full items-center gap-3 border-l-4 px-3 py-3 text-left transition hover:bg-slate-50/70 sm:px-4"
              >
                <span className="min-w-0 flex-1 truncate font-bold">{r.customerName}</span>
                <span className="shrink-0 text-sm text-[var(--color-muted)]">{r.dateLabel}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>{s.label}</span>
              </button>
            );
          })}

          {visible.length === 0 && (
            <div className="px-4 py-12 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-muted)]">
                <CalendarDays className="size-5" aria-hidden />
              </span>
              <p className="mt-3 font-bold">
                {rows.length === 0 ? "Nenhuma reserva ainda" : "Nada encontrado"}
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                {rows.length === 0
                  ? 'Use o botão "Nova reserva" para cadastrar a primeira.'
                  : "Tente outro nome ou veja todas as reservas."}
              </p>
            </div>
          )}
        </div>
      </section>

      {openId && (
        <BookingModal id={openId} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />
      )}
    </>
  );
}
