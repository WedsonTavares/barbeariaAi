import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { getConnectionState, evolutionConfigured } from "@/lib/evolution";
import { WhatsappConnect } from "./WhatsappConnect";

export const dynamic = "force-dynamic";

/** Configurações do negócio. Hoje: conexão do WhatsApp (mais opções entram aqui). */
export default async function ConfiguracoesPage() {
  const { tenant } = await requireTenant();
  const configured = evolutionConfigured();
  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  const state = configured ? await getConnectionState(instance) : "unknown";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold">Configurações</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">Ajustes do seu negócio no Diny.</p>

      <section className="mt-8">
        <h2 className="text-lg font-bold">WhatsApp</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Conecte o número do negócio para o agente de IA atender. Você pode reconectar aqui sempre que precisar.
        </p>
        <div className="mt-4">
          <WhatsappConnect initialState={state} />
        </div>
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Dica: use o número dedicado ao atendimento. Ao conectar aqui, esse número passa a ser gerenciado pela automação.
        </p>
      </section>
    </div>
  );
}
