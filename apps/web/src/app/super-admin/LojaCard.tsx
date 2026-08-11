"use client";
import { useState, useTransition } from "react";
import { ChevronDown, ExternalLink, Plus, Trash2, Check, Power } from "lucide-react";

import {
  salvarAssinaturaAction,
  registrarPagamentoAction,
  salvarLinksAction,
  alternarAtivaAction,
  marcarEtapaAction,
} from "./actions";
import { statusAssinatura, rotuloWhatsapp, ETAPAS_MANUAIS, type LojaView } from "./tipos";

const CORES_ASSINATURA: Record<string, string> = {
  "sem-cobranca": "bg-slate-50 text-slate-600 border-slate-200",
  "em-dia": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "vence-em-breve": "bg-amber-50 text-amber-700 border-amber-200",
  vencida: "bg-red-50 text-red-700 border-red-200",
};

/** `2026-08-11T12:00:00Z` → `2026-08-11`, que é o que <input type="date"> aceita. */
const paraInputDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const formatarData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

export function LojaCard({ loja }: { loja: LojaView }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();

  const assinatura = statusAssinatura(loja.paidUntil);
  const zap = rotuloWhatsapp(loja.whatsapp);
  // "Loja cadastrada" é sempre verdade (o card existe), então conta como 1.
  const concluidas =
    1 + (loja.whatsapp === "open" ? 1 : 0) + ETAPAS_MANUAIS.filter((e) => loja.setupSteps.includes(e.id)).length;

  const rodar = (fn: () => Promise<{ ok: true } | { ok: false; erro: string }>) =>
    iniciar(async () => {
      setErro(null);
      setSalvo(false);
      const r = await fn();
      if (r.ok) {
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2500);
      } else setErro(r.erro);
    });

  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
        loja.ativa ? "border-black/5" : "border-black/10 opacity-60"
      }`}
    >
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-[var(--color-surface)]"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold">
            <span className="truncate">{loja.nome}</span>
            {!loja.ativa && (
              <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-muted)]">
                suspensa
              </span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {loja.slug} · instância {loja.instance}
          </p>
        </div>

        <span className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-bold sm:block ${zap.classe}`}>
          {zap.texto}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${CORES_ASSINATURA[assinatura.estado]}`}
        >
          {assinatura.rotulo}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-[var(--color-muted)] ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="space-y-5 border-t border-black/5 p-4 sm:p-5">
          {erro && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{erro}</p>
          )}
          {salvo && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              <Check className="size-4" /> Salvo.
            </p>
          )}

          {/* ---- Implantação ---- */}
          <div>
            <h3 className="text-sm font-bold">
              Implantação{" "}
              <span className="font-normal text-[var(--color-muted)]">
                {concluidas}/{ETAPAS_MANUAIS.length + 2}
              </span>
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {/* Dedutíveis: mostradas, nunca clicáveis — o estado é o real. */}
              <li className="flex items-center gap-2">
                <Marca ok /> Loja cadastrada
              </li>
              <li className="flex items-center gap-2">
                <Marca ok={loja.whatsapp === "open"} />
                WhatsApp conectado
                <span className="text-xs text-[var(--color-muted)]">({zap.texto})</span>
              </li>
              {ETAPAS_MANUAIS.map((etapa) => {
                const feita = loja.setupSteps.includes(etapa.id);
                return (
                  <li key={etapa.id}>
                    <button
                      disabled={pendente}
                      onClick={() => rodar(() => marcarEtapaAction(loja.id, etapa.id, !feita))}
                      className="flex items-center gap-2 text-left hover:opacity-70 disabled:opacity-50"
                    >
                      <Marca ok={feita} clicavel />
                      <span className={feita ? "" : "text-[var(--color-muted)]"}>{etapa.rotulo}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ---- Assinatura ---- */}
          <div>
            <h3 className="text-sm font-bold">Assinatura</h3>
            <p className="text-xs text-[var(--color-muted)]">
              Controle manual: nada é cobrado automaticamente. Último pagamento em{" "}
              {formatarData(loja.lastPaymentAt)}.
            </p>
            <form
              action={(fd) => rodar(() => salvarAssinaturaAction(loja.id, fd))}
              className="mt-3 grid gap-3 sm:grid-cols-4"
            >
              <Campo rotulo="Plano">
                <input name="plan" defaultValue={loja.plan ?? ""} placeholder="Mensal" className={INPUT} />
              </Campo>
              <Campo rotulo="Valor (R$)">
                <input
                  name="monthlyFee"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={loja.monthlyFee ?? ""}
                  className={INPUT}
                />
              </Campo>
              <Campo rotulo="Paga até">
                <input name="paidUntil" type="date" defaultValue={paraInputDate(loja.paidUntil)} className={INPUT} />
              </Campo>
              <div className="flex items-end">
                <button disabled={pendente} className={BOTAO_PRIMARIO}>
                  Salvar
                </button>
              </div>
              <Campo rotulo="Anotações (só você vê)" className="sm:col-span-4">
                <textarea name="adminNotes" defaultValue={loja.adminNotes ?? ""} rows={2} className={INPUT} />
              </Campo>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-muted)]">Recebi o pagamento:</span>
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  disabled={pendente}
                  onClick={() => rodar(() => registrarPagamentoAction(loja.id, m))}
                  className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold hover:bg-[var(--color-surface)] disabled:opacity-50"
                >
                  +{m} {m === 1 ? "mês" : "meses"}
                </button>
              ))}
            </div>
          </div>

          {/* ---- Links ---- */}
          <div>
            <h3 className="text-sm font-bold">Links</h3>
            <p className="text-xs text-[var(--color-muted)]">Workflow do n8n, documentos, painel — o que precisar.</p>
            <FormLinks loja={loja} pendente={pendente} aoSalvar={(fd) => rodar(() => salvarLinksAction(loja.id, fd))} />
          </div>

          {/* ---- Dados técnicos ---- */}
          <div>
            <h3 className="text-sm font-bold">Dados técnicos</h3>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
              <Dado rotulo="Instância do Evolution" valor={loja.instance} />
              <Dado rotulo="Clerk Org" valor={loja.clerkOrgId} />
              <Dado rotulo="Painel" valor={`${loja.slug}.zeusacademy.com.br/admin`} />
              <Dado rotulo="Criada em" valor={formatarData(loja.criadaEm)} />
            </dl>
          </div>

          {/* ---- Zona perigosa ---- */}
          <div className="rounded-xl border border-black/10 bg-[var(--color-surface)] p-3">
            <p className="text-xs text-[var(--color-muted)]">
              {loja.ativa
                ? "Suspender derruba o painel, o site público e o WhatsApp desta loja na hora. Nada é apagado — reativar volta tudo."
                : "A loja está suspensa: painel, site e WhatsApp não respondem por ela."}
            </p>
            <button
              disabled={pendente}
              onClick={() => {
                if (loja.ativa && !confirm(`Suspender "${loja.nome}"? O acesso cai imediatamente.`)) return;
                rodar(() => alternarAtivaAction(loja.id, !loja.ativa));
              }}
              className={`mt-2 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                loja.ativa ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
              }`}
            >
              <Power className="size-4" />
              {loja.ativa ? "Suspender loja" : "Reativar loja"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function FormLinks({
  loja,
  pendente,
  aoSalvar,
}: {
  loja: LojaView;
  pendente: boolean;
  aoSalvar: (fd: FormData) => void;
}) {
  // Sempre uma linha vazia no fim para adicionar sem precisar clicar em "+".
  const [linhas, setLinhas] = useState(() => [...loja.links, { label: "", url: "" }]);

  return (
    <form action={aoSalvar} className="mt-2 space-y-2">
      {linhas.map((l, i) => (
        <div key={i} className="flex gap-2">
          <input name="label" defaultValue={l.label} placeholder="Nome" className={`${INPUT} sm:w-44`} />
          <input name="url" defaultValue={l.url} placeholder="https://..." className={`${INPUT} flex-1`} />
          <button
            type="button"
            onClick={() => setLinhas((v) => v.filter((_, j) => j !== i))}
            className="rounded-xl border border-black/10 px-2 text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
            aria-label="Remover link"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLinhas((v) => [...v, { label: "", url: "" }])}
          className="flex items-center gap-1 rounded-xl border border-black/10 px-3 py-2 text-xs font-bold hover:bg-[var(--color-surface)]"
        >
          <Plus className="size-3.5" /> Linha
        </button>
        <button disabled={pendente} className={BOTAO_PRIMARIO}>
          Salvar links
        </button>
      </div>

      {loja.links.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {loja.links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-full border border-black/10 px-3 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]"
            >
              {l.label} <ExternalLink className="size-3" />
            </a>
          ))}
        </div>
      )}
    </form>
  );
}

const INPUT =
  "w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]";
const BOTAO_PRIMARIO =
  "rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

function Campo({
  rotulo,
  children,
  className = "",
}: {
  rotulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase text-[var(--color-muted)]">{rotulo}</span>
      {children}
    </label>
  );
}

/** Bolinha de etapa. `clicavel` só muda a borda — o clique é do <button> em volta. */
function Marca({ ok, clicavel = false }: { ok: boolean; clicavel?: boolean }) {
  return (
    <span
      className={`grid size-4 shrink-0 place-items-center rounded-full border ${
        ok
          ? "border-emerald-600 bg-emerald-600 text-white"
          : clicavel
            ? "border-black/25 bg-white"
            : "border-black/10 bg-[var(--color-surface)]"
      }`}
    >
      {ok && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-[var(--color-muted)]">{rotulo}:</dt>
      <dd className="min-w-0 truncate font-mono font-semibold">{valor}</dd>
    </div>
  );
}
