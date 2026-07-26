import { withTenant } from "../db/withTenant";
import { spClock, spDayRange } from "../time";

/**
 * Métricas da tela "Visão Geral" (/admin/dashboard).
 *
 * Duas convenções valem para tudo aqui:
 *  - **Reserva fechada pela IA** = `leadSource = WHATSAPP`. Só o agente grava esse
 *    valor (`bookingService.createFromAgent`); o formulário do painel não oferece
 *    o campo, então a marca é confiável para separar IA × equipe.
 *  - **Fora do expediente** usa o `createdAt` da reserva (o instante em que a IA
 *    fechou), lido no fuso de SP. É a métrica que mostra o dinheiro que teria
 *    ficado esperando o telefone abrir no dia seguinte.
 */

const DAY_MS = 86_400_000;

/** Expediente padrão quando o tenant ainda não configurou `businessHours`. */
const DEFAULT_HOURS: BusinessHours = { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5, 6] };

export interface BusinessHours {
  start: string; // "08:00"
  end: string; // "18:00"
  days: number[]; // 0 = domingo
}

export interface OverviewDay {
  /** "2026-07-25" (dia de SP) */
  key: string;
  /** "25/07" */
  label: string;
  /** Conversas de WhatsApp abertas no dia — o funil de verdade entra por aqui. */
  contacts: number;
  /** Registros na tabela Lead (formulário do site / tool de lead da IA). */
  leads: number;
  bookings: number;
  aiBookings: number;
}

export interface OverviewTrend {
  current: number;
  previous: number;
  /** Variação vs. o período anterior de mesmo tamanho. `null` quando não havia base. */
  changePct: number | null;
}

function toMinutes(value: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Lê `TenantSettings.businessHours` (JSON livre) de forma tolerante. */
function parseBusinessHours(raw: unknown): BusinessHours {
  if (!raw || typeof raw !== "object") return DEFAULT_HOURS;
  const o = raw as Record<string, unknown>;
  const start = typeof o.start === "string" ? o.start : DEFAULT_HOURS.start;
  const end = typeof o.end === "string" ? o.end : DEFAULT_HOURS.end;
  const days =
    Array.isArray(o.days) && o.days.every((d) => typeof d === "number")
      ? (o.days as number[])
      : DEFAULT_HOURS.days;
  return { start, end, days };
}

function isAfterHours(at: Date, hours: BusinessHours): boolean {
  const { hour, minute, weekday } = spClock(at);
  if (!hours.days.includes(weekday)) return true;
  const minutes = hour * 60 + minute;
  const open = toMinutes(hours.start, 8 * 60);
  const close = toMinutes(hours.end, 18 * 60);
  return minutes < open || minutes >= close;
}

function trend(current: number, previous: number): OverviewTrend {
  return {
    current,
    previous,
    changePct: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null;
}

export const overviewService = {
  /**
   * Um retrato do negócio no período (padrão: 30 dias), com o período anterior de
   * mesmo tamanho para comparação, e a série diária dos últimos `chartDays`.
   * Tudo numa transação só — o painel faz uma leitura, não catorze.
   */
  summary: (tenantId: string, opts: { days?: number; chartDays?: number; now?: Date } = {}) =>
    withTenant(tenantId, async (tx) => {
      const days = opts.days ?? 30;
      const chartDays = opts.chartDays ?? 14;
      const now = opts.now ?? new Date();

      const periodStart = new Date(now.getTime() - days * DAY_MS);
      const previousStart = new Date(now.getTime() - 2 * days * DAY_MS);
      // A série diária começa na meia-noite de SP do primeiro dia mostrado.
      const chartStart = spDayRange(new Date(now.getTime() - (chartDays - 1) * DAY_MS)).start;
      const since = new Date(Math.min(previousStart.getTime(), chartStart.getTime()));

      const [settings, leadRows, bookingRows, botConversations, conversations, newConversations] = await Promise.all([
        tx.tenantSettings.findUnique({ where: { tenantId }, select: { businessHours: true } }),
        tx.lead.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        tx.booking.findMany({
          where: { createdAt: { gte: since } },
          select: { createdAt: true, status: true, leadSource: true, total: true },
        }),
        // Conversas em que a IA efetivamente respondeu no período.
        tx.message.groupBy({
          by: ["conversationId"],
          where: { sender: "BOT", createdAt: { gte: periodStart } },
        }),
        tx.conversation.findMany({
          where: { lastMessageAt: { gte: periodStart } },
          select: { tags: true, botPaused: true, unread: true },
        }),
        // Contato novo = conversa aberta. É o topo do funil real: a tabela Lead só
        // recebe formulário do site e a tool de lead da IA, então sozinha ela dá 0.
        tx.conversation.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      ]);

      const hours = parseBusinessHours(settings?.businessHours);
      const inPeriod = (at: Date) => at >= periodStart;
      const inPrevious = (at: Date) => at >= previousStart && at < periodStart;

      // ── Topo do funil ────────────────────────────────────────────────────────
      const contacts = trend(
        newConversations.filter((c) => inPeriod(c.createdAt)).length,
        newConversations.filter((c) => inPrevious(c.createdAt)).length
      );
      const leads = trend(
        leadRows.filter((l) => inPeriod(l.createdAt)).length,
        leadRows.filter((l) => inPrevious(l.createdAt)).length
      );

      // ── Agendamentos (canceladas não contam como agendamento) ─────────────────
      const active = bookingRows.filter((b) => b.status !== "CANCELED");
      const periodBookings = active.filter((b) => inPeriod(b.createdAt));
      const bookings = trend(periodBookings.length, active.filter((b) => inPrevious(b.createdAt)).length);

      // ── IA ───────────────────────────────────────────────────────────────────
      const aiAll = active.filter((b) => b.leadSource === "WHATSAPP");
      const aiPeriod = aiAll.filter((b) => inPeriod(b.createdAt));
      const aiBookings = trend(aiPeriod.length, aiAll.filter((b) => inPrevious(b.createdAt)).length);

      const afterHoursRows = aiPeriod.filter((b) => isAfterHours(b.createdAt, hours));
      const afterHoursPrev = aiAll.filter((b) => inPrevious(b.createdAt) && isAfterHours(b.createdAt, hours));
      const afterHours = trend(afterHoursRows.length, afterHoursPrev.length);

      const attended = botConversations.length;
      const escalated = conversations.filter((c) => c.tags.includes("atendimento-humano")).length;
      const waiting = conversations.filter(
        (c) => c.unread > 0 && (c.botPaused || c.tags.includes("atendimento-humano"))
      ).length;

      // ── Série diária ─────────────────────────────────────────────────────────
      const buckets = new Map<string, OverviewDay>();
      for (let i = chartDays - 1; i >= 0; i--) {
        const { dayKey } = spClock(new Date(now.getTime() - i * DAY_MS));
        const [, month, day] = dayKey.split("-");
        buckets.set(dayKey, { key: dayKey, label: `${day}/${month}`, contacts: 0, leads: 0, bookings: 0, aiBookings: 0 });
      }
      for (const c of newConversations) {
        const b = buckets.get(spClock(c.createdAt).dayKey);
        if (b) b.contacts++;
      }
      for (const l of leadRows) {
        const b = buckets.get(spClock(l.createdAt).dayKey);
        if (b) b.leads++;
      }
      for (const bk of active) {
        const b = buckets.get(spClock(bk.createdAt).dayKey);
        if (!b) continue;
        b.bookings++;
        if (bk.leadSource === "WHATSAPP") b.aiBookings++;
      }

      return {
        periodDays: days,
        businessHours: hours,
        contacts,
        leads,
        bookings,
        ai: {
          bookings: aiBookings,
          afterHours,
          /** Fatia dos agendamentos do período que a IA fechou sozinha (%). */
          sharePct: ratio(aiPeriod.length, periodBookings.length),
          revenue: aiPeriod.reduce((sum, b) => sum + Number(b.total), 0),
          afterHoursRevenue: afterHoursRows.reduce((sum, b) => sum + Number(b.total), 0),
          /** Conversas em que a IA respondeu no período. */
          attended,
          /** Dessas, quantas acabaram na mão de um humano. */
          escalated,
          /** Conversas paradas com humano e com mensagem não lida. */
          waiting,
          /** Conversas atendidas que viraram reserva (%). */
          conversionPct: ratio(aiPeriod.length, attended),
          /** Conversas resolvidas sem precisar de gente (%). */
          autonomyPct: attended > 0 ? ratio(Math.max(0, attended - escalated), attended) : null,
        },
        daily: [...buckets.values()],
      };
    }),
};

export type OverviewSummary = Awaited<ReturnType<typeof overviewService.summary>>;
