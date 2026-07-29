"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Send,
  Plus,
  Check,
  Pencil,
  Bot,
  UserRound,
  MessageSquare,
  X,
  ChevronLeft,
} from "lucide-react";
import { stageUi, initials } from "@/lib/stage";
import {
  TAG_CATALOG,
  STAGE_ONLY_TAGS,
  normalizeTag,
} from "@/lib/tags";
import {
  loadConversationAction,
  replyAction,
  toggleTagAction,
  toggleBotAction,
  updateContactAction,
} from "./actions";

export type ConversaRow = {
  id: string;
  phone: string;
  contactName: string | null;
  tags: string[];
  botPaused: boolean;
  unread: number;
  stage: string;
  lastMessageAt: string;
};

type Detail = Awaited<ReturnType<typeof loadConversationAction>>;
type Filtro = "todos" | "nao-lidos" | "pausadas";

const BUBBLE: Record<string, string> = {
  CONTACT: "self-start bg-white",
  BOT: "self-end bg-[#dcf8c6]",
  AGENT: "self-end bg-[#d1e7ff]",
};
const WHO: Record<string, string> = {
  CONTACT: "",
  BOT: "🤖 IA",
  AGENT: "🧑 Equipe",
};

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SP = "America/Sao_Paulo";
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: SP, day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHour = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" }) : "—";
const brlShort = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Rótulo/cor do status da reserva no painel de contexto (mesma paleta da Agenda). */
const BOOKING_UI: Record<string, { label: string; chip: string }> = {
  LEAD: { label: "Lead", chip: "bg-slate-100 text-slate-700" },
  QUOTE_SENT: { label: "Orçamento", chip: "bg-amber-100 text-amber-800" },
  WAITING_DEPOSIT: { label: "Aguardando sinal", chip: "bg-orange-100 text-orange-800" },
  CONFIRMED: { label: "Confirmada", chip: "bg-blue-100 text-blue-800" },
  IN_DELIVERY: { label: "Em entrega", chip: "bg-purple-100 text-purple-800" },
  MOUNTED: { label: "Montado", chip: "bg-fuchsia-100 text-fuchsia-800" },
  PICKED_UP: { label: "Retirado", chip: "bg-teal-100 text-teal-800" },
  FINISHED: { label: "Finalizada", chip: "bg-green-100 text-green-800" },
  CANCELED: { label: "Cancelada", chip: "bg-red-100 text-red-700" },
};
const stageBooking = (status: string) => BOOKING_UI[status] ?? BOOKING_UI.LEAD!;

/**
 * Inbox em 3 colunas: lista à esquerda, conversa no meio, detalhes do contato à
 * direita — tudo numa tela só, sem navegar. Abaixo do md vira uma coluna por vez
 * (a lista é a "home"; escolher um contato abre a conversa).
 */
export function ConversasWorkspace({
  items,
  initialId,
}: {
  items: ConversaRow[];
  initialId?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(
    initialId ?? items[0]?.id ?? null
  );
  const [d, setD] = useState<Detail>(null);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [q, setQ] = useState("");
  const [pane, setPane] = useState<"lista" | "conversa" | "detalhes">("lista");
  const [reply, setReply] = useState("");
  const [pending, start] = useTransition();
  const feedRef = useRef<HTMLDivElement>(null);

  async function refresh(id = selected) {
    if (!id) return setD(null);
    const r = await loadConversationAction(id);
    setD(r);
    setLoading(false);
  }

  // Troca de conversa: limpa o rascunho pra não enviar texto no contato errado.
  useEffect(() => {
    setReply("");
    if (!selected) return setD(null);
    setLoading(true);
    void refresh(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Quase-realtime do thread aberto (a lista se atualiza pelo AutoRefresh do server).
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => void refresh(selected), 12_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [d?.messages.length, d?.id]);

  const naoLidos = useMemo(
    () => items.reduce((n, c) => n + (c.unread > 0 ? 1 : 0), 0),
    [items]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((c) => {
      if (filtro === "nao-lidos" && c.unread === 0) return false;
      if (filtro === "pausadas" && !c.botPaused) return false;
      if (!term) return true;
      return (
        (c.contactName ?? "").toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        c.tags.some((t) => t.includes(term))
      );
    });
  }, [items, filtro, q]);

  function abrir(id: string) {
    setSelected(id);
    setPane("conversa");
    router.replace(`/admin/conversas?c=${id}`, { scroll: false });
    router.refresh(); // zera o badge de não-lido na lista
  }

  function enviar() {
    const t = reply.trim();
    if (!t || !d) return;
    setReply("");
    start(async () => {
      await replyAction(d.id, d.phone, t);
      await refresh(d.id);
      router.refresh();
    });
  }

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[30rem] flex-col md:h-[calc(100dvh-6.5rem)]">
      {/* Abas: só abaixo do md, onde as 3 colunas não cabem lado a lado */}
      <div className="mb-2 flex items-center gap-1 md:hidden">
        {(
          [
            { key: "lista", label: "Conversas", badge: naoLidos },
            { key: "conversa", label: "Conversa" },
            { key: "detalhes", label: "Detalhes" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setPane(t.key)}
            disabled={t.key !== "lista" && !selected}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
              pane === t.key
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            }`}
          >
            {t.label}
            {"badge" in t && t.badge ? (
              <span className="ml-1 rounded-full bg-[#25D366] px-1.5 text-[10px] text-white">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-black/5 bg-white md:grid-cols-[220px_minmax(0,1fr)_minmax(260px,320px)] xl:grid-cols-[240px_minmax(0,1fr)_minmax(260px,320px)]">
        {/* ─────────── ESQUERDA: lista ─────────── */}
        <aside
          className={`flex min-h-0 flex-col border-black/5 md:flex md:border-r ${pane === "lista" ? "flex" : "hidden"}`}
        >
          <div className="border-b border-black/5 px-3 py-3">
            <div className="flex items-baseline justify-between">
              <h1 className="text-base font-extrabold">Conversas</h1>
              <span className="text-xs text-[var(--color-muted)]">
                {items.length}
              </span>
            </div>

            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nome, telefone ou tag"
                className="w-full rounded-lg border border-black/10 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="mt-2 flex items-center gap-0.5">
              {(
                [
                  { key: "todos", label: "Todos" },
                  { key: "nao-lidos", label: "Não lidos", n: naoLidos },
                  { key: "pausadas", label: "IA pausada" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFiltro(f.key)}
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                    filtro === f.key
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:bg-black/5"
                  }`}
                >
                  {f.label}
                  {"n" in f && f.n ? ` (${f.n})` : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.map((c) => {
              const s = stageUi(c.stage);
              const active = c.id === selected;
              return (
                <button
                  key={c.id}
                  onClick={() => abrir(c.id)}
                  className={`flex w-full items-start gap-2.5 border-b border-black/5 px-3 py-2.5 text-left transition ${
                    active
                      ? "bg-[var(--color-surface)]"
                      : "hover:bg-black/[0.02]"
                  }`}
                >
                  <span
                    className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-[11px] font-bold text-[var(--color-muted)]"
                    aria-hidden
                  >
                    {initials(c.contactName, c.phone)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${c.unread > 0 ? "font-extrabold" : "font-semibold"}`}
                      >
                        {c.contactName || c.phone}
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${s.chip}`}
                      >
                        {s.label}
                      </span>
                      {c.botPaused && (
                        <span className="text-[9px] font-bold text-rose-600">
                          ⏸ IA
                        </span>
                      )}
                    </span>
                  </span>

                  {c.unread > 0 && (
                    <span className="mt-1 shrink-0 rounded-full bg-[#25D366] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
                {items.length === 0
                  ? "Nenhuma conversa ainda. Elas aparecem quando alguém manda mensagem no WhatsApp conectado."
                  : "Nada encontrado com esse filtro."}
              </p>
            )}
          </div>
        </aside>

        {/* ─────────── MEIO: conversa ─────────── */}
        <section
          className={`min-h-0 flex-col bg-[var(--color-surface)] md:flex ${pane === "conversa" ? "flex" : "hidden"}`}
        >
          {!d ? (
            <div className="grid flex-1 place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
              {loading ? (
                "Carregando…"
              ) : (
                <>
                  <MessageSquare className="mx-auto mb-2 size-8 opacity-40" />
                  Escolha uma conversa à esquerda.
                </>
              )}
            </div>
          ) : (
            <>
              <header className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5">
                <button
                  onClick={() => setPane("lista")}
                  aria-label="Voltar"
                  className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-[var(--color-surface)] md:hidden"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-[11px] font-bold text-[var(--color-muted)]"
                  aria-hidden
                >
                  {initials(d.contactName, d.phone)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold">
                    {d.contactName || d.phone}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
                    <span
                      className={`size-1.5 rounded-full ${d.botPaused ? "bg-rose-500" : "bg-emerald-500"}`}
                    />
                    {d.botPaused ? "Você no comando" : "IA atendendo"}
                  </div>
                </div>
                <AssumirButton
                  paused={d.botPaused}
                  pending={pending}
                  onClick={() =>
                    start(async () => {
                      await toggleBotAction(d.id, !d.botPaused);
                      await refresh(d.id);
                      router.refresh();
                    })
                  }
                />
              </header>

              <div
                ref={feedRef}
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
              >
                {d.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${BUBBLE[m.sender] ?? "self-start bg-white"}`}
                  >
                    {WHO[m.sender] && (
                      <div className="text-[10px] font-bold text-[var(--color-muted)]">
                        {WHO[m.sender]}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    <div className="mt-0.5 text-right text-[10px] text-[var(--color-muted)]">
                      {fmt(m.createdAt)}
                    </div>
                  </div>
                ))}
                {d.messages.length === 0 && (
                  <p className="my-auto text-center text-[var(--color-muted)]">
                    Sem mensagens.
                  </p>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar();
                }}
                className="flex items-center gap-2 border-t border-black/5 bg-white p-3"
              >
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Escreva uma resposta..."
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-full border border-black/10 px-4 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                />
                <button
                  disabled={pending || !reply.trim()}
                  aria-label="Enviar"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white transition disabled:opacity-40"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </>
          )}
        </section>

        {/* ─────────── DIREITA: detalhes do contato ─────────── */}
        <aside
          className={`min-h-0 flex-col overflow-y-auto border-black/5 md:flex md:border-l ${pane === "detalhes" ? "flex" : "hidden"}`}
        >
          {d ? (
            <DetalhesContato
              d={d}
              pending={pending}
              onSaveName={(name) =>
                start(async () => {
                  await updateContactAction(d.id, name);
                  await refresh(d.id);
                  router.refresh();
                })
              }
              onToggleTag={(tag, on) =>
                start(async () => {
                  await toggleTagAction(d.id, tag, on);
                  await refresh(d.id);
                  router.refresh();
                })
              }
            />
          ) : (
            <p className="p-4 text-sm text-[var(--color-muted)]">
              Sem contato selecionado.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Botão de assumir/devolver: cor e ícone mudam com o estado, rótulo curto. */
function AssumirButton({
  paused,
  pending,
  onClick,
}: {
  paused: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      title={
        paused
          ? "A IA volta a responder este contato"
          : "Pausa a IA e você assume o atendimento"
      }
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
        paused
          ? "bg-[var(--color-primary)] text-white hover:brightness-110"
          : "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
      }`}
    >
      {paused ? (
        <>
          <Bot className="size-3.5" /> Devolver à IA
        </>
      ) : (
        <>
          <UserRound className="size-3.5" /> Assumir
        </>
      )}
    </button>
  );
}

/** Coluna da direita: identificação no topo, tags, e o contexto logo abaixo. */
function DetalhesContato({
  d,
  pending,
  onSaveName,
  onToggleTag,
}: {
  d: NonNullable<Detail>;
  pending: boolean;
  onSaveName: (name: string) => void;
  onToggleTag: (tag: string, on: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.contactName ?? "");
  const s = stageUi(d.stage);

  useEffect(() => {
    setDraft(d.contactName ?? "");
    setEditing(false);
  }, [d.id, d.contactName]);

  return (
    <div className="p-4">
      {/* Dados básicos */}
      <div className="flex items-start gap-2">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-xs font-bold text-[var(--color-muted)]"
          aria-hidden
        >
          {initials(d.contactName, d.phone)}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-1">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveName(draft);
                  if (e.key === "Escape") setEditing(false);
                }}
                className="min-w-0 flex-1 rounded-lg border border-black/10 px-2 py-1 text-sm"
              />
              <button
                aria-label="Salvar nome"
                disabled={pending}
                onClick={() => onSaveName(draft)}
                className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--color-primary)] text-white"
              >
                <Check className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate font-extrabold">
                {d.contactName || "Sem nome"}
              </span>
              <button
                aria-label="Editar nome"
                onClick={() => setEditing(true)}
                className="shrink-0 text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
          <a
            href={`https://wa.me/${d.phone}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            {d.phone}
          </a>
          <div className="mt-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.chip}`}
            >
              {s.label}
            </span>
          </div>
        </div>
      </div>

      <TagsBox tags={d.tags} pending={pending} onToggle={onToggleTag} />

      {/* Contexto da conversa */}
      <div className="mt-5 border-t border-black/5 pt-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)]">
          Contexto da conversa
        </h3>

        {/* Festas: vêm da tabela de reservas AGORA, não do texto da IA. */}
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase text-[var(--color-muted)]">Festas marcadas</div>
          {d.bookings.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {d.bookings.map((b) => {
                const s = stageBooking(b.status);
                return (
                  <li key={b.id} className="rounded-xl border border-black/5 bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{fmtDay(b.eventDate)}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${s.chip}`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {b.setupTime ? `${fmtHour(b.setupTime)}–${fmtHour(b.pickupTime)} · ` : ""}
                      {brlShort(b.total)}
                    </div>
                    {b.toys.length > 0 && (
                      <div className="truncate text-[11px] text-[var(--color-muted)]">{b.toys.join(", ")}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 rounded-xl border border-dashed border-black/10 p-2 text-xs text-[var(--color-muted)]">
              Nenhuma festa marcada.
            </p>
          )}
        </div>

        <div className="mt-3">
          {d.notes ? (
            <div className="rounded-xl bg-amber-50 p-3">
              <div className="text-[10px] font-bold uppercase text-amber-700">
                📝 Anotação da IA{d.notesAt ? ` · ${fmt(d.notesAt)}` : ""}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
                {d.notes}
              </p>
              {/* O resumo é um retrato do momento; a lista acima é a verdade de hoje. */}
              {d.bookings.length === 0 && /reserva/i.test(d.notes) && (
                <p className="mt-2 border-t border-amber-200 pt-2 text-[10px] font-semibold text-amber-800">
                  ⚠️ Esta anotação cita uma reserva, mas não há festa marcada agora — pode ter sido
                  cancelada ou já realizada.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-black/10 p-3 text-xs text-[var(--color-muted)]">
              Ainda sem anotação — aparece aqui quando uma reserva, lead ou
              escalonamento acontecer.
            </p>
          )}
        </div>

        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted)]">Primeiro contato</dt>
            <dd className="font-semibold">{fmt(d.createdAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted)]">Mensagens</dt>
            <dd className="font-semibold">{d.messages.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted)]">Atendimento</dt>
            <dd
              className={`font-semibold ${d.botPaused ? "text-rose-600" : "text-emerald-600"}`}
            >
              {d.botPaused ? "Humano" : "IA"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/**
 * "Tags 2 ⊕": o contador mostra quantas existem; hover/foco revela os nomes.
 * O + abre a lista com checkbox — marcar/desmarcar grava na hora, uma tag por vez.
 */
function TagsBox({
  tags,
  pending,
  onToggle,
}: {
  tags: string[];
  pending: boolean;
  onToggle: (tag: string, on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Catálogo + as tags soltas que já existem no contato (pra poderem ser desmarcadas).
  const extras = tags.filter(
    (t) => !STAGE_ONLY_TAGS.has(t) && !TAG_CATALOG.some((c) => c.tag === t)
  );
  const lista = [
    ...TAG_CATALOG,
    ...extras.map((t) => ({ tag: t, label: t, hint: undefined })),
  ];
  // Mostra TODAS as tags, inclusive as de etapa (novo-lead/agendado/pos-festa) —
  // elas só não entram em `lista` (o checkbox), mas continuam visíveis aqui.
  // Sem isso, uma conversa em Pós-festa mostrava "sem tags", como se a tag não
  // tivesse sido aplicada — quando na real só não tinha CHIP nenhuma renderizando.
  const visiveis = tags;

  function addCustom() {
    const t = normalizeTag(custom);
    if (!t || tags.includes(t)) return setCustom("");
    onToggle(t, true);
    setCustom("");
  }

  return (
    <div ref={boxRef} className="relative mt-4">
      <div className="flex items-center gap-1">
        <span className="group/tags relative">
          <span
            tabIndex={visiveis.length ? 0 : undefined}
            title={visiveis.length ? `Tags: ${visiveis.join(", ")}` : "Sem tags"}
            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${
              visiveis.length
                ? "cursor-help text-[var(--color-primary)]"
                : "text-[var(--color-muted)]"
            }`}
          >
            Tags
            {visiveis.length > 0 && (
              <span className="rounded-full bg-[var(--color-primary)] px-1.5 text-[9px] leading-4 text-white">
                {visiveis.length}
              </span>
            )}
          </span>
          {visiveis.length > 0 && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-max max-w-64 rounded-lg bg-[var(--color-ink)] px-2.5 py-2 text-[11px] font-medium normal-case leading-4 text-white shadow-lg group-hover/tags:block group-focus-within/tags:block"
            >
              {visiveis.join(", ")}
            </span>
          )}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Escolher tags"
          aria-expanded={open}
          className="grid size-4 place-items-center rounded-full border border-black/15 text-[var(--color-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Plus className="size-2.5" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-6 z-20 w-64 rounded-xl border border-black/10 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[11px] font-bold text-[var(--color-muted)]">
              Marcar tags
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <ul className="max-h-56 overflow-y-auto">
            {lista.map(({ tag, label, hint }) => {
              const on = tags.includes(tag);
              return (
                <li key={tag}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm hover:bg-[var(--color-surface)]">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={pending}
                      onChange={(e) => onToggle(tag, e.target.checked)}
                      className="size-3.5 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {hint && (
                      <span className="shrink-0 text-[9px] font-bold uppercase text-rose-600">
                        {hint}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-1 flex gap-1 border-t border-black/5 pt-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="nova tag"
              className="min-w-0 flex-1 rounded-lg border border-black/10 px-2 py-1 text-xs"
            />
            <button
              onClick={addCustom}
              disabled={pending || !custom.trim()}
              className="shrink-0 rounded-lg bg-[var(--color-primary)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              Criar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
