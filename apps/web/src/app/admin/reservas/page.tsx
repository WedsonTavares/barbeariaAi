import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";
import { createBooking, confirmBooking, payBooking } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReservasPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const [bookings, customers, toys] = await Promise.all([
    services.bookingService.list(tenant.id),
    services.customerService.list(tenant.id),
    services.toyService.list(tenant.id),
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="text-2xl font-extrabold">Reservas</h1>
        {sp?.erro === "conflito" && <p className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">Conflito: brinquedo já reservado nesse intervalo.</p>}
        {sp?.ok && <p className="mt-3 rounded-lg bg-green-100 p-3 text-sm text-green-700">Reserva criada!</p>}
        <div className="mt-4 space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold">{b.customer.name}</span>
                <span className="text-sm text-[var(--color-muted)]">{b.eventDate.toLocaleDateString("pt-BR")}</span>
              </div>
              <div className="mt-1 text-sm text-[var(--color-muted)]">
                {b.items.map((i) => i.toy.name).join(", ")} · {brl(b.total)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 font-semibold">{b.status}</span>
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 font-semibold">{b.paymentStatus}</span>
                {b.status !== "CONFIRMED" && (
                  <form action={confirmBooking}><input type="hidden" name="id" value={b.id} /><button className="rounded-full bg-[var(--color-primary)] px-3 py-1 font-semibold text-white">Confirmar</button></form>
                )}
                <form action={payBooking} className="flex items-center gap-1">
                  <input type="hidden" name="id" value={b.id} />
                  <input name="amount" type="number" step="0.01" placeholder="sinal" className="w-24 rounded border border-black/10 px-2 py-1" />
                  <button className="rounded-full bg-[#25D366] px-3 py-1 font-semibold text-white">Registrar</button>
                </form>
              </div>
            </div>
          ))}
          {bookings.length === 0 && <p className="text-[var(--color-muted)]">Nenhuma reserva ainda.</p>}
        </div>
      </div>

      <form action={createBooking} className="h-fit space-y-3 rounded-2xl border border-black/5 bg-white p-5">
        <h2 className="font-bold">Nova reserva</h2>
        <select name="customerId" required className="w-full rounded-lg border border-black/10 px-3 py-2">
          <option value="">Cliente...</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="block text-xs text-[var(--color-muted)]">Data do evento<input name="eventDate" type="date" required className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" /></label>
        <label className="block text-xs text-[var(--color-muted)]">Montagem<input name="setupTime" type="datetime-local" required className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" /></label>
        <label className="block text-xs text-[var(--color-muted)]">Retirada<input name="pickupTime" type="datetime-local" required className="mt-1 w-full rounded-lg border border-black/10 px-3 py-2" /></label>
        <input name="neighborhood" placeholder="Bairro" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="total" type="number" step="0.01" placeholder="Valor total" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="depositAmount" type="number" step="0.01" placeholder="Sinal previsto" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <fieldset className="rounded-lg border border-black/10 p-3">
          <legend className="px-1 text-xs text-[var(--color-muted)]">Brinquedos</legend>
          {toys.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="toyIds" value={t.id} /> {t.name}</label>
          ))}
        </fieldset>
        <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Criar reserva</button>
      </form>
    </div>
  );
}
