import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl, fmtDate, waUrl } from "@/lib/format";
import { BOOKING_STATUS, PAYMENT_STATUS, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function FichaClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { tenant } = await requireTenant();
  const { id } = await params;
  const customer = await services.customerService.history(tenant.id, id);

  if (!customer) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold">Cliente não encontrado</h1>
        <Link href="/admin/clientes" className="mt-4 inline-block rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">← Voltar</Link>
      </div>
    );
  }

  const bookings = customer.bookings;
  const ativos = bookings.filter((b) => b.status !== "CANCELED");
  const totalContratado = ativos.reduce((s, b) => s + Number(b.total), 0);
  const totalPago = ativos.reduce((s, b) => s + b.payments.reduce((p, x) => p + Number(x.amount), 0), 0);
  const emAberto = Math.max(0, totalContratado - totalPago);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{customer.name}</h1>
        <Link href="/admin/clientes" className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">← Voltar</Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--color-muted)]">
        <a href={waUrl(customer.phone)} target="_blank" rel="noopener" className="rounded-full bg-[#25D366] px-3 py-1 text-xs font-bold text-white">WhatsApp: {customer.phone}</a>
        {customer.email && <span>{customer.email}</span>}
        {customer.neighborhood && <span>· {customer.neighborhood}</span>}
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${customer.imageConsent ? "bg-green-100 text-green-700" : "bg-black/5"}`}>
          {customer.imageConsent ? "Autoriza imagem" : "Sem autorização de imagem"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="text-xs text-[var(--color-muted)]">Festas</div>
          <div className="text-xl font-extrabold">{ativos.length}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="text-xs text-[var(--color-muted)]">Total pago</div>
          <div className="text-xl font-extrabold">{brl(totalPago)}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="text-xs text-[var(--color-muted)]">Em aberto</div>
          <div className={`text-xl font-extrabold ${emAberto > 0 ? "text-red-600" : ""}`}>{brl(emAberto)}</div>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold">Histórico de festas</h2>
      <div className="mt-3 space-y-3">
        {bookings.map((b) => {
          const pago = b.payments.reduce((s, p) => s + Number(p.amount), 0);
          const editable = b.status !== "CANCELED" && b.status !== "FINISHED";
          return (
            <div key={b.id} className="rounded-2xl border border-black/5 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{fmtDate(b.eventDate)}</span>
                <span className="text-sm font-extrabold">{brl(b.total)}</span>
              </div>
              <div className="mt-1 text-sm text-[var(--color-muted)]">
                {b.items.map((i) => i.toy.name).join(", ") || "—"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 font-semibold">{label(BOOKING_STATUS, b.status)}</span>
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 font-semibold">{label(PAYMENT_STATUS, b.paymentStatus)}</span>
                <span className="text-[var(--color-muted)]">Pago: {brl(pago)}</span>
                {editable && (
                  <Link href={`/admin/reservas/${b.id}`} className="rounded-full border border-black/10 px-3 py-1 font-semibold hover:bg-[var(--color-surface)]">Abrir</Link>
                )}
              </div>
            </div>
          );
        })}
        {bookings.length === 0 && <p className="text-[var(--color-muted)]">Nenhuma festa registrada ainda.</p>}
      </div>
    </div>
  );
}
