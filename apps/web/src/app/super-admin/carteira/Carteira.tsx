"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Upload, Phone, AlertTriangle, Check, X, LayoutList, Columns3, Clock, HelpCircle,
} from "lucide-react";

import type { ProspectStage } from "@barbearia-ai/core";
import { importarCsvAction, moverStageAction } from "./actions";
import { PainelLead } from "./PainelLead";
import {
  COR_ESTAGIO, ENCERRADOS, FUNIL, ROTULO_ESTAGIO, ROTULO_MOTIVO, ROTULO_ORDEM,
  ROTULO_RESULTADO, diasAte, estaAtrasado, estaLargado, formatarData, ordenar,
  presencaDe, type LeadView, type Ordem,
} from "./tipos";

/** Quantos leads por página na lista. */
const POR_PAGINA = 50;

type Filtro =
  | { tipo: "nicho" | "presenca" | "stage" | "motivo"; valor: string; rotulo: string }
  | { tipo: "prioridade" | "atrasados" | "largados"; valor: string; rotulo: string }
  | null;

export function Carteira({ leads }: { leads: LeadView[] }) {
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"lista" | "quadro">("lista");
  const [ordem, setOrdem] = useState<Ordem>("urgencia");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = leads.filter((l) => {
      if (termo && !l.nome.toLowerCase().includes(termo)) return false;
      if (!filtro) return true;
      switch (filtro.tipo) {
        case "nicho": return l.nicho === filtro.valor;
        case "presenca": return presencaDe(l) === filtro.valor;
        case "stage": return l.stage === filtro.valor;
        case "motivo": return l.motivoPerda === filtro.valor;
        case "prioridade": return l.score >= 80;
        case "atrasados": return estaAtrasado(l);
        case "largados": return estaLargado(l);
      }
    });
    return ordenar(filtrados, ordem);
  }, [leads, filtro, busca, ordem]);

  // Filtrar ou reordenar com a página 3 aberta mostraria um pedaço do meio de um
  // conjunto que o usuário acabou de trocar. Qualquer mudança volta para o começo.
  useEffect(() => setPagina(0), [filtro, busca, ordem]);

  const paginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, paginas - 1);
  const daPagina = visiveis.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  const irPara = (p: number) => {
    setPagina(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const total = leads.length;
  const naoContatados = leads.filter((l) => l.stage === "NOVO").length;
  const ganhos = leads.filter((l) => l.stage === "GANHO").length;
  const trabalhados = total - naoContatados;
  const conversao = trabalhados ? Math.round((ganhos / trabalhados) * 100) : 0;
  const atrasados = leads.filter(estaAtrasado);
  const largados = leads.filter(estaLargado);
  const hoje = leads.filter((l) => !ENCERRADOS.includes(l.stage) && diasAte(l.proximaAcaoEm) === 0);

  const porNicho = agrupar(leads, (l) => l.nicho);
  const porPresenca = agrupar(leads, presencaDe);
  const perdidos = leads.filter((l) => l.motivoPerda);
  const porMotivo = agrupar(perdidos, (l) => ROTULO_MOTIVO[l.motivoPerda!]);

  // Funil cumulativo: quem chegou em "Demo" passou por "Contatado". Contar só
  // quem está PARADO em cada etapa daria um gráfico que encolhe e cresce sem
  // sentido conforme os leads avançam.
  const funil = FUNIL.map((f, i) => {
    const idx = (s: ProspectStage) => FUNIL.findIndex((x) => x.stage === s);
    return { ...f, qtd: leads.filter((l) => l.stage !== "PERDIDO" && idx(l.stage) >= i).length };
  });

  const leadAberto = leads.find((l) => l.id === aberto) ?? null;

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

  function mover(id: string, stage: ProspectStage) {
    iniciar(async () => {
      const r = await moverStageAction(id, stage);
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
            <strong>preserva</strong> estágio, histórico e anotações.
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
          {/* ── O que fazer hoje ────────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              rotulo="Atrasados"
              valor={atrasados.length}
              detalhe={atrasados.length ? "passaram da data" : "nada atrasado"}
              alerta={atrasados.length > 0}
              aoClicar={atrasados.length ? () => setFiltro({ tipo: "atrasados", valor: "", rotulo: "Atrasados" }) : undefined}
            />
            <Tile
              rotulo="Para hoje"
              valor={hoje.length}
              detalhe={hoje.length ? "follow-up marcado" : "nada marcado"}
            />
            <Tile
              rotulo="A contatar"
              valor={naoContatados}
              detalhe={naoContatados ? "nunca abordados" : "tudo trabalhado"}
              aoClicar={naoContatados ? () => setFiltro({ tipo: "stage", valor: "NOVO", rotulo: "A contatar" }) : undefined}
            />
            <Tile rotulo="Clientes" valor={ganhos} detalhe={trabalhados ? `${conversao}% dos trabalhados` : "—"} />
          </section>

          {/*
            Sem próxima ação é o caso mais perigoso do processo: não tem data,
            então não aparece em atrasados, e some do radar sem ninguém notar.
          */}
          {largados.length > 0 && (
            <button
              type="button"
              onClick={() => setFiltro({ tipo: "largados", valor: "", rotulo: "Sem próxima ação" })}
              className="flex w-full items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-sm font-semibold text-amber-900"
            >
              <HelpCircle className="size-4 shrink-0" />
              {largados.length} {largados.length === 1 ? "lead trabalhado está" : "leads trabalhados estão"} sem próxima
              ação marcada — é assim que lead some do processo.
            </button>
          )}

          {/* ── Funil ───────────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-sm font-bold">Funil</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Cumulativo. A queda entre duas etapas mostra onde o processo trava.
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
                    aoClicar={() => setFiltro({ tipo: "stage", valor: f.stage, rotulo: f.rotulo })}
                  />
                );
              })}
            </div>
          </section>

          {/* ── Distribuições ───────────────────────────────────────────── */}
          <section className="grid gap-3 lg:grid-cols-2">
            <Painel titulo="Por nicho" nota="A abordagem muda conforme o negócio.">
              {porNicho.map(([nicho, qtd]) => (
                <Barra key={nicho} rotulo={nicho} valor={qtd} maximo={porNicho[0]![1]}
                  aoClicar={() => setFiltro({ tipo: "nicho", valor: nicho, rotulo: nicho })} />
              ))}
            </Painel>

            <Painel titulo="Presença digital" nota="Sem site é presença + automação. Com site, só automação.">
              {porPresenca.map(([p, qtd]) => (
                <Barra key={p} rotulo={p} valor={qtd} maximo={porPresenca[0]![1]}
                  aoClicar={() => setFiltro({ tipo: "presenca", valor: p, rotulo: p })} />
              ))}
            </Painel>
          </section>

          {/* Só aparece quando há perda registrada — gráfico vazio não informa. */}
          {porMotivo.length > 0 && (
            <Painel
              titulo="Por que você perde"
              nota="Muito 'não vê necessidade' é problema de comunicação de valor; muito 'preço' é posicionamento."
            >
              {porMotivo.map(([m, qtd]) => (
                <Barra key={m} rotulo={m} valor={qtd} maximo={porMotivo[0]![1]}
                  aoClicar={() => {
                    const chave = Object.entries(ROTULO_MOTIVO).find(([, r]) => r === m)?.[0];
                    if (chave) setFiltro({ tipo: "motivo", valor: chave, rotulo: m });
                  }} />
              ))}
            </Painel>
          )}

          {/* ── Lista / Quadro ──────────────────────────────────────────── */}
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
                    {filtro.rotulo} <X className="size-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setFiltro({ tipo: "prioridade", valor: "80", rotulo: "Score 80+" })}
                className="rounded-full border border-black/10 px-3 py-1 text-xs font-bold hover:bg-[var(--color-surface)]"
              >
                Score 80+
              </button>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar..."
                className="w-36 rounded-xl border border-black/10 px-3 py-1.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
              {modo === "lista" && (
                <select
                  value={ordem}
                  onChange={(e) => setOrdem(e.target.value as Ordem)}
                  aria-label="Ordenar por"
                  className="rounded-xl border border-black/10 px-2 py-1.5 text-sm font-semibold outline-none focus:border-[var(--color-primary)]"
                >
                  {(Object.keys(ROTULO_ORDEM) as Ordem[]).map((o) => (
                    <option key={o} value={o}>{ROTULO_ORDEM[o]}</option>
                  ))}
                </select>
              )}
              <div className="flex overflow-hidden rounded-xl border border-black/10">
                {([["lista", LayoutList], ["quadro", Columns3]] as const).map(([m, Icon]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModo(m)}
                    aria-label={m === "lista" ? "Ver em lista" : "Ver em quadro"}
                    className={`grid size-8 place-items-center ${
                      modo === m ? "bg-[var(--color-primary)] text-white" : "hover:bg-[var(--color-surface)]"
                    }`}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>

            {modo === "lista" ? (
              <>
                <Lista leads={daPagina} aoAbrir={setAberto} />
                {paginas > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-black/5 p-3">
                    <p className="text-xs text-[var(--color-muted)]">
                      {paginaAtual * POR_PAGINA + 1}–
                      {Math.min((paginaAtual + 1) * POR_PAGINA, visiveis.length)} de {visiveis.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => irPara(paginaAtual - 1)}
                        disabled={paginaAtual === 0}
                        className={BOTAO_PAGINA}
                      >
                        Anterior
                      </button>
                      <span className="text-xs font-bold tabular-nums">
                        {paginaAtual + 1} / {paginas}
                      </span>
                      <button
                        type="button"
                        onClick={() => irPara(paginaAtual + 1)}
                        disabled={paginaAtual >= paginas - 1}
                        className={BOTAO_PAGINA}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* O quadro não pagina: as colunas já dividem o conjunto, e cortar
                 no meio esconderia leads de uma etapa sem dizer que existem. */
              <Quadro leads={visiveis} aoAbrir={setAberto} aoMover={mover} pendente={pendente} />
            )}
          </section>
        </>
      )}

      {leadAberto && <PainelLead lead={leadAberto} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

/* ────────────────────────────── Lista ─────────────────────────────────── */

function Lista({ leads, aoAbrir }: { leads: LeadView[]; aoAbrir: (id: string) => void }) {
  if (!leads.length) {
    return <p className="p-6 text-center text-sm text-[var(--color-muted)]">Nada neste filtro.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface)] text-left text-[11px] uppercase text-[var(--color-muted)]">
          <tr>
            <th className="p-3">Score</th>
            <th className="p-3">Empresa</th>
            <th className="p-3">Último contato</th>
            <th className="p-3">Próxima ação</th>
            <th className="p-3">Etapa</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => {
            const atrasado = estaAtrasado(l);
            const dias = diasAte(l.proximaAcaoEm);
            return (
              <tr
                key={l.id}
                onClick={() => aoAbrir(l.id)}
                className="cursor-pointer border-t border-black/5 align-top hover:bg-[var(--color-surface)]"
              >
                <td className="p-3">
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-extrabold tabular-nums">
                    {l.score}
                  </span>
                </td>
                <td className="p-3">
                  <p className="font-semibold">{l.nome}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {l.nicho} · {l.avaliacoes} aval. · {presencaDe(l)}
                  </p>
                  {l.telefone && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)]">
                      <Phone className="size-3" /> {l.telefone}
                    </span>
                  )}
                </td>
                <td className="max-w-[16rem] p-3">
                  {l.ultimaInteracao ? (
                    <>
                      {l.ultimaInteracao.resultado && (
                        <p className="text-xs font-semibold">
                          {ROTULO_RESULTADO[l.ultimaInteracao.resultado]}
                        </p>
                      )}
                      <p className="truncate text-xs text-[var(--color-muted)]">
                        {l.ultimaInteracao.resumo}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted)]">
                        {formatarData(l.ultimaInteracao.criadoEm)}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">—</span>
                  )}
                </td>
                <td className="p-3">
                  {ENCERRADOS.includes(l.stage) ? (
                    <span className="text-xs text-[var(--color-muted)]">—</span>
                  ) : l.proximaAcaoEm ? (
                    <>
                      <p className="truncate text-xs">{l.proximaAcao ?? "sem descrição"}</p>
                      <p className={`text-[11px] font-semibold ${atrasado ? "text-red-700" : "text-[var(--color-muted)]"}`}>
                        {formatarData(l.proximaAcaoEm)}
                        {dias !== null && (dias < 0 ? ` · atrasada ${Math.abs(dias)}d` : dias === 0 ? " · hoje" : "")}
                      </p>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <Clock className="size-3" /> sem próxima ação
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_ESTAGIO[l.stage]}`}>
                    {ROTULO_ESTAGIO[l.stage]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ────────────────────────────── Quadro ────────────────────────────────── */

/**
 * Kanban por botão, não por arrastar.
 *
 * Arrastar exige biblioteca, não funciona bem no toque e quebra em coluna com
 * rolagem. As setas movem uma etapa por vez, que é como a conversa anda de
 * verdade — e funcionam igual no celular.
 *
 * PERDIDO não é coluna: é um desfecho que exige motivo, e o motivo se informa no
 * painel do lead. Ter a coluna convidaria a marcar perda sem dizer por quê,
 * que é justamente o dado que falta para saber por que você perde venda.
 */
function Quadro({
  leads,
  aoAbrir,
  aoMover,
  pendente,
}: {
  leads: LeadView[];
  aoAbrir: (id: string) => void;
  aoMover: (id: string, stage: ProspectStage) => void;
  pendente: boolean;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto p-4">
      {FUNIL.map((coluna, i) => {
        const daColuna = leads.filter((l) => l.stage === coluna.stage);
        return (
          <div key={coluna.stage} className="w-64 shrink-0">
            <p className="flex items-center justify-between px-1 pb-2 text-xs font-bold uppercase text-[var(--color-muted)]">
              {coluna.rotulo}
              <span className="tabular-nums">{daColuna.length}</span>
            </p>
            <div className="space-y-2">
              {daColuna.map((l) => {
                const atrasado = estaAtrasado(l);
                return (
                  <div
                    key={l.id}
                    className={`rounded-xl border bg-white p-3 shadow-sm ${
                      atrasado ? "border-red-200" : "border-black/10"
                    }`}
                  >
                    <button type="button" onClick={() => aoAbrir(l.id)} className="w-full text-left">
                      <p className="truncate text-sm font-bold">{l.nome}</p>
                      <p className="text-[11px] text-[var(--color-muted)]">
                        {l.score} · {l.nicho} · {l.avaliacoes} aval.
                      </p>
                      {l.ultimaInteracao && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-[var(--color-muted)]">
                          {l.ultimaInteracao.resumo}
                        </p>
                      )}
                      {!ENCERRADOS.includes(l.stage) && l.proximaAcaoEm && (
                        <p className={`mt-1 text-[11px] font-semibold ${atrasado ? "text-red-700" : "text-[var(--color-muted)]"}`}>
                          {atrasado ? "atrasada " : ""}{formatarData(l.proximaAcaoEm)}
                        </p>
                      )}
                    </button>
                    <div className="mt-2 flex gap-1">
                      {i > 0 && (
                        <button
                          type="button"
                          disabled={pendente}
                          onClick={() => aoMover(l.id, FUNIL[i - 1]!.stage)}
                          className="flex-1 rounded-lg border border-black/10 py-1 text-[11px] font-bold hover:bg-[var(--color-surface)] disabled:opacity-50"
                        >
                          ←
                        </button>
                      )}
                      {i < FUNIL.length - 1 && (
                        <button
                          type="button"
                          disabled={pendente}
                          onClick={() => aoMover(l.id, FUNIL[i + 1]!.stage)}
                          className="flex-1 rounded-lg border border-black/10 py-1 text-[11px] font-bold hover:bg-[var(--color-surface)] disabled:opacity-50"
                        >
                          →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!daColuna.length && (
                <p className="rounded-xl border border-dashed border-black/10 p-3 text-center text-[11px] text-[var(--color-muted)]">
                  vazio
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────────── auxiliares ─────────────────────────────── */

const BOTAO_PAGINA =
  "rounded-xl border border-black/10 px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-surface)] disabled:opacity-40";

function agrupar<T>(itens: T[], chave: (i: T) => string): [string, number][] {
  const mapa = new Map<string, number>();
  for (const i of itens) mapa.set(chave(i), (mapa.get(chave(i)) ?? 0) + 1);
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

function Painel({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-bold">{titulo}</h2>
      <p className="text-xs text-[var(--color-muted)]">{nota}</p>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

/**
 * Barra horizontal de magnitude.
 *
 * Uma cor só: o comprimento já codifica a grandeza, e pintar cada categoria de
 * uma cor faria o olho procurar significado que não existe. O valor vai
 * rotulado ao lado, o que dispensa eixo e grade.
 */
function Barra({
  rotulo, valor, maximo, sufixo, aoClicar,
}: {
  rotulo: string; valor: number; maximo: number; sufixo?: string; aoClicar?: () => void;
}) {
  const pct = maximo > 0 ? (valor / maximo) * 100 : 0;
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={sufixo ? `${rotulo}: ${valor} — ${sufixo}` : `${rotulo}: ${valor}`}
      className="flex w-full items-center gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-[var(--color-surface)]"
    >
      <span className="w-32 shrink-0 truncate text-xs font-semibold">{rotulo}</span>
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
  rotulo, valor, detalhe, aoClicar, alerta = false,
}: {
  rotulo: string; valor: number; detalhe: string; aoClicar?: () => void; alerta?: boolean;
}) {
  const Tag = aoClicar ? "button" : "div";
  return (
    <Tag
      {...(aoClicar ? { type: "button" as const, onClick: aoClicar } : {})}
      className={`rounded-2xl border p-4 text-left shadow-sm ${
        alerta ? "border-red-200 bg-red-50" : "border-black/5 bg-white"
      } ${aoClicar ? "hover:border-[var(--color-primary)]" : ""}`}
    >
      <p className={`text-[11px] font-bold uppercase tracking-wide ${alerta ? "text-red-700" : "text-[var(--color-muted)]"}`}>
        {rotulo}
      </p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${alerta ? "text-red-700" : ""}`}>{valor}</p>
      <p className={`mt-0.5 truncate text-xs ${alerta ? "text-red-800" : "text-[var(--color-muted)]"}`}>{detalhe}</p>
    </Tag>
  );
}
