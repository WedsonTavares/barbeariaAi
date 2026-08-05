import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  Minus,
  PiggyBank,
  ReceiptText,
} from "lucide-react";

import { requireTenant } from "@/lib/tenant";
import { services } from "@barbearia-ai/core";
import { brl } from "@/lib/format";
import { SERVICE_STATUS, label } from "@/lib/labels";
import { ExpenseDialog } from "./ExpenseDialog";
import { MonthBalanceChart, RevenueHistoryChart } from "./FinanceCharts";

export const dynamic = "force-dynamic";

type RankingItem = {
  id: string;
  name: string;
  status: string;
  appointments: number;
  revenue: number;
};

const STATUS_CHIP: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  INACTIVE: "bg-amber-50 text-amber-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

function MetricCard({
  title,
  value,
  hint,
  icon: Icon,
  tint,
  valueTone = "text-[var(--color-ink)]",
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  valueTone?: string;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--color-muted)] sm:text-xs">{title}</div>
          <div className={`mt-1 whitespace-nowrap text-sm font-extrabold tracking-tight tabular-nums min-[420px]:text-base sm:text-xl xl:text-2xl ${valueTone}`}>
            {value}
          </div>
        </div>
        <span className={`hidden size-9 shrink-0 place-items-center rounded-xl sm:grid ${tint}`}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-muted)] sm:text-[11px]">{hint}</p>
    </article>
  );
}

function MobileRankingCard({ item, position }: { item: RankingItem; position: number }) {
  return (
    <article className="rounded-xl border border-black/5 p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-surface)] text-[11px] font-extrabold text-[var(--color-muted)]">
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="min-w-0 truncate font-bold">{item.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_CHIP[item.status] ?? "bg-slate-100 text-slate-600"}`}>
              {label(SERVICE_STATUS, item.status)}
            </span>
          </div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 rounded-lg bg-[var(--color-surface)]">
        <div className="min-w-0 px-2 py-2">
          <dt className="text-[10px] text-[var(--color-muted)]">Atendimentos</dt>
          <dd className="mt-0.5 font-extrabold tabular-nums">{item.appointments}</dd>
        </div>
        <div className="min-w-0 border-l border-black/5 px-2 py-2">
          <dt className="text-[10px] text-[var(--color-muted)]">Receita</dt>
          <dd className="mt-0.5 text-xs font-extrabold tabular-nums">{brl(item.revenue)}</dd>
        </div>
      </dl>
    </article>
  );
}

/** Financeiro + relatórios: UI compacta, responsiva e sem alterar as regras financeiras. */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const [month, report] = await Promise.all([
    services.financeService.monthSummary(tenant.id),
    services.reportService.overview(tenant.id, 6),
  ]);

  const profitState = month.lucroEstimado > 0 ? "positive" : month.lucroEstimado < 0 ? "negative" : "neutral";
  const metrics = [
    {
      title: "Faturamento",
      value: brl(month.faturamentoBruto),
      hint: "recebido neste mês",
      icon: CircleDollarSign,
      tint: "bg-blue-50 text-blue-600",
    },
    {
      title: "Custos",
      value: brl(month.custos),
      hint: "saídas lançadas",
      icon: ReceiptText,
      tint: "bg-rose-50 text-rose-600",
    },
    {
      title: "Lucro estimado",
      value: brl(month.lucroEstimado),
      hint:
        profitState === "positive"
          ? "resultado positivo"
          : profitState === "negative"
            ? "custos acima da receita"
            : "resultado zerado",
      icon: profitState === "positive" ? ArrowUpRight : profitState === "negative" ? ArrowDownRight : Minus,
      tint:
        profitState === "positive"
          ? "bg-emerald-50 text-emerald-600"
          : profitState === "negative"
            ? "bg-rose-50 text-rose-600"
            : "bg-slate-100 text-slate-600",
      valueTone:
        profitState === "positive"
          ? "text-emerald-700"
          : profitState === "negative"
            ? "text-rose-700"
            : "text-slate-700",
    },
    {
      title: "A receber",
      value: brl(month.aReceber),
      hint: "saldo dos agendamentos do mês",
      icon: Clock3,
      tint: "bg-amber-50 text-amber-600",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <PiggyBank className="size-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold">Financeiro</h1>
              <p className="text-sm text-[var(--color-muted)]">Caixa, custos e receita por serviço.</p>
            </div>
          </div>
        </div>
        <ExpenseDialog initialOpen={Boolean(sp.erro)} />
      </header>

      {sp.ok && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Custo lançado com sucesso.
        </p>
      )}

      <section aria-label="Resumo financeiro do mês" className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 lg:grid-cols-4 lg:gap-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.title} {...metric} />
        ))}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <RevenueHistoryChart monthly={report.monthly} />
        <MonthBalanceChart
          revenue={month.faturamentoBruto}
          costs={month.custos}
          profit={month.lucroEstimado}
          appointments={month.appointmentsNoMes}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-black/5 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="font-bold">Ranking de serviços</h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">Atendimentos, receita gerada e status do catálogo</p>
          </div>
          <span className="rounded-full bg-[var(--color-surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--color-muted)]">
            {report.ranking.length} item{report.ranking.length === 1 ? "" : "s"}
          </span>
        </div>

        {report.ranking.length > 0 ? (
          <>
            <div className="space-y-2 p-3 lg:hidden">
              {report.ranking.map((item, index) => (
                <MobileRankingCard key={item.id} item={item} position={index + 1} />
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface)] text-left text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                  <tr>
                    <th className="w-12 px-4 py-2.5 text-center">
                      <span className="sr-only">Posição</span>
                      <span aria-hidden>#</span>
                    </th>
                    <th className="px-3 py-2.5">Serviço</th>
                    <th className="px-3 py-2.5 text-center">Atendimentos</th>
                    <th className="px-3 py-2.5">Receita</th>
                    <th className="px-4 py-2.5">Ticket médio</th>
                  </tr>
                </thead>
                <tbody>
                  {report.ranking.map((item, index) => (
                    <tr key={item.id} className="border-t border-black/5 transition hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-center text-xs font-bold text-[var(--color-muted)]">{index + 1}</td>
                      <td className="px-3 py-3">
                        <div className="font-bold">{item.name}</div>
                        <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_CHIP[item.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {label(SERVICE_STATUS, item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-extrabold tabular-nums">{item.appointments}</td>
                      <td className="px-3 py-3 font-extrabold tabular-nums">{brl(item.revenue)}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-[var(--color-muted)]">
                        {brl(item.appointments > 0 ? item.revenue / item.appointments : 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="grid min-h-32 place-items-center p-6 text-center">
            <div>
              <PiggyBank className="mx-auto size-6 text-slate-300" aria-hidden />
              <p className="mt-2 text-sm font-semibold text-[var(--color-muted)]">Sem dados financeiros ainda.</p>
            </div>
          </div>
        )}

        <p className="border-t border-black/5 px-4 py-3 text-[10px] leading-relaxed text-[var(--color-muted)] sm:px-5">
          A receita por serviço soma os itens de agendamentos não cancelados.
        </p>
      </section>
    </div>
  );
}
