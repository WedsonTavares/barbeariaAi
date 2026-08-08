import Link from "next/link";
import { CalendarPlus, MessageCircle, Sparkles } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { fmtDate, waUrl } from "@/lib/format";
import { LEAD_SOURCE, LEAD_STATUS, label } from "@/lib/labels";
import { setLeadStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS = ["NEW", "CONTACTED", "QUOTED", "WON", "LOST"];

type Lead = Awaited<ReturnType<typeof services.leadService.list>>["abertos"][number];

/**
 * Um lead é alguém que demonstrou interesse e a IA não conseguiu fechar — ela
 * registra e passa para a equipe. Sem esta tela eles viravam só um aviso no
 * sino, que some quando lido, e ninguém dava retorno.
 */
function Cartao({ lead, fechado }: { lead: Lead; fechado?: boolean }) {
  const telefone = lead.phone.replace(/\D/g, "");
  const saudacao = `Olá ${lead.name.split(" ")[0]}! Vi seu interesse e posso te ajudar a agendar.`;

  return (
    <article className={`rounded-2xl border border-black/5 bg-white p-4 shadow-sm ${fechado ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{lead.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {label(LEAD_SOURCE, lead.source)} · {fmtDate(lead.createdAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-bold">
          {label(LEAD_STATUS, lead.status)}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-xs">
        {lead.desiredService && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-[var(--color-muted)]">Interesse:</dt>
            <dd className="font-semibold">{lead.desiredService}</dd>
          </div>
        )}
        {lead.desiredDate && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-[var(--color-muted)]">Data desejada:</dt>
            <dd className="font-semibold">{fmtDate(lead.desiredDate)}</dd>
          </div>
        )}
        {lead.neighborhood && (
          <div className="flex gap-1.5">
            <dt className="shrink-0 text-[var(--color-muted)]">Bairro:</dt>
            <dd>{lead.neighborhood}</dd>
          </div>
        )}
        {lead.message && (
          <p className="mt-1 rounded-lg bg-[var(--color-surface)] px-2 py-1.5 leading-relaxed">{lead.message}</p>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a
          href={waUrl(lead.phone, saudacao)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-full bg-[#25D366] px-3 py-1.5 text-xs font-bold text-white"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          Responder
        </a>
        {/* A tela de agendamentos já aceita telefone e nome pela URL: dá para
            sair do lead direto para a reserva, sem redigitar nada. */}
        <Link
          href={`/admin/agendamentos?tel=${encodeURIComponent(telefone)}&nome=${encodeURIComponent(lead.name)}`}
          className="flex items-center gap-1 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-surface)]"
        >
          <CalendarPlus className="size-3.5" aria-hidden />
          Agendar
        </Link>

        <form action={setLeadStatusAction} className="ml-auto flex gap-1.5">
          <input type="hidden" name="id" value={lead.id} />
          <select
            name="status"
            defaultValue={lead.status}
            aria-label={`Etapa de ${lead.name}`}
            className="rounded-lg border border-black/10 px-2 py-1 text-xs"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>{label(LEAD_STATUS, s)}</option>
            ))}
          </select>
          <button className="rounded-lg border border-black/10 px-2 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]">
            Salvar
          </button>
        </form>
      </div>
    </article>
  );
}

export default async function LeadsPage() {
  const { tenant } = await requireTenant();
  const { abertos, fechados } = await services.leadService.list(tenant.id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">Leads</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Quem demonstrou interesse e ainda não agendou. A IA registra aqui quando não consegue fechar sozinha.
          </p>
        </div>
      </header>

      {abertos.length === 0 && fechados.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 p-8 text-center text-sm text-[var(--color-muted)]">
          Nenhum lead ainda. Eles aparecem sozinhos quando a IA registra um interesse no WhatsApp.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-bold">
              Em aberto{" "}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{abertos.length}</span>
            </h2>
            {abertos.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-[var(--color-muted)]">
                Nenhum lead esperando retorno. 👏
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {abertos.map((lead) => (
                  <Cartao key={lead.id} lead={lead} />
                ))}
              </div>
            )}
          </section>

          {fechados.length > 0 && (
            <details className="rounded-2xl border border-black/5 bg-white p-4">
              <summary className="cursor-pointer text-sm font-bold">
                Encerrados ({fechados.length})
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {fechados.map((lead) => (
                  <Cartao key={lead.id} lead={lead} fechado />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
