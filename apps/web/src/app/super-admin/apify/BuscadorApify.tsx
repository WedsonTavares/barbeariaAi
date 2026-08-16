"use client";
import { useMemo, useState, useTransition } from "react";
import {
  Search, Phone, ExternalLink, AlertTriangle, Check, Info, Download,
} from "lucide-react";

import { buscarAction, importarAction, type Achado } from "./actions";

const TERMOS = ["barbearia", "salão de beleza", "manicure", "estética"];
const LOCAIS = ["Ribeirão Preto, SP", "Sertãozinho, SP", "Franca, SP", "Araraquara, SP"];

type Filtros = {
  semSite: boolean;
  comTelefone: boolean;
  notaMin: number;
  avaliacoesMin: number;
  categoria: string;
};

export function BuscadorApify() {
  const [termo, setTermo] = useState("barbearia");
  const [local, setLocal] = useState("Ribeirão Preto, SP");
  const [limite, setLimite] = useState(50);
  const [notaMinima, setNotaMinima] = useState(0);

  const [leads, setLeads] = useState<Achado[] | null>(null);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [buscando, iniciarBusca] = useTransition();
  const [importando, iniciarImport] = useTransition();

  const [f, setF] = useState<Filtros>({
    semSite: false, comTelefone: true, notaMin: 0, avaliacoesMin: 0, categoria: "todas",
  });

  /** Categorias presentes no resultado — o filtro só oferece o que existe. */
  const categorias = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of leads ?? []) c.set(l.nicho, (c.get(l.nicho) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const visiveis = useMemo(() => {
    if (!leads) return [];
    return leads.filter((l) => {
      if (f.semSite && l.site) return false;
      if (f.comTelefone && !l.telefone) return false;
      if (f.notaMin && (l.nota ?? 0) < f.notaMin) return false;
      if (f.avaliacoesMin && l.avaliacoes < f.avaliacoesMin) return false;
      if (f.categoria !== "todas" && l.nicho !== f.categoria) return false;
      return true;
    });
  }, [leads, f]);

  /** Já na carteira não entra na seleção: reimportar não traria nada de novo. */
  const selecionaveis = visiveis.filter((l) => !l.jaExiste);
  const todosMarcados = selecionaveis.length > 0 && selecionaveis.every((l) => selecao.has(l.id));

  function buscar() {
    setMsg(null);
    setLeads(null);
    setSelecao(new Set());
    iniciarBusca(async () => {
      const r = await buscarAction({ termo, local, limite, notaMinima });
      if (!r.ok) return setMsg({ ok: false, texto: r.erro });
      setLeads(r.leads);
      if (!r.leads.length) setMsg({ ok: false, texto: "Nenhuma empresa encontrada para essa busca." });
    });
  }

  function alternar(id: string) {
    setSelecao((s) => {
      const novo = new Set(s);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  function importar() {
    const escolhidos = (leads ?? []).filter((l) => selecao.has(l.id));
    if (!escolhidos.length) return;
    setMsg(null);
    iniciarImport(async () => {
      const r = await importarAction(escolhidos);
      if (!r.ok) return setMsg({ ok: false, texto: r.erro });
      setMsg({ ok: true, texto: r.aviso });
      // Marca como existente em vez de sumir da tela: você acabou de importar e
      // ver o resultado confirma o que aconteceu.
      setLeads((atual) =>
        (atual ?? []).map((l) => (selecao.has(l.id) ? { ...l, jaExiste: true } : l))
      );
      setSelecao(new Set());
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {/* ── Busca ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo rotulo="O que procurar">
            <input
              list="termos-apify"
              value={termo}
              disabled={buscando}
              onChange={(e) => setTermo(e.target.value)}
              className={INPUT}
            />
            <datalist id="termos-apify">
              {TERMOS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </Campo>
          <Campo rotulo="Onde">
            <input
              list="locais-apify"
              value={local}
              disabled={buscando}
              onChange={(e) => setLocal(e.target.value)}
              className={INPUT}
            />
            <datalist id="locais-apify">
              {LOCAIS.map((l) => <option key={l} value={l} />)}
            </datalist>
          </Campo>
          <Campo rotulo="Limite" dica="a Apify cobra por resultado">
            <input
              type="number" min={1} max={300} value={limite} disabled={buscando}
              onChange={(e) => setLimite(Number(e.target.value))} className={INPUT}
            />
          </Campo>
          <Campo rotulo="Nota mínima" dica="0 = sem filtro">
            <input
              type="number" min={0} max={5} step="0.1" value={notaMinima} disabled={buscando}
              onChange={(e) => setNotaMinima(Number(e.target.value))} className={INPUT}
            />
          </Campo>
        </div>

        <button type="button" onClick={buscar} disabled={buscando} className={`${BOTAO} mt-4`}>
          <Search className="size-4" /> {buscando ? "Buscando na Apify..." : "Buscar empresas"}
        </button>

        <p className="mt-3 flex items-start gap-2 rounded-xl border border-black/10 bg-[var(--color-surface)] p-3 text-xs text-[var(--color-muted)]">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            A busca pode levar alguns minutos e <strong>consome créditos da Apify</strong> por
            resultado. Nada é gravado aqui — você vê o resultado, escolhe, e só então importa
            para a Carteira.
          </span>
        </p>
      </section>

      {msg && (
        <p className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold ${
          msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {msg.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {msg.texto}
        </p>
      )}

      {/* ── Preview ───────────────────────────────────────────────────── */}
      {leads && leads.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">
                {visiveis.length} {visiveis.length === 1 ? "empresa" : "empresas"}
                {selecionaveis.length !== visiveis.length && (
                  <span className="text-[var(--color-muted)]">
                    {" "}· {visiveis.length - selecionaveis.length} já na Carteira
                  </span>
                )}
              </h2>
              <p className="text-xs text-[var(--color-muted)]">Ordenadas por prioridade.</p>
            </div>

            <Chip ativo={f.comTelefone} onClick={() => setF({ ...f, comTelefone: !f.comTelefone })}>
              Com telefone
            </Chip>
            <Chip ativo={f.semSite} onClick={() => setF({ ...f, semSite: !f.semSite })}>
              Sem site
            </Chip>
            <Chip ativo={f.avaliacoesMin > 0} onClick={() => setF({ ...f, avaliacoesMin: f.avaliacoesMin ? 0 : 50 })}>
              50+ avaliações
            </Chip>
            {categorias.length > 1 && (
              <select
                value={f.categoria}
                onChange={(e) => setF({ ...f, categoria: e.target.value })}
                aria-label="Categoria"
                className="rounded-full border border-black/10 px-2 py-1 text-xs font-bold outline-none"
              >
                <option value="todas">Todas as categorias</option>
                {categorias.map(([c, n]) => (
                  <option key={c} value={c}>{c} ({n})</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-black/5 bg-[var(--color-surface)] px-4 py-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={todosMarcados}
                disabled={!selecionaveis.length}
                onChange={() =>
                  setSelecao(todosMarcados ? new Set() : new Set(selecionaveis.map((l) => l.id)))
                }
              />
              Selecionar {selecionaveis.length} novas
            </label>
            <span className="text-xs text-[var(--color-muted)]">{selecao.size} selecionadas</span>
            <button
              type="button"
              onClick={importar}
              disabled={!selecao.size || importando}
              className={`${BOTAO} ml-auto`}
            >
              <Download className="size-4" />
              {importando ? "Importando..." : `Importar ${selecao.size || ""}`}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface)] text-left text-[11px] uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="p-3" />
                  <th className="p-3">Score</th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Contato</th>
                  <th className="p-3">Por que</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.id} className={`border-t border-black/5 align-top ${l.jaExiste ? "opacity-55" : ""}`}>
                    <td className="p-3">
                      {l.jaExiste ? (
                        <span
                          title={
                            l.duplicataDe
                              ? `${l.duplicataDe.motivo} — já na carteira como "${l.duplicataDe.nome}"`
                              : "já na carteira"
                          }
                          className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold"
                        >
                          já existe
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={selecao.has(l.id)}
                          onChange={() => alternar(l.id)}
                          aria-label={`Selecionar ${l.nome}`}
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold tabular-nums">
                        {l.score}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold">{l.nome}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">{l.nicho}</span>{" "}
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 font-semibold text-[var(--color-primary)]">
                          {l.origem}
                        </span>{" "}
                        {l.avaliacoes} avaliações{l.nota ? ` · nota ${l.nota}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{l.endereco}</p>
                      {l.duplicataDe && (
                        <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
                          {l.duplicataDe.motivo} que &ldquo;{l.duplicataDe.nome}&rdquo;
                        </p>
                      )}
                    </td>
                    <td className="max-w-[13rem] p-3">
                      {l.telefone ? (
                        <span className="flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]">
                          <Phone className="size-3.5" /> {l.telefone}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-muted)]">sem telefone</span>
                      )}
                      {l.site && (
                        <a href={l.site} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 truncate text-xs text-[var(--color-muted)] hover:underline">
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="truncate">{l.site.replace(/^https?:\/\//, "").slice(0, 26)}</span>
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

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-bold ${
        ativo
          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
          : "border-black/10 hover:bg-[var(--color-surface)]"
      }`}
    >
      {children}
    </button>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase text-[var(--color-muted)]">{rotulo}</span>
      {dica && <span className="mb-1 block text-[11px] text-[var(--color-muted)]">{dica}</span>}
      {children}
    </label>
  );
}
