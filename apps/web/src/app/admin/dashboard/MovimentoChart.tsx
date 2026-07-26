import type { OverviewDay } from "@diny/core";

/**
 * Leads × agendamentos por dia. Colunas agrupadas, 2 séries categóricas
 * (paleta validada para daltonismo: âmbar × azul, ΔE 38 normal / 32 protan).
 * Sem JS: o tooltip é CSS puro (hover/foco) e a tabela fica no <details>,
 * então o gráfico continua legível no teclado e sem cor como único canal.
 */

const SERIES = [
  { key: "leads", label: "Leads", color: "#d97706" },
  { key: "bookings", label: "Agendamentos", color: "#2563eb" },
] as const;

export function MovimentoChart({ days }: { days: OverviewDay[] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.leads, d.bookings)));
  const vazio = days.every((d) => d.leads === 0 && d.bookings === 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <div className="flex h-40 w-5 shrink-0 flex-col justify-between text-right text-[10px] text-[var(--color-muted)]">
          <span>{max}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-40">
            <div className="absolute inset-x-0 top-0 h-px bg-black/5" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 h-px bg-black/10" aria-hidden />
            {vazio && (
              <p className="absolute inset-0 grid place-items-center text-xs text-[var(--color-muted)]">
                Sem movimento nesse período.
              </p>
            )}
            <div className="flex h-full items-end gap-1">
              {days.map((d) => (
                <div
                  key={d.key}
                  tabIndex={0}
                  className="group relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-t outline-none focus-visible:bg-black/[0.03]"
                  aria-label={`${d.label}: ${d.leads} leads, ${d.bookings} agendamentos`}
                >
                  {SERIES.map((s) => {
                    const v = d[s.key];
                    return (
                      <span
                        key={s.key}
                        aria-hidden
                        className="w-[7px] rounded-t-[4px]"
                        style={{
                          height: v === 0 ? 0 : `${Math.max(3, Math.round((v / max) * 100))}%`,
                          background: s.color,
                        }}
                      />
                    );
                  })}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--color-ink)] px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block group-focus-visible:block">
                    {d.label} · {d.leads} lead{d.leads === 1 ? "" : "s"} · {d.bookings} agend.
                    {d.aiBookings > 0 && ` (${d.aiBookings} 🤖)`}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex gap-1">
            {days.map((d) => (
              <span key={d.key} className="flex-1 text-center text-[10px] text-[var(--color-muted)]">
                {d.label.slice(0, 2)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-ink)]">
          Ver números
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[320px] text-xs">
            <thead className="text-left text-[var(--color-muted)]">
              <tr>
                <th className="py-1 font-medium">Dia</th>
                <th className="py-1 text-right font-medium">Leads</th>
                <th className="py-1 text-right font-medium">Agendamentos</th>
                <th className="py-1 text-right font-medium">Pela IA</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.key} className="border-t border-black/5">
                  <td className="py-1">{d.label}</td>
                  <td className="py-1 text-right tabular-nums">{d.leads}</td>
                  <td className="py-1 text-right tabular-nums">{d.bookings}</td>
                  <td className="py-1 text-right tabular-nums">{d.aiBookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
