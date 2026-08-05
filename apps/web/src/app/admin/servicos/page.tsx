import { Scissors } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { brl } from "@/lib/format";
import { SERVICE_CATEGORY, SERVICE_STATUS, label } from "@/lib/labels";
import { createServiceAction, setServiceStatusAction } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["HAIR", "BEARD", "BROWS", "AESTHETICS", "NAILS", "TATTOO", "MASSAGE", "OTHER"];

export default async function ServicosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const catalog = await services.serviceCatalogService.list(tenant.id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Scissors className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">Serviços</h1>
          <p className="text-sm text-[var(--color-muted)]">Catálogo usado pela agenda, pelo site e pela IA.</p>
        </div>
      </header>

      {sp.ok === "criado" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Serviço criado.
        </p>
      )}
      {sp.erro && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          Não salvou. Confira os campos.
        </p>
      )}

      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-bold">Novo serviço</h2>
        <form action={createServiceAction} className="mt-4 grid gap-3 sm:grid-cols-6">
          <input name="name" required placeholder="Corte masculino" className="rounded-xl border border-black/10 px-3 py-2 text-sm sm:col-span-2" />
          <select name="category" defaultValue="HAIR" className="rounded-xl border border-black/10 px-3 py-2 text-sm">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{label(SERVICE_CATEGORY, category)}</option>
            ))}
          </select>
          <input name="durationMinutes" required type="number" min="5" step="5" placeholder="45" className="rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <input name="defaultPrice" required type="number" min="0" step="0.01" placeholder="60,00" className="rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <button className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Adicionar</button>
          <textarea name="description" placeholder="Descrição opcional" className="min-h-20 rounded-xl border border-black/10 px-3 py-2 text-sm sm:col-span-6" />
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 px-4 py-3 sm:px-5">
          <h2 className="font-bold">Catálogo</h2>
        </div>
        {catalog.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-muted)]">Nenhum serviço cadastrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--color-surface)] text-left text-[11px] uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-2.5">Serviço</th>
                  <th className="px-3 py-2.5">Categoria</th>
                  <th className="px-3 py-2.5 text-right">Duração</th>
                  <th className="px-3 py-2.5 text-right">Preço</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((service) => (
                  <tr key={service.id} className="border-t border-black/5">
                    <td className="px-4 py-3 font-bold">{service.name}</td>
                    <td className="px-3 py-3">{label(SERVICE_CATEGORY, service.category)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{service.durationMinutes} min</td>
                    <td className="px-3 py-3 text-right tabular-nums">{brl(service.defaultPrice)}</td>
                    <td className="px-3 py-3">{label(SERVICE_STATUS, service.status)}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={setServiceStatusAction}>
                        <input type="hidden" name="id" value={service.id} />
                        <input type="hidden" name="status" value={service.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                        <button className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]">
                          {service.status === "ACTIVE" ? "Inativar" : "Ativar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
