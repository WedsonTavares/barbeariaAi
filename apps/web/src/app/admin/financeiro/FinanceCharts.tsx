import { BarChart3, Scale } from "lucide-react";

import { brl } from "@/lib/format";

type MonthlyPoint = {
  label: string;
  revenue: number;
  bookings: number;
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(value: string) {
  const [month, year] = value.split("/");
  const index = Number(month) - 1;
  return `${MONTHS[index] ?? month}/${year?.slice(-2) ?? ""}`;
}

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (absolute >= 1_000) return `R$ ${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
}

export function RevenueHistoryChart({ monthly }: { monthly: MonthlyPoint[] }) {
  const width = 720;
  const height = 230;
  const left = 58;
  const right = 16;
  const top = 20;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const peakRevenue = Math.max(0, ...monthly.map((point) => point.revenue));
  const scaleMax = Math.max(1, peakRevenue);
  const hasRevenue = peakRevenue > 0;
  const denominator = Math.max(1, monthly.length - 1);
  const points = monthly.map((point, index) => ({
    ...point,
    x: left + (plotWidth * index) / denominator,
    y: top + plotHeight - (point.revenue / scaleMax) * plotHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length
    ? `${left},${top + plotHeight} ${line} ${left + plotWidth},${top + plotHeight}`
    : "";
  const total = monthly.reduce((sum, point) => sum + point.revenue, 0);
  const bookings = monthly.reduce((sum, point) => sum + point.bookings, 0);

  return (
    <section className="min-w-0 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <BarChart3 className="size-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="font-bold">Receita recebida</h2>
            <p className="text-xs text-[var(--color-muted)]">Evolução dos últimos 6 meses</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-extrabold tabular-nums">{brl(total)}</div>
          <div className="text-[11px] text-[var(--color-muted)]">{bookings} festa{bookings === 1 ? "" : "s"} no período</div>
        </div>
      </div>

      {hasRevenue ? (
        <>
          <div className="mt-4 grid h-40 grid-cols-6 gap-1.5 sm:hidden" role="img" aria-label="Receita recebida por mês">
            {monthly.map((point) => {
              const percentage = (point.revenue / scaleMax) * 100;
              return (
                <div key={point.label} className="flex min-w-0 flex-col justify-end text-center">
                  <div className="flex min-h-0 flex-1 items-end justify-center rounded-t-lg bg-blue-50/60 px-1">
                    <div
                      className="w-full max-w-7 rounded-t-md bg-blue-500"
                      style={{ height: point.revenue > 0 ? `${Math.max(4, percentage)}%` : "0%" }}
                      aria-label={`${point.label}: ${brl(point.revenue)}`}
                    />
                  </div>
                  <span className="mt-1.5 text-[10px] font-bold text-[var(--color-muted)]">{monthLabel(point.label)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 hidden min-w-0 overflow-hidden sm:block">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Gráfico da receita recebida nos últimos seis meses"
              className="h-auto w-full"
            >
              <defs>
                <linearGradient id="finance-revenue-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[0, 0.5, 1].map((ratio) => {
                const y = top + plotHeight - plotHeight * ratio;
                return (
                  <g key={ratio}>
                    <line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="4 5" />
                    <text x={left - 8} y={y + 4} textAnchor="end" fill="#64748B" fontSize="11">
                      {compactMoney(peakRevenue * ratio)}
                    </text>
                  </g>
                );
              })}

              {points.length > 0 && <polygon points={area} fill="url(#finance-revenue-area)" />}
              {points.length > 1 && (
                <polyline points={line} fill="none" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              )}

              {points.map((point) => (
                <g key={point.label}>
                  <circle cx={point.x} cy={point.y} r="6" fill="white" stroke="#2563EB" strokeWidth="4">
                    <title>{`${point.label}: ${brl(point.revenue)} · ${point.bookings} festa${point.bookings === 1 ? "" : "s"}`}</title>
                  </circle>
                  <text x={point.x} y={height - 18} textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="600">
                    {monthLabel(point.label)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </>
      ) : (
        <div className="mt-4 grid h-40 place-items-center rounded-xl border border-dashed border-black/10 bg-[var(--color-surface)] px-4 text-center">
          <div>
            <BarChart3 className="mx-auto size-6 text-slate-300" aria-hidden />
            <p className="mt-2 text-xs font-semibold text-[var(--color-muted)]">Ainda sem recebimentos neste período.</p>
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-3 sm:grid-cols-6">
        {monthly.map((point) => (
          <div key={point.label} className="rounded-lg bg-[var(--color-surface)] px-2 py-1.5 text-center">
            <div className="text-[10px] font-semibold text-[var(--color-muted)]">{monthLabel(point.label)}</div>
            <div className="mt-0.5 text-[11px] font-bold tabular-nums">{compactMoney(point.revenue)}</div>
            <div className="text-[10px] text-[var(--color-muted)]">
              {point.bookings} festa{point.bookings === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">
        Receita segue a data do pagamento; festas seguem a data do evento.
      </p>
    </section>
  );
}

export function MonthBalanceChart({
  revenue,
  costs,
  profit,
  bookings,
}: {
  revenue: number;
  costs: number;
  profit: number;
  bookings: number;
}) {
  const maxValue = Math.max(1, revenue, costs);
  const margin = revenue > 0 ? (profit / revenue) * 100 : null;
  const costShare = revenue > 0 ? (costs / revenue) * 100 : null;
  const resultTone =
    profit > 0
      ? { panel: "bg-emerald-50", text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-700", label: "Resultado positivo" }
      : profit < 0
        ? { panel: "bg-rose-50", text: "text-rose-700", chip: "bg-rose-100 text-rose-700", label: "Resultado negativo" }
        : { panel: "bg-slate-50", text: "text-slate-700", chip: "bg-slate-200 text-slate-700", label: "Resultado equilibrado" };
  const rows = [
    { label: "Recebido", value: revenue, color: "bg-blue-500" },
    { label: "Custos", value: costs, color: "bg-rose-500" },
  ];

  return (
    <section className="self-start rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
          <Scale className="size-4.5" aria-hidden />
        </span>
        <div>
          <h2 className="font-bold">Balanço do mês</h2>
          <p className="text-xs text-[var(--color-muted)]">Recebimentos e saídas registrados</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row) => {
          const percentage = (row.value / maxValue) * 100;
          return (
            <div key={row.label}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-[var(--color-muted)]">{row.label}</span>
                <span className="font-extrabold tabular-nums">{brl(row.value)}</span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${row.label}: ${brl(row.value)}`}
              >
                <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.max(0, percentage)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className={`mt-5 rounded-xl p-3 ${resultTone.panel}`}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-wide ${resultTone.text}`}>
              {resultTone.label}
            </div>
            <div className={`mt-0.5 text-xl font-extrabold tabular-nums ${resultTone.text}`}>
              {brl(profit)}
            </div>
          </div>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${resultTone.chip}`}>
            {margin === null ? "sem receita" : `${margin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de margem`}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 divide-x divide-black/5 rounded-xl border border-black/5">
        <div className="p-3">
          <dt className="text-[11px] font-semibold text-[var(--color-muted)]">Reservas no mês</dt>
          <dd className="mt-0.5 text-lg font-extrabold tabular-nums">{bookings}</dd>
        </div>
        <div className="p-3">
          <dt className="text-[11px] font-semibold text-[var(--color-muted)]">Custos / receita</dt>
          <dd className="mt-0.5 text-lg font-extrabold tabular-nums">
            {costShare === null ? "—" : `${costShare.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
