import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";
import { TOY_CATEGORY, TOY_STATUS, label } from "@/lib/labels";
import { createToy, setToyStatus } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["INFLAVEL", "PISCINA_BOLINHAS", "CAMA_ELASTICA", "ESCORREGADOR", "MESA_CADEIRA", "OUTRO"];
const STATUSES = ["AVAILABLE", "RENTED", "MAINTENANCE", "RETIRED"];

export default async function BrinquedosPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const toys = await services.toyService.list(tenant.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-2xl font-extrabold">Brinquedos</h1>
        {sp?.erro && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">Confira os campos: dados inválidos ou incompletos.</p>}
        {sp?.ok && <p role="status" className="mt-3 rounded-lg bg-green-100 p-3 text-sm text-green-700">Brinquedo adicionado!</p>}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-black/5 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr><th className="p-3">Nome</th><th className="p-3">Categoria</th><th className="p-3">Aluguel</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {toys.map((t) => (
                <tr key={t.id} className="border-t border-black/5">
                  <td className="p-3 font-semibold">{t.name}</td>
                  <td className="p-3">{label(TOY_CATEGORY, t.category)}</td>
                  <td className="p-3">{brl(t.defaultRentPrice)}</td>
                  <td className="p-3">
                    <form action={setToyStatus} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={t.id} />
                      <select name="status" defaultValue={t.status} aria-label={`Status de ${t.name}`} className="rounded border border-black/10 px-2 py-1 text-xs">
                        {STATUSES.map((s) => <option key={s} value={s}>{label(TOY_STATUS, s)}</option>)}
                      </select>
                      <button className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold hover:bg-black/10">OK</button>
                    </form>
                  </td>
                </tr>
              ))}
              {toys.length === 0 && <tr><td className="p-3 text-[var(--color-muted)]" colSpan={4}>Nenhum brinquedo ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <form action={createToy} className="h-fit space-y-3 rounded-2xl border border-black/5 bg-white p-5">
        <h2 className="font-bold">Novo brinquedo</h2>
        <input name="name" placeholder="Nome" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <select name="category" className="w-full rounded-lg border border-black/10 px-3 py-2">
          {CATEGORIES.map((c) => <option key={c} value={c}>{label(TOY_CATEGORY, c)}</option>)}
        </select>
        <input name="purchasePrice" type="number" step="0.01" placeholder="Valor de compra" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="defaultRentPrice" type="number" step="0.01" placeholder="Valor de aluguel" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <textarea name="description" placeholder="Descrição" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Adicionar</button>
      </form>
    </div>
  );
}
