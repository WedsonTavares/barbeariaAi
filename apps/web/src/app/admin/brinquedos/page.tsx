import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";
import { createToy } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["INFLAVEL", "PISCINA_BOLINHAS", "CAMA_ELASTICA", "ESCORREGADOR", "MESA_CADEIRA", "OUTRO"];

export default async function BrinquedosPage() {
  const { tenant } = await requireTenant();
  const toys = await services.toyService.list(tenant.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-2xl font-extrabold">Brinquedos</h1>
        <div className="mt-4 overflow-hidden rounded-2xl border border-black/5 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-[var(--color-muted)]">
              <tr><th className="p-3">Nome</th><th className="p-3">Categoria</th><th className="p-3">Aluguel</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {toys.map((t) => (
                <tr key={t.id} className="border-t border-black/5">
                  <td className="p-3 font-semibold">{t.name}</td>
                  <td className="p-3">{t.category}</td>
                  <td className="p-3">{brl(t.defaultRentPrice)}</td>
                  <td className="p-3">{t.status}</td>
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
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input name="purchasePrice" type="number" step="0.01" placeholder="Valor de compra" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="defaultRentPrice" type="number" step="0.01" placeholder="Valor de aluguel" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <textarea name="description" placeholder="Descrição" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Adicionar</button>
      </form>
    </div>
  );
}
