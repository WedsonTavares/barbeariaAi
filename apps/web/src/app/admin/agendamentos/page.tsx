import Link from "next/link";
import { CalendarPlus } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { brl, fmtDateTime } from "@/lib/format";
import { APPOINTMENT_STATUS, ERRO_AGENDAMENTO, label } from "@/lib/labels";
import { setAppointmentStatusAction } from "./actions";
import { NewAppointmentDialog } from "./NewAppointmentDialog";

export const dynamic = "force-dynamic";

const STATUSES = ["CONFIRMED", "ARRIVED", "IN_SERVICE", "COMPLETED", "NO_SHOW", "CANCELED"];

export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; tel?: string; nome?: string; novo?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const [appointments, catalog, professionals, customers] = await Promise.all([
    services.appointmentService.list(tenant.id),
    services.serviceCatalogService.active(tenant.id),
    services.professionalService.active(tenant.id),
    services.customerService.list(tenant.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CalendarPlus className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">Agendamentos</h1>
            <p className="text-sm text-[var(--color-muted)]">Crie e acompanhe atendimentos do painel e da IA.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <NewAppointmentDialog
            customers={customers.map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone }))}
            services={catalog.map((service) => ({
              id: service.id,
              name: service.name,
              durationMinutes: service.durationMinutes,
              priceLabel: brl(service.defaultPrice),
            }))}
            professionals={professionals.map((professional) => ({ id: professional.id, name: professional.name }))}
            defaultName={sp.nome ?? ""}
            defaultPhone={sp.tel ?? ""}
            errorMessage={sp.erro ? label(ERRO_AGENDAMENTO, sp.erro) : undefined}
            initialOpen={sp.novo === "1" || Boolean(sp.erro || sp.tel || sp.nome)}
          />
          <Link href="/admin/agenda" className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold hover:bg-[var(--color-surface)]">
            Ver agenda
          </Link>
        </div>
      </header>

      {sp.ok === "criado" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Agendamento criado.
        </p>
      )}
      <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 px-4 py-3 sm:px-5">
          <h2 className="font-bold">Todos os agendamentos</h2>
        </div>
        {appointments.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-muted)]">Nenhum agendamento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-[var(--color-surface)] text-left text-[11px] uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5">Quando</th>
                  <th className="px-3 py-2.5">Serviços</th>
                  <th className="px-3 py-2.5">Profissional</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="border-t border-black/5">
                    <td className="px-4 py-3 font-bold">{appointment.customer.name}</td>
                    <td className="px-3 py-3">{fmtDateTime(appointment.startAt)}</td>
                    <td className="px-3 py-3">{appointment.services.map((item) => item.serviceNameSnapshot).join(", ") || "—"}</td>
                    <td className="px-3 py-3">{appointment.professional?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{brl(appointment.total)}</td>
                    <td className="px-4 py-3">
                      <form action={setAppointmentStatusAction} className="flex gap-2">
                        <input type="hidden" name="id" value={appointment.id} />
                        <select name="status" defaultValue={appointment.status} className="rounded-lg border border-black/10 px-2 py-1 text-xs">
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>{label(APPOINTMENT_STATUS, status)}</option>
                          ))}
                        </select>
                        <button className="rounded-lg border border-black/10 px-2 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]">Salvar</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
