import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";

function Card({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="text-sm text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--color-muted)]">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const { tenant } = await requireTenant();
  const [s, m] = await Promise.all([
    services.financeService.dashboard(tenant.id),
    services.financeService.monthSummary(tenant.id),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card label="Faturamento do mês" value={brl(m.faturamentoBruto)} />
        <Card label="Lucro estimado" value={brl(m.lucroEstimado)} hint={`Custos: ${brl(m.custos)}`} />
        <Card label="A receber" value={brl(m.aReceber)} />
        <Card label="Reservas hoje" value={s.reservasHoje} />
        <Card label="Sinais pendentes" value={s.sinaisPendentes} />
        <Card label="Orçamentos abertos" value={s.orcamentosAbertos} />
        <Card label="Brinquedos disponíveis" value={s.brinquedosDisponiveis} />
        <Card label="Em manutenção" value={s.emManutencao} />
        <Card label="Ticket médio" value={brl(m.ticketMedio)} />
      </div>

      <h2 className="mt-10 text-lg font-bold">Próximas retiradas (48h)</h2>
      <div className="mt-3 space-y-2">
        {s.proximasRetiradas.length === 0 && <p className="text-[var(--color-muted)]">Nada nas próximas 48h.</p>}
        {s.proximasRetiradas.map((b) => (
          <div key={b.id} className="flex items-center justify-between rounded-xl border border-black/5 bg-white p-3">
            <span className="font-semibold">{b.customer.name}</span>
            <span className="text-sm text-[var(--color-muted)]">{b.pickupTime?.toLocaleString("pt-BR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
