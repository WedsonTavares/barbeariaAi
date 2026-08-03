import { CalendarDays } from "lucide-react";

import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { fmtDate } from "@/lib/format";
import { NewBookingDialog } from "./NewBookingDialog";
import { ReservasList, type BookingRow } from "./ReservasList";

export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  conflito: "Conflito: brinquedo já reservado nesse intervalo.",
  validacao: "Confira os campos: dados inválidos ou incompletos.",
  pagamento: "Pagamento não registrado: informe um valor maior que zero.",
  estado: "Essa reserva não pode ser alterada (já encerrada?).",
};
const OKS: Record<string, string> = {
  criada: "Reserva criada!",
  confirmada: "Reserva confirmada — lembretes de retirada agendados.",
  cancelada: "Reserva cancelada e lembretes desligados.",
  pagamento: "Pagamento registrado!",
  editada: "Reserva atualizada — lembretes reagendados se necessário.",
  andamento: "Status atualizado!",
};

const OFFSET_MS = 3 * 3_600_000; // SP = UTC-3 fixo (sem DST desde 2019)
/** Date (UTC) → "YYYY-MM-DD" no dia de São Paulo (mesma conta da Agenda). */
const spDay = (d: Date) => new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10);

export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; nova?: string; tel?: string; nome?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const [bookings, customers, toys] = await Promise.all([
    services.bookingService.list(tenant.id),
    services.customerService.list(tenant.id),
    services.toyService.list(tenant.id),
  ]);

  const rows: BookingRow[] = bookings.map((b) => ({
    id: b.id,
    customerName: b.customer.name,
    status: b.status,
    dateLabel: fmtDate(b.eventDate),
    daySort: spDay(b.eventDate),
  }));

  // Abre o modal já na chegada: atalho da Agenda (?nova=1), atalho "Agendar"
  // de uma conversa (?tel=...) ou volta de erro.
  const telefone = (sp.tel ?? "").replace(/\D/g, "");
  const openNew = sp.nova === "1" || Boolean(telefone) || sp.erro === "validacao" || sp.erro === "conflito";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
            <CalendarDays className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">Reservas</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Clique numa reserva para ver tudo e mudar status ou pagamento.
            </p>
          </div>
        </div>
        <NewBookingDialog
          customers={customers.map((c) => ({ id: c.id, name: c.name }))}
          toys={toys.filter((t) => t.status !== "RETIRED").map((t) => ({ id: t.id, name: t.name }))}
          initialOpen={openNew}
          hasError={sp.erro === "validacao" || sp.erro === "conflito"}
          phone={telefone || undefined}
          contactName={sp.nome}
        />
      </header>

      {sp.ok && OKS[sp.ok] && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          {OKS[sp.ok]}
        </p>
      )}
      {sp.erro && ERROS[sp.erro] && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          {ERROS[sp.erro]}
        </p>
      )}

      <ReservasList rows={rows} todayKey={spDay(new Date())} />
    </div>
  );
}
