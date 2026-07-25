import Link from "next/link";
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
      cards.map((c) => ({ ...c, lastMessageAt: c.lastMessageAt.toISOString() })),
    ])
  );
  const total = Object.values(initial).reduce((n, cards) => n + cards.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Funil</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Arraste os cards entre as colunas — as tags e a IA acompanham automaticamente.
          </p>
        </div>
        <Link href="/admin/conversas" className="rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">
          Ver como lista
        </Link>
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
