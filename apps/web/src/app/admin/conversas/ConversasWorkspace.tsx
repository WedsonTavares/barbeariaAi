"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
  Pause,
  CalendarDays,
  CalendarPlus,
  PartyPopper,
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
  summarizeConversationAction,
  mensagensAntigasAction,
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
/** Uma bolha do feed. Sai do próprio retorno da action, pra não duplicar tipo. */
type Msg = NonNullable<Detail>["messages"][number];
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

/** Rótulo/cor do status do agendamento no painel de contexto. */
const APPOINTMENT_UI: Record<string, { label: string; chip: string }> = {
  REQUESTED: { label: "Solicitado", chip: "bg-slate-100 text-slate-700" },
  CONFIRMED: { label: "Confirmado", chip: "bg-blue-100 text-blue-800" },
  ARRIVED: { label: "Cliente chegou", chip: "bg-purple-100 text-purple-800" },
  IN_SERVICE: { label: "Em atendimento", chip: "bg-fuchsia-100 text-fuchsia-800" },
  COMPLETED: { label: "Concluído", chip: "bg-green-100 text-green-800" },
  NO_SHOW: { label: "Não compareceu", chip: "bg-amber-100 text-amber-800" },
  CANCELED: { label: "Cancelado", chip: "bg-red-100 text-red-700" },
};
const appointmentUi = (status: string) => APPOINTMENT_UI[status] ?? APPOINTMENT_UI.REQUESTED!;

/**
 * Ícone da etapa na LISTA da esquerda (só ali).
 *
 * A lista mostrava dois chips de texto por linha ("Suporte humano", "⏸ IA") e
 * ficava poluída — ao abrir a conversa, a etapa e as tags aparecem por extenso
 * no painel da direita, então aqui basta o símbolo. Mesmas cores do Funil.
 * O rótulo continua existindo no `title` e para leitor de tela.
 */
const STAGE_ICON: Record<string, { Icon: typeof Bot; cor: string }> = {
  IA_ATENDENDO: { Icon: Bot, cor: "text-sky-500" },
  NOVO_LEAD: { Icon: Bot, cor: "text-sky-500" },
  SUPORTE_HUMANO: { Icon: Pause, cor: "text-rose-500" },
  AGENDADO: { Icon: CalendarDays, cor: "text-emerald-600" },
  POS_ATENDIMENTO: { Icon: PartyPopper, cor: "text-violet-500" },
};
const stageIcon = (stage: string) => STAGE_ICON[stage] ?? STAGE_ICON.IA_ATENDENDO!;

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

  /**
   * As mensagens vivem em estado PRÓPRIO, e não dentro de `d`.
   *
   * O refresh de 12s recarrega a conversa inteira; se as mensagens morassem em
   * `d`, cada volta jogaria fora o histórico que o atendente carregou rolando
   * pra cima. Aqui elas são acumuladas: o refresh só acrescenta o que é novo.
   */
  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [temMaisAntigas, setTemMaisAntigas] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  // Altura do conteúdo antes de inserir páginas antigas, pra devolver a
  // rolagem ao ponto exato depois (senão a tela salta ao carregar).
  const alturaAntesDePrepend = useRef<number | null>(null);
  const grudadoNoFim = useRef(true);

  /** Junta sem duplicar e mantém a ordem cronológica. */
  const mesclar = useCallback((atuais: Msg[], novas: Msg[]) => {
    if (novas.length === 0) return atuais;
    const mapa = new Map(atuais.map((m) => [m.id, m]));
    for (const m of novas) mapa.set(m.id, m);
    return [...mapa.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, []);

  const refresh = useCallback(
    async (id = selected) => {
      if (!id) return setD(null);
      const r = await loadConversationAction(id);
      setD(r);
      if (r) setMensagens((atuais) => mesclar(atuais, r.messages));
      setLoading(false);
    },
    [selected, mesclar]
  );

  // Troca de conversa: zera tudo o que era da anterior (inclusive o rascunho,
  // pra não enviar texto no contato errado) e carrega a última página.
  useEffect(() => {
    setReply("");
    setMensagens([]);
    setTemMaisAntigas(false);
    grudadoNoFim.current = true;
    if (!selected) return setD(null);
    setLoading(true);
    void loadConversationAction(selected).then((r) => {
      setD(r);
      setMensagens(r?.messages ?? []);
      setTemMaisAntigas(Boolean(r?.temMaisAntigas));
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Quase-realtime do thread aberto (a lista se atualiza pelo AutoRefresh do server).
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(() => void refresh(selected), 12_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /** Rolou perto do topo? Puxa a página anterior. */
  const carregarAntigas = useCallback(async () => {
    const primeira = mensagens[0];
    if (!selected || !primeira || carregandoAntigas || !temMaisAntigas) return;
    setCarregandoAntigas(true);
    alturaAntesDePrepend.current = feedRef.current?.scrollHeight ?? null;
    try {
      const r = await mensagensAntigasAction(selected, primeira.createdAt);
      if (r.ok) {
        setMensagens((atuais) => mesclar(atuais, r.messages));
        setTemMaisAntigas(r.temMaisAntigas);
      }
    } finally {
      setCarregandoAntigas(false);
    }
  }, [selected, mensagens, carregandoAntigas, temMaisAntigas, mesclar]);

  function aoRolar() {
    const el = feedRef.current;
    if (!el) return;
    // "Grudado no fim" com folga de 80px: assim mensagem nova só puxa a tela
    // pra baixo se o atendente já estava acompanhando o fim da conversa. Se
    // ele está lendo o histórico, não é interrompido.
    grudadoNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 120) void carregarAntigas();
  }

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    // Voltando de um "carregar anteriores": devolve a rolagem ao mesmo ponto,
    // compensando a altura que entrou acima.
    if (alturaAntesDePrepend.current !== null) {
      el.scrollTop = el.scrollHeight - alturaAntesDePrepend.current;
      alturaAntesDePrepend.current = null;
      return;
    }
    if (grudadoNoFim.current) el.scrollTo({ top: el.scrollHeight });
  }, [mensagens, d?.id]);

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
              const ico = stageIcon(c.stage);
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
                    <span className="flex min-w-0 items-center">
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${c.unread > 0 ? "font-extrabold" : "font-semibold"}`}
                      >
                        {c.contactName || c.phone}
                      </span>
                      <span className="ml-1 flex shrink-0 items-center justify-end gap-0.5">
                        {/* A IA pode estar pausada sem o card estar em Suporte
                            (tag "desligar-ia"). Nesse caso o ⏸ entra à parte. */}
                        {c.botPaused && c.stage !== "SUPORTE_HUMANO" && (
                          <span className="grid size-3.5 place-items-center" title="IA pausada">
                            <Pause className="size-3.5 text-rose-500" aria-hidden />
                            <span className="sr-only">IA pausada</span>
                          </span>
                        )}
                        <span className="grid size-3.5 place-items-center" title={s.label}>
                          <ico.Icon className={`size-3.5 ${ico.cor}`} aria-hidden />
                          <span className="sr-only">{s.label}</span>
                        </span>
                        <span className="ml-0.5 min-w-6 text-right text-[10px] text-[var(--color-muted)]">
                          {timeAgo(c.lastMessageAt)}
                        </span>
                      </span>
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
                {/* Agendar sem sair daqui: leva o telefone e o nome. */}
                <Link
                  href={`/admin/agendamentos?tel=${encodeURIComponent(d.phone)}&nome=${encodeURIComponent(d.contactName ?? "")}`}
                  title="Agendar atendimento para este contato"
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
                >
                  <CalendarPlus className="size-4" /> Agendar
                </Link>
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
                onScroll={aoRolar}
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4"
              >
                {/* Topo do histórico: some quando não há mais o que buscar. */}
                {temMaisAntigas && (
                  <button
                    type="button"
                    onClick={() => void carregarAntigas()}
                    disabled={carregandoAntigas}
                    className="mx-auto shrink-0 rounded-full border border-black/10 bg-white px-3 py-1 text-[11px] font-semibold text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-60"
                  >
                    {carregandoAntigas ? "Carregando…" : "Ver mensagens anteriores"}
                  </button>
                )}
                {mensagens.map((m) => (
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
                {mensagens.length === 0 && (
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
              /*
                Fora do `start()` de propósito: o resumo demora alguns segundos
                e a transição deixaria o painel inteiro em `pending`, travando
                as tags e o botão de assumir enquanto isso. O ResumoBox mostra
                o próprio "Lendo…".
              */
              onResumir={async () => {
                const r = await summarizeConversationAction(d.id);
                if (r.ok) await refresh(d.id);
                return r.ok ? { ok: true } : { ok: false, motivo: r.motivo };
              }}
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
  onResumir,
}: {
  d: NonNullable<Detail>;
  pending: boolean;
  onSaveName: (name: string) => void;
  onToggleTag: (tag: string, on: boolean) => void;
  onResumir: () => Promise<{ ok: boolean; motivo?: string }>;
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

        <ResumoBox
          summary={d.summary}
          summaryAt={d.summaryAt}
          total={d.totalMensagens}
          onGerar={onResumir}
        />

        {/* Agendamentos: vêm do banco agora, não do texto da IA. */}
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase text-[var(--color-muted)]">Agendamentos marcados</div>
          {d.appointments.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {d.appointments.map((appointment) => {
                const s = appointmentUi(appointment.status);
                return (
                  <li key={appointment.id} className="rounded-xl border border-black/5 bg-white p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">{fmtDay(appointment.startAt)}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${s.chip}`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {fmtHour(appointment.startAt)}–{fmtHour(appointment.endAt)} · {brlShort(appointment.total)}
                    </div>
                    {appointment.services.length > 0 && (
                      <div className="truncate text-[11px] text-[var(--color-muted)]">
                        {appointment.services.join(", ")}
                        {appointment.professionalName ? ` · ${appointment.professionalName}` : ""}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 rounded-xl border border-dashed border-black/10 p-2 text-xs text-[var(--color-muted)]">
              Nenhum agendamento marcado.
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
              {d.appointments.length === 0 && /agendamento/i.test(d.notes) && (
                <p className="mt-2 border-t border-amber-200 pt-2 text-[10px] font-semibold text-amber-800">
                  Esta anotação cita um agendamento, mas não há atendimento ativo agora.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-black/10 p-3 text-xs text-[var(--color-muted)]">
              Ainda sem anotação — aparece aqui quando um agendamento, lead ou
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
            <dd className="font-semibold">{d.totalMensagens}</dd>
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
const ERRO_RESUMO: Record<string, string> = {
  sem_chave: "Resumo automático não está configurado neste ambiente.",
  sem_mensagens: "Esta conversa ainda não tem mensagens para resumir.",
  falhou: "Não foi possível gerar agora. Tente de novo.",
};

/**
 * Resumo da conversa inteira. Diferente da "Anotação da IA" logo abaixo, que é
 * a última nota de evento: aqui é a história do começo ao fim, para quem vai
 * assumir sem ter lido nada. Quando a IA escala pra humano ele já vem pronto;
 * fora disso, é o botão que gera.
 */
function ResumoBox({
  summary,
  summaryAt,
  total,
  onGerar,
}: {
  summary: string | null;
  summaryAt: string | null;
  total: number;
  onGerar: () => Promise<{ ok: boolean; motivo?: string }>;
}) {
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setRodando(true);
    setErro(null);
    const r = await onGerar();
    if (!r.ok) setErro(ERRO_RESUMO[r.motivo ?? "falhou"] ?? ERRO_RESUMO.falhou!);
    setRodando(false);
  }

  return (
    <div className="mt-2 rounded-xl bg-sky-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold uppercase text-sky-800">
          🧾 Resumo da conversa
          {summaryAt ? ` · ${fmt(summaryAt)}` : ""}
        </div>
        <button
          type="button"
          onClick={gerar}
          disabled={rodando || total === 0}
          className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-sky-800 shadow-sm transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rodando ? "Lendo…" : summary ? "Atualizar" : "Resumir"}
        </button>
      </div>

      {summary ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm text-sky-900">{summary}</p>
      ) : (
        <p className="mt-1.5 text-xs text-sky-800/80">
          {total === 0
            ? "Sem mensagens ainda."
            : `Ainda sem resumo. Gere a partir das ${total} mensagens desta conversa.`}
        </p>
      )}

      {/* O resumo é de quando foi gerado; mensagens novas depois dele não entram. */}
      {summary && (
        <p className="mt-1.5 text-[10px] text-sky-800/70">
          Retrato de quando foi gerado — use “Atualizar” para incluir o que veio depois.
        </p>
      )}
      {erro && (
        <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
          {erro}
        </p>
      )}
    </div>
  );
}

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
  // Mostra TODAS as tags, inclusive as de etapa (novo-lead/agendado/pos-atendimento) —
  // elas só não entram em `lista` (o checkbox), mas continuam visíveis aqui.
  // Sem isso, uma conversa em Pós-atendimento mostrava "sem tags", como se a tag não
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
