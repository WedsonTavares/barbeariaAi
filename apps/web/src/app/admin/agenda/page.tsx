import Link from "next/link";
import { CalendarRange } from "lucide-react";

import { services, spClock } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { brl, fmtDateTime } from "@/lib/format";
import { APPOINTMENT_STATUS, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const { tenant } = await requireTenant();
  const appointments = await services.appointmentService.list(tenant.id);
  const upcoming = appointments.filter((appointment) => appointment.status !== "CANCELED" && appointment.endAt >= new Date());
  const grouped = new Map<string, typeof upcoming>();
  for (const appointment of upcoming) {
    const key = spClock(appointment.startAt).dayKey;
    grouped.set(key, [...(grouped.get(key) ?? []), appointment]);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
            <CalendarRange className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">Agenda</h1>
            <p className="text-sm text-[var(--color-muted)]">Próximos atendimentos por dia.</p>
          </div>
        </div>
        <Link href="/admin/agendamentos" className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">
          Novo agendamento
        </Link>
      </header>

      {upcoming.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-[var(--color-muted)]">
          Nenhum atendimento futuro.
        </p>
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([day, items]) => (
            <section key={day} className="rounded-2xl border border-black/5 bg-white shadow-sm">
              <div className="border-b border-black/5 px-4 py-3 font-bold">{day.split("-").reverse().join("/")}</div>
              <ul className="divide-y divide-black/5">
                {items.map((appointment) => (
                  <li key={appointment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-bold">{fmtDateTime(appointment.startAt)} · {appointment.customer.name}</div>
                      <div className="text-sm text-[var(--color-muted)]">
                        {appointment.services.map((item) => item.serviceNameSnapshot).join(", ") || "Serviço"} ·{" "}
                        {appointment.professional?.name ?? "Sem profissional"}
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <div className="text-sm font-extrabold tabular-nums">{brl(appointment.total)}</div>
                      <div className="text-xs text-[var(--color-muted)]">{label(APPOINTMENT_STATUS, appointment.status)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
