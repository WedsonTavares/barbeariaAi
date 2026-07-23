import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { createCustomer } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const customers = await services.customerService.list(tenant.id);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-2xl font-extrabold">Clientes</h1>
        {sp?.erro && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">Confira os campos: nome e WhatsApp são obrigatórios.</p>}
        {sp?.ok && <p role="status" className="mt-3 rounded-lg bg-green-100 p-3 text-sm text-green-700">Cliente adicionado!</p>}
        <div className="mt-4 space-y-2">
          {customers.map((c) => (
            <div key={c.id} className="rounded-xl border border-black/5 bg-white p-3">
              <div className="font-semibold">{c.name}</div>
              <div className="text-sm text-[var(--color-muted)]">{c.phone} · {c.neighborhood ?? "-"}</div>
            </div>
          ))}
          {customers.length === 0 && <p className="text-[var(--color-muted)]">Nenhum cliente ainda.</p>}
        </div>
      </div>
      <form action={createCustomer} className="h-fit space-y-3 rounded-2xl border border-black/5 bg-white p-5">
        <h2 className="font-bold">Novo cliente</h2>
        <input name="name" placeholder="Nome" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="phone" placeholder="WhatsApp" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="email" type="email" placeholder="E-mail (opcional)" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="neighborhood" placeholder="Bairro" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><input type="checkbox" name="imageConsent" /> Autoriza uso de imagem (LGPD)</label>
        <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Adicionar</button>
      </form>
    </div>
  );
}
