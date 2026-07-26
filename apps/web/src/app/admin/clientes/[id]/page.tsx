import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl, fmtDate, fmtDateTime, waUrl } from "@/lib/format";
import { BOOKING_STATUS, PAYMENT_STATUS, label } from "@/lib/labels";
import { stageUi } from "@/lib/stage";
import { STAGE_ONLY_TAGS } from "@/lib/tags";

export const dynamic = "force-dynamic";

const SENDER: Record<string, string> = { CONTACT: "Cliente:", BOT: "🤖 IA:", AGENT: "🧑 Equipe:" };

/** Etapas em que a reserva ainda está por acontecer (mesma régua do funil). */
const RESERVA_ATIVA = ["CONFIRMED", "IN_DELIVERY", "MOUNTED"];

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

  // Desfecho é DERIVADO do que já está no banco (reserva + etapa), não um campo
  // que alguém precisa lembrar de preencher — assim nunca fica desatualizado.
  const conversa = customer.conversation;
  const agora = new Date();
  const proxima = ativos
    .filter((b) => RESERVA_ATIVA.includes(b.status) && (b.pickupTime ?? b.eventDate) >= agora)
    .sort((a, b) => (a.setupTime ?? a.eventDate).getTime() - (b.setupTime ?? b.eventDate).getTime())[0];
  const ultima = ativos.find((b) => b.status === "FINISHED" || b.status === "PICKED_UP");
  const desfecho = proxima
    ? `Festa marcada para ${fmtDateTime(proxima.setupTime ?? proxima.eventDate)} — ${brl(proxima.total)} (${label(PAYMENT_STATUS, proxima.paymentStatus)}).`
    : ultima
      ? `Última festa em ${fmtDate(ultima.eventDate)}. Sem nova data marcada.`
      : conversa?.stage === "SUPORTE_HUMANO"
        ? "Em atendimento humano — ainda sem festa marcada."
        : "Conversou, mas ainda não fechou festa.";

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

      <h2 className="mt-8 text-lg font-bold">Contexto do atendimento</h2>
      {!conversa ? (
        <p className="mt-3 rounded-2xl border border-black/5 bg-white p-4 text-sm text-[var(--color-muted)]">
          Nenhuma conversa de WhatsApp vinculada a este cliente.
        </p>
      ) : (
        <div className="mt-3 space-y-3 rounded-2xl border border-black/5 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${stageUi(conversa.stage).chip}`}>
              {stageUi(conversa.stage).label}
            </span>
            {conversa.botPaused && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">IA pausada</span>
            )}
            {conversa.tags
              .filter((t) => !STAGE_ONLY_TAGS.has(t))
              .map((t) => (
                <span key={t} className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold">{t}</span>
              ))}
            <Link
              href={`/admin/conversas?c=${conversa.id}`}
              className="ml-auto rounded-full border border-black/10 px-3 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]"
            >
              Abrir conversa
            </Link>
          </div>

          <div className="rounded-xl bg-[var(--color-surface)] p-3">
            <div className="text-xs font-bold text-[var(--color-muted)]">📝 Resumo da IA</div>
            {conversa.notes ? (
              <>
                <p className="mt-1 whitespace-pre-wrap text-sm">{conversa.notes}</p>
                {conversa.notesAt && (
                  <p className="mt-1 text-[11px] text-[var(--color-muted)]">Gravado em {fmtDateTime(conversa.notesAt)}</p>
                )}
              </>
            ) : (
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                A IA ainda não gravou um resumo desta conversa.
              </p>
            )}
          </div>

          <div>
            <div className="text-xs font-bold text-[var(--color-muted)]">Desfecho</div>
            <p className="mt-1 text-sm">{desfecho}</p>
          </div>

          {conversa.messages.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[var(--color-muted)]">Últimas mensagens</div>
              <ul className="mt-1 space-y-1.5">
                {conversa.messages.map((m, i) => (
                  <li key={`${m.createdAt.toISOString()}-${i}`} className="text-sm">
                    <span className="text-xs font-semibold text-[var(--color-muted)]">{SENDER[m.sender] ?? m.sender}</span>{" "}
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-[var(--color-muted)]">
            Primeiro contato em {fmtDateTime(conversa.createdAt)} · última interação em {fmtDateTime(conversa.lastMessageAt)} ·{" "}
            {conversa._count.messages} mensagen{conversa._count.messages === 1 ? "" : "s"}
          </p>
        </div>
      )}

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
