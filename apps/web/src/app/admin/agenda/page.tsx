import { CalendarRange } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { brl } from "@/lib/format";
import { APPOINTMENT_STATUS, ERRO_AGENDAMENTO, label } from "@/lib/labels";
import { NewAppointmentDialog } from "../agendamentos/NewAppointmentDialog";
import { AgendaCalendar, type AgendaEvent } from "./AgendaCalendar";

export const dynamic = "force-dynamic";

const EVENT_COLORS: Record<string, { color: string; contrastColor: string }> = {
  REQUESTED: { color: "#f97316", contrastColor: "#ffffff" },
  CONFIRMED: { color: "#2563eb", contrastColor: "#ffffff" },
  ARRIVED: { color: "#ca8a04", contrastColor: "#ffffff" },
  IN_SERVICE: { color: "#7c3aed", contrastColor: "#ffffff" },
  COMPLETED: { color: "#059669", contrastColor: "#ffffff" },
  NO_SHOW: { color: "#64748b", contrastColor: "#ffffff" },
  CANCELED: { color: "#dc2626", contrastColor: "#ffffff" },
};

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; data?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const initialDate = validDate(sp.data);
  const blocksSince = new Date(initialDate ? `${initialDate}T00:00:00-03:00` : Date.now());
  blocksSince.setDate(blocksSince.getDate() - 45);
  const [appointments, blocks, catalog, professionals, customers] = await Promise.all([
    services.appointmentService.list(tenant.id),
    services.scheduleService.listTimeOff(tenant.id, undefined, blocksSince),
    services.serviceCatalogService.active(tenant.id),
    services.professionalService.active(tenant.id),
    services.customerService.list(tenant.id),
  ]);

  const appointmentEvents: AgendaEvent[] = appointments.map((appointment) => {
    const serviceNames = appointment.services.map((item) => item.serviceNameSnapshot);
    const colors = EVENT_COLORS[appointment.status] ?? EVENT_COLORS.CONFIRMED!;

    return {
      id: appointment.id,
      title: appointment.customer.name,
      start: appointment.startAt.toISOString(),
      end: appointment.endAt.toISOString(),
      color: colors.color,
      contrastColor: colors.contrastColor,
      extendedProps: {
        customer: appointment.customer.name,
        professional: appointment.professional?.name ?? "Sem profissional",
        services: serviceNames.join(", ") || "Serviço",
        status: label(APPOINTMENT_STATUS, appointment.status),
      },
    };
  });
  const professionalNames = new Map(professionals.map((professional) => [professional.id, professional.name]));
  const blockEvents: AgendaEvent[] = blocks.map((block) => ({
    id: `block:${block.id}`,
    title: block.reason || (block.googleEventId ? "Ocupado no Google" : "Horário bloqueado"),
    start: block.startAt.toISOString(),
    end: block.endAt.toISOString(),
    color: block.googleEventId ? "#475569" : "#d97706",
    contrastColor: "#ffffff",
    extendedProps: {
      customer: block.reason || (block.googleEventId ? "Ocupado no Google" : "Horário bloqueado"),
      professional: block.professionalId ? professionalNames.get(block.professionalId) ?? "Profissional" : "Toda a equipe",
      services: block.googleEventId ? "Compromisso sincronizado" : "Bloqueio interno",
      status: block.googleEventId ? "Ocupado no Google" : "Horário bloqueado",
    },
  }));
  const events = [...appointmentEvents, ...blockEvents];

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[var(--color-primary)]">
            <CalendarRange className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">Agenda</h1>
            <p className="text-sm text-[var(--color-muted)]">Visualize os atendimentos por mês, semana ou dia.</p>
          </div>
        </div>
        <NewAppointmentDialog
          customers={customers.map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone }))}
          services={catalog.map((service) => ({
            id: service.id,
            name: service.name,
            durationMinutes: service.durationMinutes,
            priceLabel: brl(service.defaultPrice),
          }))}
          professionals={professionals.map((professional) => ({ id: professional.id, name: professional.name }))}
          defaultName=""
          defaultPhone=""
          errorMessage={sp.erro ? label(ERRO_AGENDAMENTO, sp.erro) : undefined}
          initialOpen={Boolean(sp.erro)}
          returnTo="/admin/agenda"
        />
      </header>

      {sp.ok === "criado" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Agendamento criado.
        </p>
      )}

      <AgendaCalendar
        events={events}
        initialDate={initialDate}
        storageKey={`agenda-view:${tenant.id}`}
      />
    </div>
  );
}
