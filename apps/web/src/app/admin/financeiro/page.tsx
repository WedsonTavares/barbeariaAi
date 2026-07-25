import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";
import { EXPENSE_CATEGORY, TOY_STATUS, label } from "@/lib/labels";
import { addExpense } from "./actions";

export const dynamic = "force-dynamic";
const CATS = ["FUEL", "HELPER", "MAINTENANCE", "CLEANING", "OTHER"];

/** Financeiro + Relatórios numa aba só: resumo do mês, lançar custo e os relatórios. */
export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const [m, { monthly, ranking }] = await Promise.all([
    services.financeService.monthSummary(tenant.id),
    services.reportService.overview(tenant.id, 6),
  ]);
  const maxRevenue = Math.max(1, ...monthly.map((r) => r.revenue));

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-extrabold">Financeiro</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Resumo do mês, custos e relatórios.</p>

      {sp?.erro && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">Custo não lançado: informe um valor maior que zero.</p>}
      {sp?.ok && <p role="status" className="mt-3 rounded-lg bg-green-100 p-3 text-sm text-green-700">Custo lançado!</p>}

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[
            { t: "Faturamento", v: m.faturamentoBruto },
            { t: "Custos", v: m.custos },
            { t: "Lucro estimado", v: m.lucroEstimado },
            { t: "A receber", v: m.aReceber },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl border border-black/5 bg-white p-4 sm:p-5">
              <div className="text-xs text-[var(--color-muted)] sm:text-sm">{c.t}</div>
              <div className="text-lg font-extrabold sm:text-2xl">{brl(c.v)}</div>
            </div>
          ))}
        </div>

        <form action={addExpense} className="h-fit space-y-3 rounded-2xl border border-black/5 bg-white p-5">
          <h2 className="font-bold">Lançar custo</h2>
          <select name="category" className="w-full rounded-lg border border-black/10 px-3 py-2">
            {CATS.map((c) => <option key={c} value={c}>{label(EXPENSE_CATEGORY, c)}</option>)}
          </select>
          <input name="amount" type="number" step="0.01" placeholder="Valor" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
          <input name="description" placeholder="Descrição" className="w-full rounded-lg border border-black/10 px-3 py-2" />
          <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Lançar</button>
        </form>
      </div>

      <h2 className="mt-10 text-lg font-bold">Receita por mês (últimos 6)</h2>
      <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 sm:p-5">
        <div className="space-y-2">
          {monthly.map((r) => (
            <div key={r.label} className="flex items-center gap-2 sm:gap-3">
              <span className="w-12 shrink-0 text-[10px] font-bold text-[var(--color-muted)] sm:w-16 sm:text-xs">{r.label}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-full bg-[var(--color-surface)]">
                <div
                  className="flex h-full items-center rounded-full bg-[var(--color-primary)] px-2"
                  style={{ width: `${Math.max(4, Math.round((r.revenue / maxRevenue) * 100))}%` }}
                >
                  <span className="whitespace-nowrap text-[10px] font-bold text-white">{brl(r.revenue)}</span>
                </div>
              </div>
              <span className="w-14 shrink-0 text-right text-[10px] text-[var(--color-muted)] sm:w-16 sm:text-xs">
                {r.bookings} festa{r.bookings === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold">Brinquedos: ranking e retorno</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-black/5 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
            <tr>
              <th className="p-3">Brinquedo</th>
              <th className="p-3">Locações</th>
              <th className="p-3">Receita</th>
              <th className="p-3">Investimento</th>
              <th className="p-3">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((t) => (
              <tr key={t.id} className="border-t border-black/5">
                <td className="p-3">
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-[var(--color-muted)]">{label(TOY_STATUS, t.status)}</div>
                </td>
                <td className="p-3">{t.rentals}</td>
                <td className="p-3 font-semibold">{brl(t.revenue)}</td>
                <td className="p-3">{brl(t.purchasePrice)}</td>
                <td className="p-3">
                  {t.paidOff ? (
                    <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">✓ Já se pagou</span>
                  ) : t.purchasePrice > 0 ? (
                    <span className="whitespace-nowrap text-xs text-[var(--color-muted)]">faltam {brl(t.remaining)}</span>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
            {ranking.length === 0 && <tr><td className="p-3 text-[var(--color-muted)]" colSpan={5}>Sem dados ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Receita do brinquedo = soma dos preços de item em reservas não canceladas. Retorno compara com o valor de compra cadastrado.
      </p>
    </div>
  );
}
