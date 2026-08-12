"use client";
import { useState } from "react";
import { Search, Download, Phone, ExternalLink, AlertTriangle, Info } from "lucide-react";

import {
  planejarAction,
  buscarLoteAction,
  detalharLoteAction,
  filtrarAction,
  type Plano,
} from "./actions";
import type { Lead, LugarBruto } from "@/lib/places";

const CIDADES = [
  { nome: "Ribeirão Preto", lat: -21.1775, lng: -47.8103 },
  { nome: "São Paulo", lat: -23.5505, lng: -46.6333 },
  { nome: "Campinas", lat: -22.9099, lng: -47.0626 },
  { nome: "Uberlândia", lat: -18.9186, lng: -48.2772 },
];

type Fase = "parado" | "planejando" | "varrendo" | "detalhando" | "pronto";

export function BuscadorLeads() {
  const [lat, setLat] = useState(-21.1775);
  const [lng, setLng] = useState(-47.8103);
  const [raio, setRaio] = useState(8000);
  const [minAvaliacoes, setMinAvaliacoes] = useState(15);

  const [plano, setPlano] = useState<Plano | null>(null);
  const [fase, setFase] = useState<Fase>("parado");
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [encontrados, setEncontrados] = useState(0);
  const [nicho, setNicho] = useState<string>("todos");

  const ocupado = fase === "varrendo" || fase === "detalhando" || fase === "planejando";

  async function planejar() {
    setErro(null);
    setFase("planejando");
    try {
      setPlano(await planejarAction(lat, lng, raio));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao planejar");
    }
    setFase("parado");
  }

  async function buscar() {
    if (!plano) return;
    setErro(null);
    setLeads([]);
    setEncontrados(0);
    setFase("varrendo");

    // ── Fase 1: varredura barata, em lotes ────────────────────────────────
    const brutos: LugarBruto[] = [];
    const LOTE = 8;
    const total = Math.ceil(plano.pontos.length / LOTE);
    setProgresso({ feito: 0, total });

    for (let i = 0; i < plano.pontos.length; i += LOTE) {
      const r = await buscarLoteAction(plano.pontos.slice(i, i + LOTE));
      if (!r.ok) {
        setErro(r.erro);
        setFase("parado");
        return;
      }
      brutos.push(...r.lugares);
      setProgresso({ feito: Math.floor(i / LOTE) + 1, total });
      setEncontrados(new Set(brutos.map((b) => b.id)).size);
    }

    // ── Filtro: descarta antes de gastar a chamada cara ───────────────────
    const aprovados = await filtrarAction(brutos, minAvaliacoes);

    // ── Fase 2: telefone e site, só dos aprovados ─────────────────────────
    setFase("detalhando");
    const DLOTE = 10;
    const totalD = Math.ceil(aprovados.length / DLOTE);
    setProgresso({ feito: 0, total: totalD });

    const finais: Lead[] = [];
    for (let i = 0; i < aprovados.length; i += DLOTE) {
      const r = await detalharLoteAction(aprovados.slice(i, i + DLOTE));
      if (!r.ok) {
        setErro(r.erro);
        break;
      }
      finais.push(...r.leads);
      setProgresso({ feito: Math.floor(i / DLOTE) + 1, total: totalD });
      setLeads([...finais].sort((a, b) => b.score - a.score));
    }

    setLeads(finais.sort((a, b) => b.score - a.score));
    setFase("pronto");
  }

  function baixarCsv() {
    const cab = [
      "score", "nicho", "nome", "telefone", "telefone_internacional", "avaliacoes",
      "nota", "site", "endereco", "horario", "por_que", "maps",
    ];
    const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = visiveis.map((l) =>
      [
        l.score, l.nicho, l.nome, l.telefone ?? "", l.telefoneInternacional ?? "", l.avaliacoes,
        l.nota ?? "", l.site ?? "", l.endereco, (l.horario ?? []).join(" | "),
        l.motivos.join(" · "), l.maps ?? "",
      ].map(escapar).join(",")
    );
    // BOM para o Excel abrir acentuação certo.
    const blob = new Blob(["﻿" + [cab.join(","), ...linhas].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leads-${nicho === "todos" ? "todos" : nicho}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Contagem por nicho, para as abas mostrarem o tamanho de cada grupo.
  const porNicho = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.nicho] = (acc[l.nicho] ?? 0) + 1;
    return acc;
  }, {});
  const visiveis = nicho === "todos" ? leads : leads.filter((l) => l.nicho === nicho);
  const quentes = visiveis.filter((l) => l.score >= 70).length;

  return (
    <div className="mt-6 space-y-4">
      {/* ── Parâmetros ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-bold">Onde procurar</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {CIDADES.map((c) => (
            <button
              key={c.nome}
              type="button"
              disabled={ocupado}
              onClick={() => {
                setLat(c.lat);
                setLng(c.lng);
                setPlano(null);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                lat === c.lat && lng === c.lng
                  ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]"
                  : "border-black/10 hover:bg-[var(--color-surface)]"
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Campo rotulo="Latitude">
            <input type="number" step="0.0001" value={lat} disabled={ocupado}
              onChange={(e) => { setLat(Number(e.target.value)); setPlano(null); }} className={INPUT} />
          </Campo>
          <Campo rotulo="Longitude">
            <input type="number" step="0.0001" value={lng} disabled={ocupado}
              onChange={(e) => { setLng(Number(e.target.value)); setPlano(null); }} className={INPUT} />
          </Campo>
          <Campo rotulo="Raio (m)" dica="8000 cobre uma cidade média">
            <input type="number" step="1000" min={1000} max={30000} value={raio} disabled={ocupado}
              onChange={(e) => { setRaio(Number(e.target.value)); setPlano(null); }} className={INPUT} />
          </Campo>
          <Campo rotulo="Mín. avaliações" dica="descarta cadastro morto">
            <input type="number" min={0} max={500} value={minAvaliacoes} disabled={ocupado}
              onChange={(e) => setMinAvaliacoes(Number(e.target.value))} className={INPUT} />
          </Campo>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={planejar} disabled={ocupado} className={BOTAO_SEC}>
            {fase === "planejando" ? "Calculando..." : "Estimar busca"}
          </button>
          {plano && (
            <button type="button" onClick={buscar} disabled={ocupado} className={BOTAO}>
              <Search className="size-4" /> Buscar leads
            </button>
          )}
        </div>

        {plano && fase !== "varrendo" && fase !== "detalhando" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-black/10 bg-[var(--color-surface)] p-3 text-xs text-[var(--color-muted)]">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              A varredura usa <strong>{plano.celulas} círculos</strong> de {plano.raioCelulaM} m. São{" "}
              <strong>{plano.celulas} chamadas baratas</strong>; as caras (telefone e site) só acontecem para quem
              passar no filtro de avaliações. Cada busca consome cota da Places API — estime antes de repetir.
            </span>
          </p>
        )}

        {erro && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        )}
      </section>

      {/* ── Progresso ───────────────────────────────────────────────────── */}
      {(fase === "varrendo" || fase === "detalhando") && (
        <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>{fase === "varrendo" ? "Varrendo a região..." : "Buscando telefones..."}</span>
            <span className="tabular-nums text-[var(--color-muted)]">
              {progresso.feito}/{progresso.total}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${progresso.total ? (progresso.feito / progresso.total) * 100 : 0}%` }}
            />
          </div>
          {fase === "varrendo" && (
            <p className="mt-2 text-xs text-[var(--color-muted)]">{encontrados} estabelecimentos até agora</p>
          )}
        </section>
      )}

      {/* ── Resultado ───────────────────────────────────────────────────── */}
      {leads.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-black/5 p-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">
                {visiveis.length} {visiveis.length === 1 ? "lead" : "leads"} ·{" "}
                <span className="text-emerald-700">{quentes} com score 70+</span>
              </h2>
              <p className="text-xs text-[var(--color-muted)]">Ordenados por prioridade. Comece de cima.</p>
            </div>
            <button type="button" onClick={baixarCsv} className={BOTAO_SEC}>
              <Download className="size-4" /> CSV
            </button>
          </div>

          {/* Abas por nicho: a abordagem muda conforme o negócio, então separar
              ajuda a fazer contato em série sem trocar o discurso a cada linha. */}
          <div className="flex flex-wrap gap-2 border-b border-black/5 px-4 py-3">
            {[
              ["todos", leads.length] as const,
              ...(Object.entries(porNicho).sort((a, b) => b[1] - a[1]) as [string, number][]),
            ].map(([n, qtd]) => (
              <button
                key={n}
                type="button"
                onClick={() => setNicho(n)}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${
                  nicho === n
                    ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]"
                    : "border-black/10 hover:bg-[var(--color-surface)]"
                }`}
              >
                {n === "todos" ? "Todos" : n} <span className="tabular-nums opacity-70">{qtd}</span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface)] text-left text-[11px] uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="p-3">Score</th>
                  <th className="p-3">Estabelecimento</th>
                  <th className="p-3">Contato</th>
                  <th className="p-3">Por que</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id} className="border-t border-black/5 align-top">
                    <td className="p-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums ${
                          l.score >= 70
                            ? "bg-emerald-100 text-emerald-800"
                            : l.score >= 50
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {l.score}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{l.nome}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{l.nicho}</span>{" "}
                        {l.avaliacoes} avaliações{l.nota ? ` · nota ${l.nota}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{l.endereco}</p>
                      {l.horario?.[0] && (
                        <p className="mt-0.5 text-[11px] text-[var(--color-muted)]" title={l.horario.join(" | ")}>
                          {l.horario.length} dias com horário cadastrado
                        </p>
                      )}
                    </td>
                    <td className="space-y-1 p-3">
                      {l.telefone ? (
                        <a
                          // O número internacional já vem com o DDI; usar ele
                          // evita prefixar "55" num telefone que já tinha.
                          href={`https://wa.me/${(l.telefoneInternacional ?? `+55${l.telefone}`).replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-[var(--color-primary)]"
                        >
                          <Phone className="size-3.5" /> {l.telefone}
                        </a>
                      ) : (
                        <span className="block text-xs text-[var(--color-muted)]">sem telefone</span>
                      )}
                      {l.site && (
                        <a href={l.site} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 truncate text-xs text-[var(--color-muted)] hover:underline">
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="truncate">{l.site.replace(/^https?:\/\//, "").slice(0, 28)}</span>
                        </a>
                      )}
                      {l.maps && (
                        <a href={l.maps} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">
                          Maps <ExternalLink className="size-3" />
                        </a>
                      )}
                    </td>
                    <td className="p-3 text-xs text-[var(--color-muted)]">{l.motivos.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60";
const BOTAO =
  "flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const BOTAO_SEC =
  "flex items-center gap-1.5 rounded-xl border border-black/10 px-4 py-2 text-sm font-bold hover:bg-[var(--color-surface)] disabled:opacity-50";

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase text-[var(--color-muted)]">{rotulo}</span>
      {dica && <span className="mb-1 block text-[11px] text-[var(--color-muted)]">{dica}</span>}
      {children}
    </label>
  );
}
