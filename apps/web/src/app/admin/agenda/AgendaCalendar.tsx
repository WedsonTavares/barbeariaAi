"use client";

import { useEffect, useRef, useState } from "react";
import FullCalendar, { type CalendarRef, type DatesSetInfo, type EventClickInfo, type EventInput } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import ptBrLocale from "@fullcalendar/react/locales/pt-br";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Scissors, UserRound, X } from "lucide-react";

import styles from "./AgendaCalendar.module.css";

type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay";

export type AgendaEvent = EventInput & {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps: {
    customer: string;
    professional: string;
    services: string;
    status: string;
  };
};

type SelectedEvent = AgendaEvent["extendedProps"] & {
  start: Date | null;
  end: Date | null;
  color: string;
};

const SP_DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const SP_DAY = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const SP_LONG_DAY = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "America/Sao_Paulo",
});

const VIEWS: Array<{ value: CalendarView; label: string }> = [
  { value: "dayGridMonth", label: "Mês" },
  { value: "timeGridWeek", label: "Semana" },
  { value: "timeGridDay", label: "Dia" },
];

function isCalendarView(value: string | null): value is CalendarView {
  return VIEWS.some((view) => view.value === value);
}

export function AgendaCalendar({
  events,
  initialDate,
  storageKey,
}: {
  events: AgendaEvent[];
  initialDate?: string;
  storageKey: string;
}) {
  const calendarRef = useRef<CalendarRef>(null);
  const detailsRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<CalendarView>("dayGridMonth");
  const [title, setTitle] = useState("");
  const [height, setHeight] = useState(680);
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<SelectedEvent | null>(null);

  useEffect(() => {
    const resize = () => {
      const reserved = window.innerWidth < 640 ? 300 : 250;
      setCompact(window.innerWidth < 640);
      setHeight(Math.max(500, Math.min(840, window.innerHeight - reserved)));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (isCalendarView(saved)) {
        setView(saved);
        calendarRef.current?.getApi().changeView(saved === "timeGridWeek" && window.innerWidth < 640 ? "listWeek" : saved);
      }
    } catch {
      // A agenda continua funcional quando o navegador bloqueia preferências locais.
    }
  }, [storageKey]);

  useEffect(() => {
    if (view === "timeGridWeek") {
      calendarRef.current?.getApi().changeView(compact ? "listWeek" : "timeGridWeek");
    }
  }, [compact, view]);

  function changeView(nextView: CalendarView) {
    setView(nextView);
    calendarRef.current?.getApi().changeView(nextView === "timeGridWeek" && compact ? "listWeek" : nextView);
    try {
      window.localStorage.setItem(storageKey, nextView);
    } catch {
      // A troca de visualização não depende da persistência da preferência.
    }
  }

  function move(direction: "prev" | "next" | "today") {
    calendarRef.current?.getApi()[direction]();
  }

  function updateRange(info: DatesSetInfo) {
    if (info.view.type === "timeGridWeek" || info.view.type === "listWeek") {
      const inclusiveEnd = new Date(info.end.getTime() - 1);
      setTitle(`${SP_DAY.format(info.start)} - ${SP_DAY.format(inclusiveEnd)}`);
    } else if (info.view.type === "timeGridDay") {
      const dayTitle = SP_LONG_DAY.format(info.start);
      setTitle(dayTitle.charAt(0).toUpperCase() + dayTitle.slice(1));
    } else {
      setTitle(info.view.title.charAt(0).toUpperCase() + info.view.title.slice(1));
    }
    if (info.view.type === "listWeek") setView("timeGridWeek");
    else if (isCalendarView(info.view.type)) setView(info.view.type);
  }

  function openEvent(info: EventClickInfo) {
    info.jsEvent.preventDefault();
    setSelected({
      ...(info.event.extendedProps as AgendaEvent["extendedProps"]),
      start: info.event.start,
      end: info.event.end,
      color: info.event.color,
    });
    detailsRef.current?.showModal();
  }

  return (
    <section className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm" aria-label="Calendário de agendamentos">
      <div className="flex flex-col gap-3 border-b border-black/10 px-3 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-4">
        <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-start">
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => move("prev")}
              aria-label="Período anterior"
              title="Período anterior"
              className="grid size-9 place-items-center rounded-lg border border-black/10 text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move("today")}
              aria-label="Ir para hoje"
              title="Hoje"
              className="grid size-9 place-items-center rounded-lg border border-black/10 text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <CalendarDays className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move("next")}
              aria-label="Próximo período"
              title="Próximo período"
              className="grid size-9 place-items-center rounded-lg border border-black/10 text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <h2 className="min-w-0 truncate text-sm font-extrabold sm:text-base">{title || "Agenda"}</h2>
        </div>

        <div className="grid grid-cols-3 rounded-lg border border-black/10 bg-[var(--color-surface)] p-1" aria-label="Modo de visualização">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => changeView(option.value)}
              aria-pressed={view === option.value}
              className={`min-h-8 px-3 text-xs font-bold transition sm:text-sm ${
                view === option.value
                  ? "rounded-md bg-white text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.calendar}>
        <FullCalendar
          ref={calendarRef}
          class={styles.fullCalendar}
          plugins={[dayGridPlugin, listPlugin, timeGridPlugin, classicThemePlugin]}
          locale={ptBrLocale}
          initialView="dayGridMonth"
          initialDate={initialDate}
          timeZone="America/Sao_Paulo"
          headerToolbar={false}
          views={{
            dayGridMonth: { dayHeaderFormat: { weekday: "short" } },
            timeGridWeek: {
              dayHeaderFormat: { weekday: "short", day: "2-digit", month: "2-digit" },
            },
            timeGridDay: { dayHeaderFormat: { weekday: "long", day: "2-digit", month: "short" } },
          }}
          events={events}
          datesSet={updateRange}
          height={height}
          firstDay={1}
          nowIndicator
          allDaySlot={false}
          dayMaxEvents={3}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          scrollTime="08:00:00"
          slotDuration="00:30:00"
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          eventClass={styles.event}
          eventClick={openEvent}
          eventContent={(info) => (
            <div className={styles.eventContent}>
              <span className={styles.eventTitle}>
                {info.timeText ? `${info.timeText} ` : ""}{info.event.title}
              </span>
              {info.view.type !== "dayGridMonth" && (
                <span className={styles.eventMeta}>{String(info.event.extendedProps.professional)}</span>
              )}
            </div>
          )}
          eventDidMount={(info) => {
            const details = info.event.extendedProps as AgendaEvent["extendedProps"];
            info.el.title = `${details.customer} | ${details.services} | ${details.professional} | ${details.status}`;
          }}
        />
      </div>

      <dialog
        ref={detailsRef}
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.target === detailsRef.current) detailsRef.current?.close();
        }}
        aria-labelledby="agenda-event-title"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border-0 bg-white p-0 text-[var(--color-ink)] shadow-2xl backdrop:bg-slate-950/45"
      >
        {selected && (
          <div style={{ borderTopColor: selected.color }} className="border-t-4">
            <div className="flex items-start justify-between gap-4 border-b border-black/5 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[var(--color-muted)]">{selected.status}</div>
                <h3 id="agenda-event-title" className="truncate font-extrabold">{selected.customer}</h3>
              </div>
              <button
                type="button"
                onClick={() => detailsRef.current?.close()}
                aria-label="Fechar detalhes"
                title="Fechar"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <dl className="space-y-3 px-4 py-4 text-sm">
              <div className="flex gap-3">
                <Clock3 className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                <div>
                  <dt className="sr-only">Horário</dt>
                  <dd>{selected.start ? SP_DATE_TIME.format(selected.start) : "Horário indisponível"}{selected.end ? ` até ${SP_DATE_TIME.format(selected.end).split(" ").at(-1)}` : ""}</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <UserRound className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                <div>
                  <dt className="sr-only">Profissional</dt>
                  <dd>{selected.professional}</dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Scissors className="mt-0.5 size-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
                <div>
                  <dt className="sr-only">Serviços</dt>
                  <dd>{selected.services}</dd>
                </div>
              </div>
            </dl>
          </div>
        )}
      </dialog>
    </section>
  );
}
