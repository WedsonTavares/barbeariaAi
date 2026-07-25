"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { X, Pencil, Check, Bot, UserRound, Send } from "lucide-react";
import {
  loadCardAction, replyFromFunilAction, setTagsFromFunilAction,
  updateContactAction, toggleBotAction,
} from "./actions";

type Detail = Awaited<ReturnType<typeof loadCardAction>>;

const BUBBLE: Record<string, string> = {
  CONTACT: "self-start bg-white",
  BOT: "self-end bg-[#dcf8c6]",
  AGENT: "self-end bg-[#d1e7ff]",
};
const WHO: Record<string, string> = { CONTACT: "", BOT: "🤖 IA", AGENT: "🧑 Equipe" };
const STAGE_LABEL: Record<string, string> = {
  NOVO_LEAD: "Novo lead", IA_ATENDENDO: "IA atendendo", SUPORTE_HUMANO: "Suporte humano",
  AGENDADO: "Agendado", POS_FESTA: "Pós-festa",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/**
 * Workspace do card: contato à esquerda, conversa no meio, contexto à direita.
 * Abre por cima do quadro (Esc ou clique fora fecha) — sem sair do funil.
 */
export function CardDrawer({
  id, openTags, onClose, onChanged,
}: { id: string; openTags?: boolean; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [tagsOpen, setTagsOpen] = useState(Boolean(openTags));
  const [tagsDraft, setTagsDraft] = useState("");
  const [reply, setReply] = useState("");
  const [pending, start] = useTransition();
  const feedRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const r = await loadCardAction(id);
    setD(r);
    setNameDraft(r?.contactName ?? "");
    setTagsDraft((r?.tags ?? []).join(", "));
    setLoading(false);
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (tagsOpen ? setTagsOpen(false) : onClose()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, tagsOpen]);

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [d?.messages.length]);

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-center bg-[var(--color-surface)]">
      <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface)]">
        {/* topo */}
        <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-extrabold">{d?.contactName || d?.phone || "Carregando..."}</div>
            {d && <div className="text-xs text-[var(--color-muted)]">{STAGE_LABEL[d.stage] ?? d.stage}</div>}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="grid size-9 place-items-center rounded-full hover:bg-[var(--color-surface)]">
            <X className="size-5" />
          </button>
        </div>

        {loading || !d ? (
          <div className="grid flex-1 place-items-center text-[var(--color-muted)]">Carregando…</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_1fr_260px]">
            {/* ESQUERDA — contato */}
            <aside className="min-h-0 overflow-y-auto border-black/5 bg-white p-4 md:border-r">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Contato</h3>

              <div className="mt-3">
                <label className="text-[11px] font-semibold text-[var(--color-muted)]">Nome</label>
                {editingName ? (
                  <div className="mt-1 flex gap-1">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      autoFocus
                      className="min-w-0 flex-1 rounded-lg border border-black/10 px-2 py-1 text-sm"
                    />
                    <button
                      aria-label="Salvar nome"
                      disabled={pending}
                      onClick={() => start(async () => {
                        await updateContactAction(d.id, nameDraft);
                        setEditingName(false); await refresh(); onChanged();
                      })}
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-white"
                    >
                      <Check className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold">{d.contactName || "—"}</span>
                    <button aria-label="Editar nome" onClick={() => setEditingName(true)} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="text-[11px] font-semibold text-[var(--color-muted)]">Telefone</div>
                <a href={`https://wa.me/${d.phone}`} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">
                  {d.phone}
                </a>
              </div>

              <div className="mt-3">
                <div className="text-[11px] font-semibold text-[var(--color-muted)]">Primeiro contato</div>
                <div className="text-sm">{fmt(d.createdAt)}</div>
              </div>

              <div className="mt-5">
                <div className="mb-1 text-[11px] font-semibold text-[var(--color-muted)]">Atendimento</div>
                <button
                  disabled={pending}
                  onClick={() => start(async () => { await toggleBotAction(d.id, !d.botPaused); await refresh(); onChanged(); })}
                  className={`flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                    d.botPaused
                      ? "bg-[var(--color-primary)] text-white"
                      : "border border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  {d.botPaused ? <><Bot className="size-4" /> Devolver ao bot</> : <><UserRound className="size-4" /> Assumir (pausar IA)</>}
                </button>
              </div>
            </aside>

            {/* MEIO — conversa (altura limitada quando empilhado em telas estreitas) */}
            <section className="flex max-h-[60vh] min-h-0 flex-col bg-[var(--color-surface)] md:max-h-none">
              <div ref={feedRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
                {d.messages.map((m) => (
                  <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${BUBBLE[m.sender] ?? "self-start bg-white"}`}>
                    {WHO[m.sender] && <div className="text-[10px] font-bold text-[var(--color-muted)]">{WHO[m.sender]}</div>}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className="mt-0.5 text-right text-[10px] text-[var(--color-muted)]">{fmt(m.createdAt)}</div>
                  </div>
                ))}
                {d.messages.length === 0 && <p className="my-auto text-center text-[var(--color-muted)]">Sem mensagens.</p>}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = reply.trim();
                  if (!t) return;
                  setReply("");
                  start(async () => { await replyFromFunilAction(d.id, d.phone, t); await refresh(); onChanged(); });
                }}
                className="flex items-center gap-2 border-t border-black/5 bg-white p-3"
              >
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escreva uma resposta..."
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-full border border-black/10 px-4 py-2 text-sm"
                />
                <button disabled={pending || !reply.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white disabled:opacity-50">
                  <Send className="size-4" />
                </button>
              </form>
            </section>

            {/* DIREITA — contexto */}
            <aside className="min-h-0 overflow-y-auto border-black/5 bg-white p-4 md:border-l">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-muted)]">Contexto</h3>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--color-muted)]">Tags</span>
                  <button onClick={() => setTagsOpen(true)} className="text-[11px] font-bold text-[var(--color-primary)] hover:underline">
                    editar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {d.tags.length ? d.tags.map((t) => (
                    <span key={t} className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] font-semibold">{t}</span>
                  )) : <span className="text-xs text-[var(--color-muted)]">sem tags</span>}
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] font-semibold text-[var(--color-muted)]">Resumo da IA</div>
                {d.notes ? (
                  <div className="mt-1 rounded-xl bg-amber-50 p-3">
                    <p className="whitespace-pre-wrap text-sm text-amber-900">{d.notes}</p>
                    {d.notesAt && <div className="mt-1 text-[10px] text-amber-700">{fmt(d.notesAt)}</div>}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-[var(--color-muted)]">A IA ainda não gravou um resumo desta conversa.</p>
                )}
              </div>

              <div className="mt-5">
                <div className="text-[11px] font-semibold text-[var(--color-muted)]">Mensagens</div>
                <div className="text-sm font-semibold">{d.messages.length}</div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* modal de tags */}
      {tagsOpen && d && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={() => setTagsOpen(false)}>
          <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="font-bold">Tags do contato</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Separe por vírgula. <b>desligar-ia</b> e <b>atendimento-humano</b> pausam o atendimento automático.
            </p>
            <input
              value={tagsDraft}
              onChange={(e) => setTagsDraft(e.target.value)}
              autoFocus
              placeholder="cliente-vip, orçamento-enviado..."
              className="mt-3 w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-1">
              {["cliente-vip", "desligar-ia", "atendimento-humano", "orçamento-enviado"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTagsDraft((v) => (v.split(",").map((s) => s.trim()).filter(Boolean).includes(t) ? v : (v.trim() ? `${v.replace(/,\s*$/, "")}, ${t}` : t)))}
                  className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-[11px] font-semibold hover:bg-black/10"
                >
                  + {t}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setTagsOpen(false)} className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[var(--color-surface)]">
                Cancelar
              </button>
              <button
                disabled={pending}
                onClick={() => start(async () => {
                  await setTagsFromFunilAction(d.id, tagsDraft);
                  setTagsOpen(false); await refresh(); onChanged();
                })}
                className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
