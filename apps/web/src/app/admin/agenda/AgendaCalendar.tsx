"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { BookingModal } from "./BookingModal";
import { LEGEND, ui } from "./status";

export type Evt = {
  id: string;
  customerName: string;
  status: string;
  day: string;   // YYYY-MM-DD no fuso de SP
  setup: string | null;  // HH:mm
  pickup: string | null; // HH:mm
  total: number;
  toys: string[];
};

type View = "dia" | "semana" | "mes";
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** Calendário da agenda: dia/semana/mês, cores por status e reserva em tela cheia. */
export function AgendaCalendar({ events, todayKey }: { events: Evt[]; todayKey: string }) {
  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(() => {
    const [y, m, d] = todayKey.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!));
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const router = useRouter();

  const byDay = useMemo(() => {
    const map = new Map<string, Evt[]>();
    for (const e of events) {
      if (!map.has(e.day)) map.set(e.day, []);
      map.get(e.day)!.push(e);
    }
    for (const list of map.values()) list.sort((a, b) => (a.setup ?? "").localeCompare(b.setup ?? ""));
    return map;
  }, [events]);

  const step = (dir: number) => {
    if (view === "dia") setCursor((c) => addDays(c, dir));
    else if (view === "semana") setCursor((c) => addDays(c, dir * 7));
    else setCursor((c) => new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + dir, 1)));
  };
  const goToday = () => {
    const [y, m, d] = todayKey.split("-").map(Number);
    setCursor(new Date(Date.UTC(y!, m! - 1, d!)));
  };

  const title = (() => {
    if (view === "mes") return `${MESES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;
    if (view === "dia") return cursor.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" });
    const start = addDays(cursor, -cursor.getUTCDay());
    const end = addDays(start, 6);
    return `${pad(start.getUTCDate())}/${pad(start.getUTCMonth() + 1)} – ${pad(end.getUTCDate())}/${pad(end.getUTCMonth() + 1)}`;
  })();

  const EventChip = ({ e, compact = false }: { e: Evt; compact?: boolean }) => {
    const s = ui(e.status);
    return (
      <button
        onClick={() => setOpenId(e.id)}
        title={`${e.customerName} — ${s.label}`}
        style={{ borderLeftColor: s.bar }}
        className={`w-full overflow-hidden rounded-md border-l-4 bg-white px-1.5 text-left shadow-sm transition hover:shadow-md ${
          compact ? "py-1" : "py-1.5"
        } ${e.status === "CANCELED" ? "opacity-60" : ""}`}
      >
        <div className={`truncate font-semibold leading-tight ${compact ? "text-[11px]" : "text-xs"}`}>
          {e.setup && <span className="text-[var(--color-muted)]">{e.setup} </span>}
          {e.customerName}
        </div>
        {!compact && (
          <div className="truncate text-[10px] text-[var(--color-muted)]">
            {e.toys.length ? e.toys.join(", ") : s.label}
          </div>
        )}
      </button>
    );
  };

  const DayCell = ({ dayKey, dayNum, dim }: { dayKey: string; dayNum: number; dim?: boolean }) => {
    const list = byDay.get(dayKey) ?? [];
    const isToday = dayKey === todayKey;
    return (
      <div className={`flex min-h-24 flex-col rounded-xl border p-1.5 ${
        isToday ? "border-[var(--color-primary)] bg-blue-50/40" : "border-black/5 bg-[var(--color-surface)]"
      } ${dim ? "opacity-40" : ""}`}>
        <div className={`text-xs font-bold ${isToday ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{dayNum}</div>
        <div className="mt-1 space-y-1">
          {list.slice(0, 3).map((e) => <EventChip key={e.id} e={e} compact />)}
          {list.length > 3 && (
            <button onClick={() => { setView("dia"); const [y, m, d] = dayKey.split("-").map(Number); setCursor(new Date(Date.UTC(y!, m! - 1, d!))); }}
              className="w-full rounded-md px-1.5 py-0.5 text-left text-[10px] font-bold text-[var(--color-primary)] hover:bg-black/5">
              +{list.length - 3} mais
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Agenda</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Clique numa festa para abrir a reserva.</p>
        </div>
        <Link href="/admin/reservas" className="flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
          <Plus className="size-4" /> Nova reserva
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button onClick={() => step(-1)} aria-label="Anterior" className="grid size-9 place-items-center rounded-full border border-black/10 hover:bg-[var(--color-surface)]">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-44 text-center font-bold capitalize">{title}</span>
          <button onClick={() => step(1)} aria-label="Próximo" className="grid size-9 place-items-center rounded-full border border-black/10 hover:bg-[var(--color-surface)]">
            <ChevronRight className="size-4" />
          </button>
          <button onClick={goToday} className="rounded-full border border-black/10 px-3 py-1.5 text-sm font-semibold hover:bg-[var(--color-surface)]">Hoje</button>
        </div>

        <div className="flex rounded-full border border-black/10 bg-white p-0.5">
          {(["dia", "semana", "mes"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition ${
                view === v ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              }`}
            >
              {v === "mes" ? "mês" : v}
            </button>
          ))}
        </div>
      </div>

      {/* MÊS */}
      {view === "mes" && (() => {
        const y = cursor.getUTCFullYear(), mo = cursor.getUTCMonth();
        const first = new Date(Date.UTC(y, mo, 1));
        const start = addDays(first, -first.getUTCDay());
        const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        // quantas semanas o mês ocupa (evita uma 6ª linha vazia)
        const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        const weeks = Math.ceil((first.getUTCDay() + daysInMonth) / 7);
        return (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 text-center text-xs font-bold text-[var(--color-muted)]">
                {DIAS.map((d) => <div key={d} className="p-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.slice(0, weeks * 7).map((d) => (
                  <DayCell key={key(d)} dayKey={key(d)} dayNum={d.getUTCDate()} dim={d.getUTCMonth() !== mo} />
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* SEMANA */}
      {view === "semana" && (() => {
        const start = addDays(cursor, -cursor.getUTCDay());
        const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
        return (
          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-7 gap-1">
              {days.map((d) => {
                const k = key(d);
                const list = byDay.get(k) ?? [];
                const isToday = k === todayKey;
                return (
                  <div key={k} className={`flex min-h-64 flex-col rounded-xl border p-2 ${isToday ? "border-[var(--color-primary)] bg-blue-50/40" : "border-black/5 bg-[var(--color-surface)]"}`}>
                    <div className="text-center text-xs font-bold text-[var(--color-muted)]">{DIAS[d.getUTCDay()]}</div>
                    <div className={`text-center text-lg font-extrabold ${isToday ? "text-[var(--color-primary)]" : ""}`}>{d.getUTCDate()}</div>
                    <div className="mt-2 space-y-1">
                      {list.map((e) => <EventChip key={e.id} e={e} />)}
                      {list.length === 0 && <p className="pt-4 text-center text-[10px] text-[var(--color-muted)]">livre</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* DIA */}
      {view === "dia" && (() => {
        const k = key(cursor);
        const list = byDay.get(k) ?? [];
        return (
          <div className="mt-4 space-y-2">
            {list.map((e) => {
              const s = ui(e.status);
              return (
                <button
                  key={e.id}
                  onClick={() => setOpenId(e.id)}
                  style={{ borderLeftColor: s.bar }}
                  className="flex w-full items-center gap-3 rounded-xl border border-black/5 border-l-4 bg-white p-3 text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-sm font-extrabold">{e.setup ?? "—"}</div>
                    <div className="text-[10px] text-[var(--color-muted)]">até {e.pickup ?? "—"}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{e.customerName}</div>
                    <div className="truncate text-xs text-[var(--color-muted)]">{e.toys.join(", ") || "sem brinquedos"}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${s.chip}`}>{s.label}</span>
                </button>
              );
            })}
            {list.length === 0 && (
              <p className="rounded-2xl border border-dashed border-black/10 p-10 text-center text-[var(--color-muted)]">
                Nenhuma festa nesse dia.
              </p>
            )}
          </div>
        );
      })()}

      {/* legenda */}
      <div className="mt-5 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.bar }} /> {l.label}
          </span>
        ))}
      </div>

      {openId && <BookingModal id={openId} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />}
    </div>
  );
}
