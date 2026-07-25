import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { getConnectionState, evolutionConfigured } from "@/lib/evolution";
import { WhatsappConnect } from "./WhatsappConnect";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const { tenant } = await requireTenant();
  const configured = evolutionConfigured();
  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  const state = configured ? await getConnectionState(instance) : "unknown";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold">WhatsApp</h1>
      <p className="mt-1 text-[var(--color-muted)]">
        Conecte o número do negócio para o agente de IA atender no WhatsApp. Você pode reconectar aqui sempre que precisar.
      </p>
      <div className="mt-6">
        <WhatsappConnect initialState={state} />
      </div>
      <p className="mt-6 text-xs text-[var(--color-muted)]">
        Dica: use o número de WhatsApp dedicado ao atendimento. Ao conectar aqui, esse número passa a ser gerenciado pela automação.
      </p>
    </div>
  );
}
