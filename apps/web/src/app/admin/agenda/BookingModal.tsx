"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { X, ChevronRight, Ban, Check, Phone, MapPin, Package, Pencil } from "lucide-react";
import { loadBookingAction, setBookingStatusAction, recordPaymentAction } from "./actions";
import { STATUS_UI, PAYMENT_UI, ui } from "./status";

type Booking = Awaited<ReturnType<typeof loadBookingAction>>;

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "—";

/** Reserva em tela cheia: dados, brinquedos, pagamento e mudança de status. */
export function BookingModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [b, setB] = useState<Booking>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payValue, setPayValue] = useState("");
  const [pending, start] = useTransition();

  async function refresh() {
    setB(await loadBookingAction(id));
    setLoading(false);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function changeStatus(status: string) {
    setErr(null);
    start(async () => {
      const r = await setBookingStatusAction(id, status);
      if (!r.ok) setErr(r.error ?? "Não foi possível mudar o status.");
      else { await refresh(); onChanged(); }
    });
  }

  const s = b ? ui(b.status) : null;
  const restante = b ? Math.max(0, b.total - b.paid) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-surface)]">
      {/* topo */}
      <header className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3 md:px-6">
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-extrabold">{b?.customer.name ?? "Carregando..."}</div>
          {b && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-bold ${s!.chip}`}>{s!.label}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${PAYMENT_UI[b.paymentStatus]?.chip ?? "bg-slate-100"}`}>
                {PAYMENT_UI[b.paymentStatus]?.label ?? b.paymentStatus}
              </span>
              <span className="text-[var(--color-muted)]">Festa em {fmtDate(b.eventDate)}</span>
            </div>
          )}
        </div>
        <button onClick={onClose} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[var(--color-surface)]">
          <X className="size-5" />
        </button>
      </header>

      {loading || !b ? (
        <div className="grid flex-1 place-items-center text-[var(--color-muted)]">Carregando…</div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-3">
              {/* dados da festa */}
              <section className="rounded-2xl border border-black/5 bg-white p-4 lg:col-span-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Festa</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div><div className="text-[11px] text-[var(--color-muted)]">Data</div><div className="font-semibold">{fmtDate(b.eventDate)}</div></div>
                  <div><div className="text-[11px] text-[var(--color-muted)]">Montagem</div><div className="font-semibold">{fmtTime(b.setupTime)}</div></div>
                  <div><div className="text-[11px] text-[var(--color-muted)]">Retirada</div><div className="font-semibold">{fmtTime(b.pickupTime)}</div></div>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <a href={`https://wa.me/${b.customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-semibold text-[var(--color-primary)] hover:underline">
                    <Phone className="size-4" /> {b.customer.phone}
                  </a>
                  {(b.neighborhood || b.address) && (
                    <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                      <MapPin className="size-4" /> {[b.address, b.neighborhood].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>

                <h3 className="mt-5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">
                  <Package className="size-3.5" /> Brinquedos
                </h3>
                <ul className="mt-2 divide-y divide-black/5 rounded-xl border border-black/5">
                  {b.toys.map((t) => (
                    <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-[var(--color-muted)]">{brl(t.price)}</span>
                    </li>
                  ))}
                  {b.toys.length === 0 && <li className="px-3 py-2 text-sm text-[var(--color-muted)]">Nenhum brinquedo vinculado.</li>}
                </ul>

                {b.notes && (
                  <>
                    <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Observações</h3>
                    <p className="mt-1 whitespace-pre-wrap rounded-xl bg-[var(--color-surface)] p-3 text-sm">{b.notes}</p>
                  </>
                )}
              </section>

              {/* financeiro + status */}
              <section className="space-y-4">
                <div className="rounded-2xl border border-black/5 bg-white p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Financeiro</h2>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-[var(--color-muted)]">Total</span><b>{brl(b.total)}</b></div>
                    <div className="flex justify-between"><span className="text-[var(--color-muted)]">Sinal previsto</span><span>{brl(b.depositAmount)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--color-muted)]">Recebido</span><b className="text-green-700">{brl(b.paid)}</b></div>
                    <div className="flex justify-between border-t border-black/5 pt-1.5"><span className="text-[var(--color-muted)]">Falta</span><b>{brl(restante)}</b></div>
                  </div>

                  {payOpen ? (
                    <div className="mt-3 flex gap-1">
                      <input
                        type="number" step="0.01" min="0" autoFocus value={payValue}
                        onChange={(e) => setPayValue(e.target.value)}
                        placeholder="Valor recebido"
                        className="min-w-0 flex-1 rounded-lg border border-black/10 px-2 py-1.5 text-sm"
                      />
                      <button
                        disabled={pending}
                        onClick={() => start(async () => {
                          const v = Number(payValue);
                          const r = await recordPaymentAction(b.id, v);
                          if (r.ok) { setPayOpen(false); setPayValue(""); await refresh(); onChanged(); }
                          else setErr(r.error ?? "Valor inválido");
                        })}
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-white"
                        aria-label="Registrar pagamento"
                      >
                        <Check className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => { setPayOpen(true); setPayValue(String(restante || b.depositAmount || "")); }} className="mt-3 w-full rounded-full border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">
                      Registrar pagamento
                    </button>
                  )}
                </div>

                <div className="rounded-2xl border border-black/5 bg-white p-4">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Status</h2>
                  {err && <p role="alert" className="mt-2 rounded-lg bg-red-100 p-2 text-xs text-red-700">{err}</p>}

                  {b.status !== "CANCELED" && b.status !== "FINISHED" && (
                    <div className="mt-3 space-y-2">
                      {b.status === "WAITING_DEPOSIT" || b.status === "LEAD" || b.status === "QUOTE_SENT" ? (
                        <button disabled={pending} onClick={() => changeStatus("CONFIRMED")} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                          <Check className="size-4" /> Confirmar reserva
                        </button>
                      ) : null}
                      {b.nextStatus && (
                        <button disabled={pending} onClick={() => changeStatus(b.nextStatus!)} className="flex w-full items-center justify-center gap-1.5 rounded-full border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface)] disabled:opacity-60">
                          Avançar para {STATUS_UI[b.nextStatus]?.label ?? b.nextStatus} <ChevronRight className="size-4" />
                        </button>
                      )}
                    </div>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--color-muted)]">Mudar para outro status</summary>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(STATUS_UI).filter(([k]) => k !== b.status).map(([k, v]) => (
                        <button key={k} disabled={pending} onClick={() => changeStatus(k)} className={`rounded-full px-2 py-1 text-[11px] font-bold disabled:opacity-60 ${v.chip}`}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </details>

                  {b.status !== "CANCELED" && (
                    <button disabled={pending} onClick={() => changeStatus("CANCELED")} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                      <Ban className="size-4" /> Cancelar reserva
                    </button>
                  )}
                </div>

                <Link href={`/admin/reservas/${b.id}`} className="flex items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">
                  <Pencil className="size-4" /> Editar dados da reserva
                </Link>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
