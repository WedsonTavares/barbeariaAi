"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import FullCalendar, { type CalendarRef, type DatesSetInfo, type EventClickInfo, type EventInput } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import ptBrLocale from "@fullcalendar/react/locales/pt-br";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { CalendarDays, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";

import { reloadAgendaAction } from "./actions";
import {
  AgendaEventDialog,
  type AgendaEventDetails,
  type AgendaEventSelection,
  type AgendaProfessionalOption,
  type AgendaServiceOption,
} from "./AgendaEventDialog";
import styles from "./AgendaCalendar.module.css";

type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay";

export type AgendaEvent = EventInput & {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps: AgendaEventDetails;
};
const SP_DAY = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const SP_LONG_DAY = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "America/Sao_Paulo",
});
const SP_DATE_KEY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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

function dateKey(value: Date) {
  const parts = SP_DATE_KEY.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function AgendaCalendar({
  events,
  initialDate,
  storageKey,
  toolbarAction,
  services,
  professionals,
}: {
  events: AgendaEvent[];
  initialDate?: string;
  storageKey: string;
  toolbarAction?: ReactNode;
  services: AgendaServiceOption[];
  professionals: AgendaProfessionalOption[];
}) {
  const calendarRef = useRef<CalendarRef>(null);
  const calendarHostRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const preferencesReady = useRef(false);
  const initialRefreshStarted = useRef(false);
  const refreshInFlight = useRef(false);
  const mounted = useRef(false);
  const router = useRouter();
  const [view, setView] = useState<CalendarView>("dayGridMonth");
  const [title, setTitle] = useState("");
  const [height, setHeight] = useState(680);
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState<AgendaEventSelection | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const refreshAgenda = useCallback(() => {
    if (refreshInFlight.current) return;

    refreshInFlight.current = true;
    setRefreshError(false);
    startRefresh(async () => {
      try {
        const result = await reloadAgendaAction();
        if (mounted.current) setRefreshError(!result.ok);
      } catch {
        if (mounted.current) setRefreshError(true);
      } finally {
        refreshInFlight.current = false;
        if (mounted.current) router.refresh();
      }
    });
  }, [router, startRefresh]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let wasHidden = document.visibilityState === "hidden";

    if (!initialRefreshStarted.current && !wasHidden) {
      initialRefreshStarted.current = true;
      refreshAgenda();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
        return;
      }

      if (wasHidden) {
        wasHidden = false;
        initialRefreshStarted.current = true;
        refreshAgenda();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refreshAgenda]);

  useEffect(() => {
    const resize = () => {
      setCompact(window.innerWidth < 640);
      const top = calendarHostRef.current?.getBoundingClientRect().top ?? 220;
      setHeight(Math.max(500, Math.floor(window.innerHeight - top)));
    };
    resize();
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    if (toolbarRef.current) observer?.observe(toolbarRef.current);
    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    try {
      const savedDate = window.localStorage.getItem(`${storageKey}:date`);
      if (!initialDate && savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
        api?.gotoDate(savedDate);
      }
      const saved = window.localStorage.getItem(storageKey);
      if (isCalendarView(saved)) {
        setView(saved);
        api?.changeView(saved === "timeGridWeek" && window.innerWidth < 640 ? "listWeek" : saved);
      }
    } catch {
      // A agenda continua funcional quando o navegador bloqueia preferências locais.
    } finally {
      preferencesReady.current = true;
    }
  }, [initialDate, storageKey]);

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
    if (preferencesReady.current) {
      try {
        const currentDate = calendarRef.current?.getApi().getDate() ?? info.start;
        window.localStorage.setItem(`${storageKey}:date`, dateKey(currentDate));
      } catch {
        // Navegar pela agenda não depende da persistência local.
      }
    }
  }

  function openEvent(info: EventClickInfo) {
    info.jsEvent.preventDefault();
    setSelected({
      ...(info.event.extendedProps as AgendaEventDetails),
      id: info.event.id,
      start: info.event.start,
      end: info.event.end,
      color: info.event.color,
    });
  }

  return (
    <section className="min-w-0 overflow-hidden border-y border-black/10 bg-white" aria-label="Calendário de agendamentos">
      <div ref={toolbarRef} className="flex flex-wrap items-center gap-2 border-b border-black/10 px-2 py-2 sm:px-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => move("prev")}
              aria-label="Período anterior"
              title="Período anterior"
              className="grid size-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move("today")}
              aria-label="Ir para hoje"
              title="Hoje"
              className="grid size-8 place-items-center rounded-lg border border-black/10 text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <CalendarDays className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => move("next")}
              aria-label="Próximo período"
              title="Próximo período"
              className="grid size-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <h2 className="min-w-0 truncate text-sm font-bold">{title || "Agenda"}</h2>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 max-sm:w-full">
          <button
            type="button"
            onClick={refreshAgenda}
            disabled={refreshing}
            title={refreshError ? "Não foi possível sincronizar. Tente novamente." : "Sincronizar e recarregar a agenda"}
            aria-label="Sincronizar e recarregar a agenda"
            className={`grid size-8 shrink-0 place-items-center rounded-lg border bg-white transition disabled:opacity-50 ${
              refreshError
                ? "border-red-300 text-red-600"
                : "border-black/10 text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
            }`}
          >
            <RotateCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <div className="grid min-w-0 flex-1 grid-cols-3 rounded-lg border border-black/10 bg-[var(--color-surface)] p-0.5 sm:flex-none" aria-label="Modo de visualização">
            {VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeView(option.value)}
                aria-pressed={view === option.value}
                className={`h-7 px-2 text-xs font-bold transition ${
                  view === option.value
                    ? "rounded-md bg-white text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {toolbarAction}
        </div>
      </div>

      <div ref={calendarHostRef} className={styles.calendar}>
        <FullCalendar
          ref={calendarRef}
          class={styles.fullCalendar}
          plugins={[dayGridPlugin, listPlugin, timeGridPlugin, classicThemePlugin]}
          locale={ptBrLocale}
          initialView="dayGridMonth"
          initialDate={initialDate}
          timeZone="America/Sao_Paulo"
          headerToolbar={false}
          expandRows
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

      <AgendaEventDialog
        selection={selected}
        services={services}
        professionals={professionals}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}
