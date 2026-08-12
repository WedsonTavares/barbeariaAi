"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { Upload, Phone, ExternalLink, AlertTriangle, Check, X } from "lucide-react";

import type { ProspectStage } from "@barbearia-ai/core";
import { importarCsvAction, mudarEstagioAction, salvarObservacaoAction } from "./actions";

export type LeadView = {
  id: string;
  nome: string;
  nicho: string;
  telefone: string | null;
  site: string | null;
  maps: string | null;
  endereco: string | null;
  nota: number | null;
  avaliacoes: number;
  score: number;
  motivos: string[];
  stage: ProspectStage;
  contatadoEm: string | null;
  observacao: string | null;
};

/** Ordem do funil. É a sequência real da abordagem, e o gráfico depende dela. */
const FUNIL: { stage: ProspectStage; rotulo: string }[] = [
  { stage: "NOVO", rotulo: "Novo" },
  { stage: "CONTATADO", rotulo: "Contatado" },
  { stage: "RESPONDEU", rotulo: "Respondeu" },
  { stage: "DEMO", rotulo: "Demo" },
  { stage: "PROPOSTA", rotulo: "Proposta" },
  { stage: "GANHO", rotulo: "Ganho" },
];

/**
 * Cores de ESTADO, não de série. Só GANHO e PERDIDO recebem cor semântica; o
 * resto fica neutro de propósito — pintar cada etapa de uma cor faria o olho
 * procurar significado onde só existe ordem.
 */
const COR_ESTAGIO: Record<ProspectStage, string> = {
  NOVO: "bg-slate-100 text-slate-700",
  CONTATADO: "bg-blue-50 text-blue-700",
  RESPONDEU: "bg-blue-100 text-blue-800",
  DEMO: "bg-violet-100 text-violet-800",
  PROPOSTA: "bg-amber-100 text-amber-800",
  GANHO: "bg-emerald-100 text-emerald-800",
  PERDIDO: "bg-red-100 text-red-700",
};

const TODOS_ESTAGIOS: ProspectStage[] = [...FUNIL.map((f) => f.stage), "PERDIDO"];

/** Presença digital: o sinal que decide a oferta. */
function presencaDe(l: LeadView): "Sem site" | "Só rede social" | "Site próprio" {
  if (!l.site) return "Sem site";
  return /instagram\.|facebook\.|linktr\.ee|linktree|wa\.me|beacons\.|api\.whatsapp/.test(l.site.toLowerCase())
    ? "Só rede social"
    : "Site próprio";
}

type Filtro = { tipo: "nicho" | "presenca" | "stage" | "prioridade"; valor: string } | null;

export function Carteira({ leads }: { leads: LeadView[] }) {
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (termo && !l.nome.toLowerCase().includes(termo)) return false;
      if (!filtro) return true;
      if (filtro.tipo === "nicho") return l.nicho === filtro.valor;
      if (filtro.tipo === "presenca") return presencaDe(l) === filtro.valor;
      if (filtro.tipo === "stage") return l.stage === filtro.valor;
      if (filtro.tipo === "prioridade") return l.score >= 80;
      return true;
    });
  }, [leads, filtro, busca]);

  const total = leads.length;
  const naoContatados = leads.filter((l) => l.stage === "NOVO").length;
  const emAndamento = leads.filter(
    (l) => l.stage !== "NOVO" && l.stage !== "GANHO" && l.stage !== "PERDIDO"
  ).length;
  const ganhos = leads.filter((l) => l.stage === "GANHO").length;
  const trabalhados = total - naoContatados;
  const conversao = trabalhados ? Math.round((ganhos / trabalhados) * 100) : 0;

  const porNicho = agrupar(leads, (l) => l.nicho);
  const porPresenca = agrupar(leads, presencaDe);

  // Funil cumulativo: quem chegou em "Demo" necessariamente passou por
  // "Contatado". Contar só quem está PARADO em cada etapa daria um gráfico que
  // encolhe e cresce sem sentido.
  const funil = FUNIL.map((f, i) => {
    const idx = (s: ProspectStage) => FUNIL.findIndex((x) => x.stage === s);
    const qtd = leads.filter((l) => l.stage !== "PERDIDO" && idx(l.stage) >= i).length;
    return { ...f, qtd };
  });

  function enviarArquivo(file: File) {
    setMsg(null);
    const reader = new FileReader();
    reader.onload = () =>
      iniciar(async () => {
        const r = await importarCsvAction(String(reader.result ?? ""));
        setMsg(r.ok ? { ok: true, texto: r.aviso ?? "Importado." } : { ok: false, texto: r.erro });
        if (inputArquivo.current) inputArquivo.current.value = "";
      });
    reader.readAsText(file, "utf-8");
  }

  function trocarEstagio(id: string, stage: ProspectStage) {
    iniciar(async () => {
      const r = await mudarEstagioAction(id, stage);
      if (!r.ok) setMsg({ ok: false, texto: r.erro });
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {/* ── Importar ───────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Importar da Prospecção</h2>
          <p className="text-xs text-[var(--color-muted)]">
            Suba o CSV exportado. Reimportar a mesma região atualiza nota e avaliações e{" "}
            <strong>preserva</strong> o estágio e as anotações.
          </p>
        </div>
        <input
          ref={inputArquivo}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && enviarArquivo(e.target.files[0])}
        />
        <button
          type="button"
          disabled={pendente}
          onClick={() => inputArquivo.current?.click()}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          <Upload className="size-4" /> {pendente ? "Processando..." : "Escolher CSV"}
        </button>
      </section>

      {msg && (
        <p
          className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold ${
            msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {msg.texto}
        </p>
      )}

      {total === 0 ? (
        <section className="rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm">
          <p className="font-bold">Carteira vazia.</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Faça uma busca em Prospecção, baixe o CSV e suba aqui.
          </p>
        </section>
      ) : (
        <>
          {/* ── Indicadores ─────────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile rotulo="Na carteira" valor={total} detalhe={`${porNicho.length} nichos`} />
            <Tile
              rotulo="A contatar"
              valor={naoContatados}
              detalhe={naoContatados ? "clique para filtrar" : "tudo trabalhado"}
              aoClicar={naoContatados ? () => setFiltro({ tipo: "stage", valor: "NOVO" }) : undefined}
              alerta={naoContatados > 0}
            />
            <Tile rotulo="Em andamento" valor={emAndamento} detalhe="contatado até proposta" />
            <Tile rotulo="Clientes" valor={ganhos} detalhe={trabalhados ? `${conversao}% dos trabalhados` : "—"} />
          </section>

          {/* ── Funil ───────────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-bold">Funil</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Cumulativo: quem chegou na Demo passou por Contatado. A queda entre duas etapas mostra onde o processo
              trava.
            </p>
            <div className="mt-3 space-y-1.5">
              {funil.map((f, i) => {
                const anterior = i > 0 ? funil[i - 1]!.qtd : null;
                const taxa = anterior && anterior > 0 ? Math.round((f.qtd / anterior) * 100) : null;
                return (
                  <Barra
                    key={f.stage}
                    rotulo={f.rotulo}
                    valor={f.qtd}
                    maximo={funil[0]!.qtd}
                    sufixo={taxa !== null ? `${taxa}% da etapa anterior` : undefined}
                    aoClicar={() => setFiltro({ tipo: "stage", valor: f.stage })}
                  />
                );
              })}
            </div>
          </section>

          {/* ── Distribuições ───────────────────────────────────────────── */}
          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-sm font-bold">Por nicho</h2>
              <p className="text-xs text-[var(--color-muted)]">A abordagem muda conforme o negócio.</p>
              <div className="mt-3 space-y-1.5">
                {porNicho.map(([nicho, qtd]) => (
                  <Barra
                    key={nicho}
                    rotulo={nicho}
                    valor={qtd}
                    maximo={porNicho[0]![1]}
                    aoClicar={() => setFiltro({ tipo: "nicho", valor: nicho })}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-sm font-bold">Presença digital</h2>
              <p className="text-xs text-[var(--color-muted)]">
                Sem site é oferta de presença + automação. Com site próprio, só automação.
              </p>
              <div className="mt-3 space-y-1.5">
                {porPresenca.map(([p, qtd]) => (
                  <Barra
                    key={p}
                    rotulo={p}
                    valor={qtd}
                    maximo={porPresenca[0]![1]}
                    aoClicar={() => setFiltro({ tipo: "presenca", valor: p })}
                  />
                ))}
              </div>
            </div>
          </section>

          {/* ── Lista ───────────────────────────────────────────────────── */}
          <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-bold">
                  {visiveis.length} {visiveis.length === 1 ? "empresa" : "empresas"}
                </h2>
                {filtro && (
                  <button
                    type="button"
                    onClick={() => setFiltro(null)}
                    className="mt-1 inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)] bg-blue-50 px-2 py-0.5 text-xs font-bold text-[var(--color-primary)]"
                  >
                    {filtro.tipo === "prioridade" ? "Score 80+" : filtro.valor} <X className="size-3" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setFiltro({ tipo: "prioridade", valor: "80" })}
                className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold hover:bg-[var(--color-surface)]"
              >
                Score 80+
              </button>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar empresa..."
                className="rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-surface)] text-left text-[11px] uppercase text-[var(--color-muted)]">
                  <tr>
                    <th className="p-3">Score</th>
                    <th className="p-3">Empresa</th>
                    <th className="p-3">Contato</th>
                    <th className="p-3">Etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <tr key={l.id} className="border-t border-black/5 align-top">
                      <td className="p-3">
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold tabular-nums">
                          {l.score}
                        </span>
                      </td>
                      <td className="p-3">
                        <p className="font-semibold">{l.nome}</p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {l.nicho} · {l.avaliacoes} avaliações{l.nota ? ` · ${l.nota}` : ""} · {presencaDe(l)}
                        </p>
                        {l.contatadoEm && (
                          <p className="text-[11px] text-[var(--color-muted)]">
                            contato em {new Date(l.contatadoEm).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </td>
                      <td className="space-y-1 p-3">
                        {l.telefone ? (
                          <a
                            href={`https://wa.me/${`55${l.telefone}`.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[var(--color-primary)]"
                          >
                            <Phone className="size-3.5" /> {l.telefone}
                          </a>
                        ) : (
                          <span className="block text-xs text-[var(--color-muted)]">sem telefone</span>
                        )}
                        {l.maps && (
                          <a
                            href={l.maps}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-[var(--color-muted)] hover:underline"
                          >
                            Maps <ExternalLink className="size-3" />
                          </a>
                        )}
                      </td>
                      <td className="p-3">
                        <select
                          value={l.stage}
                          disabled={pendente}
                          onChange={(e) => trocarEstagio(l.id, e.target.value as ProspectStage)}
                          className={`rounded-lg border-0 px-2 py-1 text-xs font-bold outline-none ${COR_ESTAGIO[l.stage]}`}
                        >
                          {TODOS_ESTAGIOS.map((s) => (
                            <option key={s} value={s}>
                              {s.charAt(0) + s.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function agrupar<T>(itens: T[], chave: (i: T) => string): [string, number][] {
  const mapa = new Map<string, number>();
  for (const i of itens) mapa.set(chave(i), (mapa.get(chave(i)) ?? 0) + 1);
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Barra horizontal de magnitude.
 *
 * Uma cor só: o comprimento já codifica a grandeza, e pintar cada categoria de
 * uma cor faria o olho procurar um significado que não existe. O valor vai
 * rotulado ao lado, o que dispensa eixo e grade.
 */
function Barra({
  rotulo,
  valor,
  maximo,
  sufixo,
  aoClicar,
}: {
  rotulo: string;
  valor: number;
  maximo: number;
  sufixo?: string;
  aoClicar?: () => void;
}) {
  const pct = maximo > 0 ? (valor / maximo) * 100 : 0;
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={sufixo ? `${rotulo}: ${valor} — ${sufixo}` : `${rotulo}: ${valor}`}
      className="flex w-full items-center gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-[var(--color-surface)]"
    >
      <span className="w-28 shrink-0 truncate text-xs font-semibold">{rotulo}</span>
      <span className="h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-[var(--color-surface)]">
        <span
          className="block h-full rounded-r-sm bg-[var(--color-primary)]"
          style={{ width: `${Math.max(pct, valor > 0 ? 2 : 0)}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right text-xs font-extrabold tabular-nums">{valor}</span>
      {sufixo && <span className="hidden w-40 shrink-0 text-[11px] text-[var(--color-muted)] sm:block">{sufixo}</span>}
    </button>
  );
}

function Tile({
  rotulo,
  valor,
  detalhe,
  aoClicar,
  alerta = false,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  aoClicar?: () => void;
  alerta?: boolean;
}) {
  const Tag = aoClicar ? "button" : "div";
  return (
    <Tag
      {...(aoClicar ? { type: "button" as const, onClick: aoClicar } : {})}
      className={`rounded-2xl border p-4 text-left shadow-sm ${
        alerta ? "border-amber-200 bg-amber-50" : "border-black/5 bg-white"
      } ${aoClicar ? "hover:border-[var(--color-primary)]" : ""}`}
    >
      <p
        className={`text-[11px] font-bold uppercase tracking-wide ${
          alerta ? "text-amber-700" : "text-[var(--color-muted)]"
        }`}
      >
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{valor}</p>
      <p className={`mt-0.5 truncate text-xs ${alerta ? "text-amber-800" : "text-[var(--color-muted)]"}`}>{detalhe}</p>
    </Tag>
  );
}
