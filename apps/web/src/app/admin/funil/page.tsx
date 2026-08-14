import { requireTenant } from "@/lib/tenant";
import { services } from "@barbearia-ai/core";
import { FunilBoard, type Board } from "./FunilBoard";
import { funnelColumnViews } from "@/lib/funnel-config";

export const dynamic = "force-dynamic";

export default async function FunilPage() {
  const { tenant } = await requireTenant();
  const [grouped, settings] = await Promise.all([
    services.conversationService.board(tenant.id),
    services.tenantService.getSettings(tenant.id),
  ]);
  const columns = funnelColumnViews(settings?.funnelConfig);
  const customIds = new Set(
    columns.filter((column) => column.kind === "custom").map((column) => column.id)
  );

  // O estágio funcional continua vindo do core. A coluna customizada só muda
  // o agrupamento visual; agendamento ativo sempre prevalece para não esconder
  // um compromisso real numa coluna criada pelo usuário.
  const initial: Board = Object.fromEntries(columns.map((column) => [column.id, []]));
  for (const [stage, cards] of Object.entries(grouped)) {
    for (const card of cards) {
      const target = card.activeAppointmentAt
        ? "AGENDADO"
        : card.funnelColumnId && customIds.has(card.funnelColumnId)
          ? card.funnelColumnId
          : stage;
      (initial[target] ??= []).push({
        ...card,
        lastMessageAt: card.lastMessageAt.toISOString(),
        activeAppointmentAt: card.activeAppointmentAt?.toISOString() ?? null,
      });
    }
  }
  const total = Object.values(initial).reduce((n, cards) => n + cards.length, 0);

  return (
    <div>
      {total === 0 ? (
        <>
          <h1 className="text-2xl font-extrabold">Funil</h1>
          <p className="mt-6 text-[var(--color-muted)]">
            Nenhuma conversa ainda. Os cards aparecem aqui quando alguém manda mensagem no WhatsApp conectado.
          </p>
        </>
      ) : (
        <FunilBoard
          initial={initial}
          tenantId={tenant.id}
          columns={columns.filter((column) => column.visible)}
        />
      )}
    </div>
  );
}
