import { requireTenant } from "@/lib/tenant";
import { getConnectionState, evolutionConfigured } from "@/lib/evolution";
import { WhatsappConnect } from "./WhatsappConnect";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  await requireTenant();
  const configured = evolutionConfigured();
  const state = configured ? await getConnectionState() : "unknown";

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
