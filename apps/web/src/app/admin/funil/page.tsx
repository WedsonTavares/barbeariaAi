import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { FunilBoard, type Board } from "./FunilBoard";

export const dynamic = "force-dynamic";

export default async function FunilPage() {
  const { tenant } = await requireTenant();
  const grouped = await services.conversationService.board(tenant.id);

  // Datas viram string pra atravessar a fronteira server → client component.
  const initial: Board = Object.fromEntries(
    Object.entries(grouped).map(([stage, cards]) => [
      stage,
      cards.map((c) => ({
        ...c,
        lastMessageAt: c.lastMessageAt.toISOString(),
        activeBookingAt: c.activeBookingAt?.toISOString() ?? null,
      })),
    ])
  );
  const total = Object.values(initial).reduce((n, cards) => n + cards.length, 0);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-extrabold">Funil</h1>
      </div>

      {total === 0 ? (
        <p className="mt-6 text-[var(--color-muted)]">
          Nenhuma conversa ainda. Os cards aparecem aqui quando alguém manda mensagem no WhatsApp conectado.
        </p>
      ) : (
        <div className="mt-5">
          <FunilBoard initial={initial} />
        </div>
      )}
    </div>
  );
}
