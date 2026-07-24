import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { fmtDateTime } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { replyAction, takeOverAction, releaseAction, setTagsAction } from "../actions";

export const dynamic = "force-dynamic";

const SENDER_STYLE: Record<string, string> = {
  CONTACT: "self-start bg-white",
  BOT: "self-end bg-[#dcf8c6]",
  AGENT: "self-end bg-[#d1e7ff]",
};
const SENDER_LABEL: Record<string, string> = { CONTACT: "", BOT: "🤖 IA", AGENT: "🧑 Você" };

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenant } = await requireTenant();
  const convo = await services.conversationService.get(tenant.id, id);
  if (!convo) notFound();

  return (
    <div className="flex h-[calc(100vh-3rem)] max-w-3xl flex-col">
      <AutoRefresh seconds={10} />
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 border-b border-black/5 pb-3">
        <div>
          <Link href="/admin/conversas" className="text-xs font-semibold text-[var(--color-primary)]">← Conversas</Link>
          <div className="font-extrabold">{convo.contactName || convo.phone}</div>
          <div className="text-xs text-[var(--color-muted)]">{convo.phone}</div>
        </div>
        <div className="flex items-center gap-2">
          {convo.botPaused ? (
            <form action={releaseAction}><input type="hidden" name="id" value={convo.id} /><button className="rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white">Devolver ao bot</button></form>
          ) : (
            <form action={takeOverAction}><input type="hidden" name="id" value={convo.id} /><button className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">Assumir (pausar IA)</button></form>
          )}
        </div>
      </div>

      {/* Tags */}
      <form action={setTagsAction} className="flex items-center gap-2 border-b border-black/5 py-2">
        <input type="hidden" name="id" value={convo.id} />
        <span className="text-xs text-[var(--color-muted)]">Tags:</span>
        <input name="tags" defaultValue={convo.tags.join(", ")} placeholder="desligar-ia, cliente-vip..." className="flex-1 rounded-lg border border-black/10 px-2 py-1 text-sm" />
        <button className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold hover:bg-black/10">Salvar</button>
      </form>

      {/* Mensagens */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-4">
        {convo.messages.map((m) => (
          <div key={m.id} className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${SENDER_STYLE[m.sender] ?? "self-start bg-white"}`}>
            {SENDER_LABEL[m.sender] && <div className="text-[10px] font-bold text-[var(--color-muted)]">{SENDER_LABEL[m.sender]}</div>}
            <div className="whitespace-pre-wrap">{m.text}</div>
            <div className="mt-0.5 text-right text-[10px] text-[var(--color-muted)]">{fmtDateTime(m.createdAt)}</div>
          </div>
        ))}
        {convo.messages.length === 0 && <p className="text-center text-[var(--color-muted)]">Sem mensagens.</p>}
      </div>

      {/* Responder */}
      <form action={replyAction} className="flex items-center gap-2 border-t border-black/5 pt-3">
        <input type="hidden" name="id" value={convo.id} />
        <input type="hidden" name="phone" value={convo.phone} />
        <input name="text" required autoComplete="off" placeholder="Escreva uma resposta..." className="flex-1 rounded-full border border-black/10 px-4 py-2" />
        <button className="rounded-full bg-[#25D366] px-5 py-2 font-semibold text-white">Enviar</button>
      </form>
    </div>
  );
}
