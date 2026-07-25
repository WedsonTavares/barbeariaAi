import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { fmtDateTime } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SubmitButton } from "@/components/SubmitButton";
import { stageUi, initials } from "@/lib/stage";
import { replyAction, takeOverAction, releaseAction, setTagsAction } from "../actions";

export const dynamic = "force-dynamic";

const SENDER_STYLE: Record<string, string> = {
  CONTACT: "self-start bg-white",
  BOT: "self-end bg-[#dcf8c6]",
  AGENT: "self-end bg-[#d1e7ff]",
};
const SENDER_LABEL: Record<string, string> = { CONTACT: "", BOT: "🤖 IA", AGENT: "🧑 Você" };
const STAGE_TAGS = new Set(["novo-lead", "atendimento-humano", "agendado", "pos-festa"]);

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenant } = await requireTenant();
  const convo = await services.conversationService.get(tenant.id, id);
  if (!convo) notFound();

  const s = stageUi(convo.stage);
  const livres = convo.tags.filter((t) => !STAGE_TAGS.has(t));

  return (
    <div className="flex h-[calc(100vh-3rem)] max-w-3xl flex-col">
      <AutoRefresh seconds={10} />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 border-b border-black/5 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-sm font-bold text-[var(--color-muted)]" aria-hidden>
            {initials(convo.contactName, convo.phone)}
          </span>
          <div className="min-w-0">
            <Link href="/admin/conversas" className="text-xs font-semibold text-[var(--color-primary)]">← Conversas</Link>
            <div className="flex items-center gap-2">
              <span className="truncate font-extrabold">{convo.contactName || convo.phone}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}>{s.label}</span>
            </div>
            <a href={`https://wa.me/${convo.phone}`} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-muted)] hover:underline">
              {convo.phone}
            </a>
          </div>
        </div>
        <div className="shrink-0">
          {convo.botPaused ? (
            <form action={releaseAction}><input type="hidden" name="id" value={convo.id} /><button className="rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white">Devolver ao bot</button></form>
          ) : (
            <form action={takeOverAction}><input type="hidden" name="id" value={convo.id} /><button className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">Assumir (pausar IA)</button></form>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="border-b border-black/5 py-2">
        {livres.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {livres.map((t) => (
              <span key={t} className="rounded border border-black/10 px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-muted)]">{t}</span>
            ))}
          </div>
        )}
        <form action={setTagsAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={convo.id} />
          <span className="text-xs text-[var(--color-muted)]">Tags:</span>
          <input name="tags" defaultValue={convo.tags.join(", ")} placeholder="desligar-ia, cliente-vip..." className="flex-1 rounded-lg border border-black/10 px-2 py-1 text-sm" />
          <button className="rounded-full bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold hover:bg-black/10">Salvar</button>
        </form>
      </div>

      {/* Resumo do atendimento escrito pela IA (tool "notas") */}
      {convo.notes && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
            📝 Resumo da IA{convo.notesAt ? ` · ${fmtDateTime(convo.notesAt)}` : ""}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{convo.notes}</p>
        </div>
      )}

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
        <SubmitButton className="rounded-full bg-[#25D366] px-5 py-2 font-semibold text-white" pendingText="Enviando...">Enviar</SubmitButton>
      </form>
    </div>
  );
}
