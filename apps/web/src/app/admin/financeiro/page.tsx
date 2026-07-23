import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";
import { EXPENSE_CATEGORY, label } from "@/lib/labels";
import { addExpense } from "./actions";

export const dynamic = "force-dynamic";
const CATS = ["FUEL", "HELPER", "MAINTENANCE", "CLEANING", "OTHER"];

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const m = await services.financeService.monthSummary(tenant.id);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="text-2xl font-extrabold">Financeiro do mês</h1>
        {sp?.erro && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">Custo não lançado: informe um valor maior que zero.</p>}
        {sp?.ok && <p role="status" className="mt-3 rounded-lg bg-green-100 p-3 text-sm text-green-700">Custo lançado!</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-black/5 bg-white p-5"><div className="text-sm text-[var(--color-muted)]">Faturamento</div><div className="text-2xl font-extrabold">{brl(m.faturamentoBruto)}</div></div>
          <div className="rounded-2xl border border-black/5 bg-white p-5"><div className="text-sm text-[var(--color-muted)]">Custos</div><div className="text-2xl font-extrabold">{brl(m.custos)}</div></div>
          <div className="rounded-2xl border border-black/5 bg-white p-5"><div className="text-sm text-[var(--color-muted)]">Lucro estimado</div><div className="text-2xl font-extrabold">{brl(m.lucroEstimado)}</div></div>
          <div className="rounded-2xl border border-black/5 bg-white p-5"><div className="text-sm text-[var(--color-muted)]">A receber</div><div className="text-2xl font-extrabold">{brl(m.aReceber)}</div></div>
        </div>
      </div>
      <form action={addExpense} className="h-fit space-y-3 rounded-2xl border border-black/5 bg-white p-5">
        <h2 className="font-bold">Lançar custo</h2>
        <select name="category" className="w-full rounded-lg border border-black/10 px-3 py-2">{CATS.map((c) => <option key={c} value={c}>{label(EXPENSE_CATEGORY, c)}</option>)}</select>
        <input name="amount" type="number" step="0.01" placeholder="Valor" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="description" placeholder="Descrição" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Lançar</button>
      </form>
    </div>
  );
}
