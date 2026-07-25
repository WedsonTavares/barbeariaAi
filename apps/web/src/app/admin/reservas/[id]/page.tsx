import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl, fmtDate } from "@/lib/format";
import { BOOKING_STATUS, PAYMENT_STATUS, label } from "@/lib/labels";
import { updateBooking } from "../actions";

export const dynamic = "force-dynamic";

const OFFSET_MS = 3 * 3_600_000; // SP é UTC-3 fixo (sem DST desde 2019)
/** Date (UTC) → valor de <input type="datetime-local"> no horário de SP. */
const toLocalInput = (d: Date | null) => (d ? new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 16) : "");
/** Date (UTC) → valor de <input type="date"> no dia de SP. */
const toDateInput = (d: Date | null) => (d ? new Date(d.getTime() - OFFSET_MS).toISOString().slice(0, 10) : "");

const ERROS: Record<string, string> = {
  conflito: "Conflito: brinquedo já reservado nesse novo intervalo. Nada foi alterado.",
  validacao: "Confira os campos: dados inválidos ou incompletos.",
  estado: "Essa reserva não pode mais ser editada.",
};

export default async function EditarReservaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { tenant } = await requireTenant();
  const { id } = await params;
  const sp = await searchParams;

  const [booking, toys] = await Promise.all([
    services.bookingService.get(tenant.id, id),
    services.toyService.list(tenant.id),
  ]);

  if (!booking) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold">Reserva não encontrada</h1>
        <Link href="/admin/reservas" className="mt-4 inline-block rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">← Voltar</Link>
      </div>
    );
  }

  const closed = booking.status === "CANCELED" || booking.status === "FINISHED";
  const selectedToyIds = new Set(booking.items.map((i) => i.toyId));
  const paid = booking.payments.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Editar reserva</h1>
        <Link href="/admin/reservas" className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">← Voltar</Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 font-semibold">{label(BOOKING_STATUS, booking.status)}</span>
        <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 font-semibold">{label(PAYMENT_STATUS, booking.paymentStatus)}</span>
        <span className="text-[var(--color-muted)]">Cliente: <b>{booking.customer.name}</b> · Festa: {fmtDate(booking.eventDate)} · Pago: {brl(paid)}</span>
      </div>

      {sp?.erro && ERROS[sp.erro] && (
        <p role="alert" className="mt-4 rounded-lg bg-red-100 p-3 text-sm text-red-700">{ERROS[sp.erro]}</p>
      )}

      {closed ? (
        <p className="mt-6 rounded-lg bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
          Reserva {label(BOOKING_STATUS, booking.status).toLowerCase()} — não pode mais ser editada.
        </p>
      ) : (
        <form action={updateBooking} className="mt-6 space-y-3 rounded-2xl border border-black/5 bg-white p-5">
          <input type="hidden" name="id" value={booking.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-[var(--color-muted)]">Data do evento
              <input name="eventDate" type="date" required defaultValue={toDateInput(booking.eventDate)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" />
            </label>
            <label className="block text-xs text-[var(--color-muted)]">Montagem
              <input name="setupTime" type="datetime-local" required defaultValue={toLocalInput(booking.setupTime)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" />
            </label>
            <label className="block text-xs text-[var(--color-muted)]">Retirada
              <input name="pickupTime" type="datetime-local" required defaultValue={toLocalInput(booking.pickupTime)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="neighborhood" placeholder="Bairro" defaultValue={booking.neighborhood ?? ""} className="w-full rounded-lg border border-black/10 px-3 py-2" />
            <input name="address" placeholder="Endereço" defaultValue={booking.address ?? ""} className="w-full rounded-lg border border-black/10 px-3 py-2" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-[var(--color-muted)]">Valor total
              <input name="total" type="number" step="0.01" min="0" required defaultValue={Number(booking.total)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" />
            </label>
            <label className="block text-xs text-[var(--color-muted)]">Sinal previsto
              <input name="depositAmount" type="number" step="0.01" min="0" defaultValue={Number(booking.depositAmount)} className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" />
            </label>
          </div>
          <fieldset className="rounded-lg border border-black/10 p-3">
            <legend className="px-1 text-xs text-[var(--color-muted)]">Brinquedos</legend>
            {toys
              .filter((t) => t.status !== "RETIRED" || selectedToyIds.has(t.id))
              .map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="toyIds" value={t.id} defaultChecked={selectedToyIds.has(t.id)} /> {t.name}
                </label>
              ))}
          </fieldset>
          <textarea name="notes" rows={2} placeholder="Observações" defaultValue={booking.notes ?? ""} className="w-full rounded-lg border border-black/10 px-3 py-2" />
          <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Salvar alterações</button>
          <p className="text-center text-xs text-[var(--color-muted)]">
            Se mudar a retirada de uma reserva confirmada, os lembretes são reagendados automaticamente.
          </p>
        </form>
      )}
    </div>
  );
}
