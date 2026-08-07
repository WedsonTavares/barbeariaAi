import Link from "next/link";
import { CalendarPlus } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { brl, fmtDateTime } from "@/lib/format";
import { APPOINTMENT_STATUS, ERRO_AGENDAMENTO, label } from "@/lib/labels";
import { createAppointmentAction, setAppointmentStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES = ["CONFIRMED", "ARRIVED", "IN_SERVICE", "COMPLETED", "NO_SHOW", "CANCELED"];

export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; tel?: string; nome?: string }>;
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
        <Link href="/admin/agenda" className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold hover:bg-[var(--color-surface)]">
          Ver agenda
        </Link>
      </header>

      {sp.ok === "criado" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Agendamento criado.
        </p>
      )}
      {sp.erro && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          {label(ERRO_AGENDAMENTO, sp.erro)}
        </p>
      )}

      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-bold">Novo agendamento</h2>
        <form action={createAppointmentAction} className="mt-4 grid gap-3 lg:grid-cols-6">
          <select name="customerId" defaultValue="" className="rounded-xl border border-black/10 px-3 py-2 text-sm lg:col-span-2">
            <option value="">Novo cliente pelo telefone</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>
            ))}
          </select>
          <input name="name" defaultValue={sp.nome ?? ""} placeholder="Nome do cliente" className="rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <input name="phone" defaultValue={sp.tel ?? ""} placeholder="WhatsApp" className="rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <input name="startAt" required type="datetime-local" className="rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <select name="professionalId" defaultValue="" className="rounded-xl border border-black/10 px-3 py-2 text-sm">
            <option value="">Sem profissional</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>{professional.name}</option>
            ))}
          </select>
          <div className="lg:col-span-6">
            <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Serviços</span>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.map((service) => (
                <label key={service.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2 text-sm">
                  <span>
                    <span className="block font-semibold">{service.name}</span>
                    <span className="text-xs text-[var(--color-muted)]">{service.durationMinutes} min · {brl(service.defaultPrice)}</span>
                  </span>
                  <input type="checkbox" name="serviceIds" value={service.id} className="size-4 accent-[var(--color-primary)]" />
                </label>
              ))}
            </div>
          </div>
          <textarea name="notes" placeholder="Observações" className="min-h-20 rounded-xl border border-black/10 px-3 py-2 text-sm lg:col-span-5" />
          <button className="self-start rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Agendar</button>
        </form>
      </section>

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
