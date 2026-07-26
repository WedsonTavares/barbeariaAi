import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { AgendaCalendar, type Evt } from "./AgendaCalendar";

export const dynamic = "force-dynamic";

const OFFSET_MS = 3 * 3_600_000; // SP = UTC-3 fixo (sem DST desde 2019)
/** Date (UTC) → "YYYY-MM-DD" no dia de São Paulo. */
const spDay = (d: Date) => new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10);
/** Date (UTC) → "HH:mm" no horário de São Paulo. */
const spTime = (d: Date | null) => (d ? new Date(d.getTime() - OFFSET_MS).toISOString().slice(11, 16) : null);

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data } = await searchParams;
  const { tenant } = await requireTenant();
  const bookings = await services.bookingService.list(tenant.id);

  const events: Evt[] = bookings.map((b) => ({
    id: b.id,
    customerName: b.customer.name,
    status: b.status,
    day: spDay(b.eventDate),
    setup: spTime(b.setupTime),
    pickup: spTime(b.pickupTime),
    total: Number(b.total),
    toys: b.items?.map((i) => i.toy.name) ?? [],
  }));

  const todayKey = spDay(new Date());
  const initialDay = data && events.some((event) => event.day === data) ? data : todayKey;

  return <AgendaCalendar events={events} todayKey={todayKey} initialDay={initialDay} />;
}
