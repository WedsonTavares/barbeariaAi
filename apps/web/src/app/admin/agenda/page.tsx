import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { BOOKING_STATUS, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

const OFFSET_MS = 3 * 3_600_000; // SP = UTC-3 fixo
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Cor do chip por status da reserva. */
const DOT: Record<string, string> = {
  LEAD: "bg-amber-400",
  QUOTE_SENT: "bg-amber-400",
  WAITING_DEPOSIT: "bg-amber-500",
  CONFIRMED: "bg-blue-500",
  IN_DELIVERY: "bg-purple-500",
  MOUNTED: "bg-purple-600",
  PICKED_UP: "bg-green-500",
  FINISHED: "bg-green-600",
};

function monthFromParam(m?: string): { y: number; mo: number } {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number);
    if (mo! >= 1 && mo! <= 12) return { y: y!, mo: mo! - 1 };
  }
  const t = new Date(Date.now() - OFFSET_MS); // "agora" visto de SP
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() };
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const { y, mo } = monthFromParam(sp?.m);

  const bookings = await services.bookingService.list(tenant.id);

  // Agrupa por dia (SP): "YYYY-MM-DD" → reservas
  const byDay = new Map<string, typeof bookings>();
  for (const b of bookings) {
    if (b.status === "CANCELED") continue;
    const key = new Date(b.eventDate.getTime() - OFFSET_MS).toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(b);
  }

  const firstWeekday = new Date(Date.UTC(y, mo, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const today = new Date(Date.now() - OFFSET_MS).toISOString().slice(0, 10);

  const prev = mo === 0 ? `${y - 1}-12` : `${y}-${pad(mo)}`;
  const next = mo === 11 ? `${y + 1}-01` : `${y}-${pad(mo + 2)}`;

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Agenda</h1>
        <div className="flex items-center gap-2">
          <Link href={`/admin/agenda?m=${prev}`} aria-label="Mês anterior" className="rounded-full border border-black/10 px-3 py-1.5 font-bold hover:bg-[var(--color-surface)]">←</Link>
          <span className="min-w-40 text-center font-bold">{MESES[mo]} {y}</span>
          <Link href={`/admin/agenda?m=${next}`} aria-label="Próximo mês" className="rounded-full border border-black/10 px-3 py-1.5 font-bold hover:bg-[var(--color-surface)]">→</Link>
          <Link href="/admin/agenda" className="rounded-full border border-black/10 px-3 py-1.5 text-sm font-semibold hover:bg-[var(--color-surface)]">Hoje</Link>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 text-center text-xs font-bold text-[var(--color-muted)]">
            {DIAS.map((d) => <div key={d} className="p-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <div key={`b${i}`} />;
              const key = `${y}-${pad(mo + 1)}-${pad(day)}`;
              const list = byDay.get(key) ?? [];
              const isToday = key === today;
              return (
                <div key={key} className={`min-h-24 rounded-xl border p-1.5 ${isToday ? "border-[var(--color-primary)] bg-blue-50/50" : "border-black/5 bg-white"}`}>
                  <div className={`text-xs font-bold ${isToday ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"}`}>{day}</div>
                  <div className="mt-1 space-y-1">
                    {list.map((b) => (
                      <Link
                        key={b.id}
                        href={`/admin/reservas/${b.id}`}
                        title={`${b.customer.name} — ${label(BOOKING_STATUS, b.status)}`}
                        className="flex items-center gap-1 rounded-md bg-[var(--color-surface)] px-1.5 py-1 text-[11px] font-semibold leading-tight hover:bg-black/10"
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[b.status] ?? "bg-gray-400"}`} aria-hidden />
                        <span className="truncate">{b.customer.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Orçamento/aguardando</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Confirmada</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-500" /> Em operação</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Retirada/finalizada</span>
      </div>
    </div>
  );
}
