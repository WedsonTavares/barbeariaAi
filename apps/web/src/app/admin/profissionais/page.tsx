import { UserRoundCog } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { createProfessionalAction, setProfessionalStatusAction } from "./actions";
import { ExpedienteEditor } from "./ExpedienteEditor";

export const dynamic = "force-dynamic";

export default async function ProfissionaisPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const [professionals, expedientes, folgas] = await Promise.all([
    services.professionalService.list(tenant.id),
    services.scheduleService.listAll(tenant.id),
    services.scheduleService.listTimeOff(tenant.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <UserRoundCog className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">Profissionais</h1>
          <p className="text-sm text-[var(--color-muted)]">Quem aparece na agenda e pode receber agendamentos.</p>
        </div>
      </header>

      {sp.ok && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          {sp.ok === "expediente" ? "Expediente salvo." : sp.ok === "folga" ? "Folga registrada." : "Profissional criado."}
        </p>
      )}
      {sp.erro && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          {sp.erro === "validacao" ? "Não salvou. Confira os campos." : sp.erro}
        </p>
      )}

      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-bold">Novo profissional</h2>
        <form action={createProfessionalAction} className="mt-4 grid gap-3 sm:grid-cols-6">
          <input name="name" required placeholder="Nome" className="rounded-xl border border-black/10 px-3 py-2 text-sm sm:col-span-2" />
          <input name="phone" placeholder="WhatsApp" className="rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <input name="email" type="email" placeholder="E-mail" className="rounded-xl border border-black/10 px-3 py-2 text-sm" />
          <input name="color" type="color" defaultValue="#2563EB" className="h-10 rounded-xl border border-black/10 px-2 py-1" />
          <button className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Adicionar</button>
          <input name="defaultCalendarId" placeholder="Calendar ID opcional" className="rounded-xl border border-black/10 px-3 py-2 text-sm sm:col-span-3" />
          <textarea name="bio" placeholder="Bio opcional" className="min-h-20 rounded-xl border border-black/10 px-3 py-2 text-sm sm:col-span-3" />
        </form>
      </section>

      <section className="grid gap-3 xl:grid-cols-2">
        {professionals.map((professional) => (
          <article key={professional.id} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: professional.color }} aria-hidden />
                  <h2 className="truncate font-bold">{professional.name}</h2>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {professional.phone || "Sem telefone"} · {professional.status}
                </p>
                {professional.defaultCalendarId && (
                  <p className="mt-1 truncate text-xs text-[var(--color-muted)]">Calendar: {professional.defaultCalendarId}</p>
                )}
              </div>
              <form action={setProfessionalStatusAction}>
                <input type="hidden" name="id" value={professional.id} />
                <input type="hidden" name="status" value={professional.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                <button className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]">
                  {professional.status === "ACTIVE" ? "Inativar" : "Ativar"}
                </button>
              </form>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {professional.services.length === 0 ? (
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-muted)]">Atende todos os serviços</span>
              ) : (
                professional.services.map((item) => (
                  <span key={item.id} className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold">
                    {item.service.name}
                  </span>
                ))
              )}
            </div>

            <ExpedienteEditor
              professionalId={professional.id}
              expediente={expedientes.filter((e) => e.professionalId === professional.id)}
              folgas={folgas.filter((f) => f.professionalId === professional.id)}
            />
          </article>
        ))}
        {professionals.length === 0 && (
          <p className="rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-[var(--color-muted)]">
            Nenhum profissional cadastrado ainda.
          </p>
        )}
      </section>
    </div>
  );
}
