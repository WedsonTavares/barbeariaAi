"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ListChecks, Plus } from "lucide-react";
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
const DIAS_MIN = ["D", "S", "T", "Q", "Q", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/**
 * Calendário da agenda: dia/semana/mês, cores por status e reserva em tela cheia.
 *
 * Layout: ocupa exatamente a altura da janela e distribui as semanas no espaço que
 * sobra — quem rola é o miolo de cada dia, não a página. Nada de rolagem lateral:
 * no celular o mês vira pontinhos coloridos (toque no dia abre a visão de dia) e a
 * semana vira lista vertical, porque 7 colunas de chip não cabem em tela estreita.
 */
export function AgendaCalendar({
  events,
  todayKey,
  initialDay,
}: {
  events: Evt[];
  todayKey: string;
  initialDay: string;
}) {
  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(() => {
    const [y, m, d] = initialDay.split("-").map(Number);
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
  const openDay = (dayKey: string) => {
    const [y, m, d] = dayKey.split("-").map(Number);
    setCursor(new Date(Date.UTC(y!, m! - 1, d!)));
    setView("dia");
  };

  const title = (() => {
    if (view === "mes") return `${MESES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`;
    if (view === "dia") return cursor.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" });
    const start = addDays(cursor, -cursor.getUTCDay());
    const end = addDays(start, 6);
    return `${pad(start.getUTCDate())}/${pad(start.getUTCMonth() + 1)} – ${pad(end.getUTCDate())}/${pad(end.getUTCMonth() + 1)}`;
  })();

  /** Chip de uma festa. `dense` encolhe pra caber nas células do mês. */
  const EventChip = ({ e, dense = false }: { e: Evt; dense?: boolean }) => {
    const s = ui(e.status);
    return (
      <button
        onClick={() => setOpenId(e.id)}
        title={`${e.customerName} — ${s.label}`}
        style={{ borderLeftColor: s.bar }}
        className={`w-full overflow-hidden rounded border-l-[3px] bg-white px-1 text-left shadow-sm transition hover:shadow-md ${
          dense ? "py-px" : "py-1"
        } ${e.status === "CANCELED" ? "opacity-60" : ""}`}
      >
        <div className={`truncate font-semibold leading-tight ${dense ? "text-[10px]" : "text-xs"}`}>
          {e.setup && <span className="text-[var(--color-muted)]">{e.setup} </span>}
          {e.customerName}
        </div>
        {!dense && e.toys.length > 0 && (
          <div className="truncate text-[10px] leading-tight text-[var(--color-muted)]">{e.toys.join(", ")}</div>
        )}
      </button>
    );
  };

  /** Linha da visão de dia / lista da semana no celular. */
  const EventRow = ({ e }: { e: Evt }) => {
    const s = ui(e.status);
    return (
      <button
        onClick={() => setOpenId(e.id)}
        style={{ borderLeftColor: s.bar }}
        className="flex w-full items-center gap-3 rounded-xl border border-black/5 border-l-4 bg-white p-2.5 text-left shadow-sm transition hover:shadow-md"
      >
        <div className="w-14 shrink-0 text-center">
          <div className="text-sm font-extrabold leading-tight">{e.setup ?? "—"}</div>
          <div className="text-[10px] text-[var(--color-muted)]">até {e.pickup ?? "—"}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{e.customerName}</div>
          <div className="truncate text-xs text-[var(--color-muted)]">{e.toys.join(", ") || "sem brinquedos"}</div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>{s.label}</span>
      </button>
    );
  };

  const DayCell = ({ dayKey, dayNum, dim }: { dayKey: string; dayNum: number; dim?: boolean }) => {
    const list = byDay.get(dayKey) ?? [];
    const isToday = dayKey === todayKey;
    return (
      <div
        className={`flex min-h-0 flex-col overflow-hidden rounded-lg border p-1 ${
          isToday ? "border-[var(--color-primary)] bg-blue-50/40" : "border-black/5 bg-[var(--color-surface)]"
        } ${dim ? "opacity-40" : ""}`}
      >
        {/* No celular o dia inteiro é clicável: leva pra visão de dia. */}
        <button
          onClick={() => openDay(dayKey)}
          className={`shrink-0 text-left text-[11px] font-bold leading-none md:cursor-default ${
            isToday ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
          }`}
        >
          {dayNum}
        </button>

        {/* Celular: pontinhos (chip não cabe em coluna de ~45px). */}
        <div className="mt-1 flex flex-wrap gap-0.5 md:hidden">
          {list.slice(0, 4).map((e) => (
            <span key={e.id} className="size-1.5 rounded-full" style={{ background: ui(e.status).bar }} aria-hidden />
          ))}
          {list.length > 4 && <span className="text-[8px] font-bold leading-none text-[var(--color-muted)]">+</span>}
        </div>

        {/* Desktop: chips reais, com rolagem própria se o dia estiver cheio. */}
        <div className="mt-0.5 hidden min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto md:flex">
          {list.map((e) => <EventChip key={e.id} e={e} dense />)}
        </div>

        {list.length > 0 && (
          <span className="sr-only">{list.length} festa(s)</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[28rem] flex-col md:h-[calc(100dvh-6.5rem)]">
      {/* Cabeçalho compacto: título + ação, tudo numa faixa só */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold sm:text-2xl">Agenda</h1>
        <div className="flex items-center gap-2">
          {/* A lista completa de reservas vive em outra tela; aqui é só o atalho. */}
          <Link
            href="/admin/reservas"
            className="flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-sm font-semibold text-[var(--color-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
          >
            <ListChecks className="size-4" /> Reservas
          </Link>
          <Link
            href="/admin/reservas?nova=1"
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white"
          >
            <Plus className="size-4" /> Nova reserva
          </Link>
        </div>
      </div>

      {/* Navegação + troca de visão */}
      <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} aria-label="Anterior" className="grid size-8 place-items-center rounded-full border border-black/10 hover:bg-[var(--color-surface)]">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-32 text-center text-sm font-bold capitalize sm:min-w-40">{title}</span>
          <button onClick={() => step(1)} aria-label="Próximo" className="grid size-8 place-items-center rounded-full border border-black/10 hover:bg-[var(--color-surface)]">
            <ChevronRight className="size-4" />
          </button>
          <button onClick={goToday} className="ml-1 rounded-full border border-black/10 px-2.5 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]">
            Hoje
          </button>
        </div>

        <div className="flex rounded-full border border-black/10 bg-white p-0.5">
          {(["dia", "semana", "mes"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize transition sm:px-3 sm:text-sm ${
                view === v ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              }`}
            >
              {v === "mes" ? "mês" : v}
            </button>
          ))}
        </div>
      </div>

      {/* Miolo: ocupa o resto da altura */}
      <div className="mt-2 min-h-0 flex-1">
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
            <div className="flex h-full min-h-0 flex-col">
              <div className="grid shrink-0 grid-cols-7 text-center text-[10px] font-bold text-[var(--color-muted)] sm:text-xs">
                {DIAS.map((d, i) => (
                  <div key={d} className="pb-1">
                    <span className="md:hidden">{DIAS_MIN[i]}</span>
                    <span className="hidden md:inline">{d}</span>
                  </div>
                ))}
              </div>
              {/* As semanas dividem a altura restante em partes iguais */}
              <div
                className="grid min-h-0 flex-1 grid-cols-7 gap-1"
                style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
              >
                {cells.slice(0, weeks * 7).map((d) => (
                  <DayCell key={key(d)} dayKey={key(d)} dayNum={d.getUTCDate()} dim={d.getUTCMonth() !== mo} />
                ))}
              </div>
            </div>
          );
        })()}

        {/* SEMANA */}
        {view === "semana" && (() => {
          const start = addDays(cursor, -cursor.getUTCDay());
          const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
          return (
            <>
              {/* Celular: lista vertical — 7 colunas não cabem sem rolagem lateral */}
              <div className="h-full min-h-0 space-y-2 overflow-y-auto md:hidden">
                {days.map((d) => {
                  const k = key(d);
                  const list = byDay.get(k) ?? [];
                  const isToday = k === todayKey;
                  return (
                    <div key={k}>
                      <div className={`flex items-baseline gap-1.5 px-0.5 text-xs font-bold ${isToday ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>
                        <span>{DIAS[d.getUTCDay()]}</span>
                        <span className="text-sm">{d.getUTCDate()}</span>
                        {isToday && <span className="text-[10px] font-extrabold">hoje</span>}
                      </div>
                      <div className="mt-1 space-y-1.5">
                        {list.map((e) => <EventRow key={e.id} e={e} />)}
                        {list.length === 0 && (
                          <p className="rounded-lg border border-dashed border-black/10 py-2 text-center text-[11px] text-[var(--color-muted)]">livre</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: 7 colunas ocupando a altura toda */}
              <div className="hidden h-full min-h-0 grid-cols-7 gap-1 md:grid">
                {days.map((d) => {
                  const k = key(d);
                  const list = byDay.get(k) ?? [];
                  const isToday = k === todayKey;
                  return (
                    <div key={k} className={`flex min-h-0 flex-col overflow-hidden rounded-xl border p-1.5 ${isToday ? "border-[var(--color-primary)] bg-blue-50/40" : "border-black/5 bg-[var(--color-surface)]"}`}>
                      <div className="shrink-0 text-center text-[11px] font-bold text-[var(--color-muted)]">{DIAS[d.getUTCDay()]}</div>
                      <div className={`shrink-0 text-center text-base font-extrabold leading-tight ${isToday ? "text-[var(--color-primary)]" : ""}`}>{d.getUTCDate()}</div>
                      <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                        {list.map((e) => <EventChip key={e.id} e={e} />)}
                        {list.length === 0 && <p className="pt-3 text-center text-[10px] text-[var(--color-muted)]">livre</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* DIA */}
        {view === "dia" && (() => {
          const k = key(cursor);
          const list = byDay.get(k) ?? [];
          return (
            <div className="h-full min-h-0 space-y-2 overflow-y-auto">
              {list.map((e) => <EventRow key={e.id} e={e} />)}
              {list.length === 0 && (
                <p className="rounded-2xl border border-dashed border-black/10 p-8 text-center text-sm text-[var(--color-muted)]">
                  Nenhuma festa nesse dia.
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Legenda: faixa fina, rola na horizontal só ela se faltar espaço */}
      <div className="mt-2 flex shrink-0 gap-3 overflow-x-auto pb-0.5 text-[10px] text-[var(--color-muted)] sm:text-xs">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex shrink-0 items-center gap-1">
            <span className="size-2 rounded-sm" style={{ background: l.bar }} /> {l.label}
          </span>
        ))}
      </div>

      {openId && <BookingModal id={openId} onClose={() => setOpenId(null)} onChanged={() => router.refresh()} />}
    </div>
  );
}
