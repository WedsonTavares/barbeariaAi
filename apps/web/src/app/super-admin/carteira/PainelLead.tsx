"use client";
import { useEffect, useState, useTransition } from "react";
import {
  X, Phone, ExternalLink, AlertTriangle, Clock, MapPin, Target, UserRound,
} from "lucide-react";

import type { ProspectResultado, ProspectStage } from "@barbearia-ai/core";
import {
  historicoAction, registrarContatoAction, reagendarAction,
  salvarDecisorAction, salvarObservacaoAction,
} from "./actions";
import {
  COR_ESTAGIO, ENCERRADOS, FUNIL, MOTIVOS_PERDA, RESULTADOS, ROTULO_CANAL,
  ROTULO_ESTAGIO, ROTULO_MOTIVO, ROTULO_RESULTADO, TODOS_ESTAGIOS,
  diasAte, estaAtrasado, formatarData, ofertaDe, presencaDe,
  type Interacao, type LeadView,
} from "./tipos";

/** Sugere o próximo estágio — o caminho que a conversa quase sempre segue. */
function proximoStage(atual: ProspectStage): ProspectStage {
  const ordem = FUNIL.map((f) => f.stage);
  const i = ordem.indexOf(atual);
  return i >= 0 && i < ordem.length - 1 ? ordem[i + 1]! : atual;
}

/**
 * Aplica a sugestão do resultado só quando ela AVANÇA o lead.
 *
 * Sem isso, registrar "falei com o responsável" num lead que já está em Proposta
 * o puxaria de volta para Respondeu — o resultado descreve o toque, não regride
 * a negociação. Perda é exceção: pode acontecer em qualquer etapa.
 */
function sugestaoValida(atual: ProspectStage, sugerido: ProspectStage | null): ProspectStage | null {
  if (!sugerido) return null;
  if (sugerido === "PERDIDO") return sugerido;
  const ordem = FUNIL.map((f) => f.stage);
  return ordem.indexOf(sugerido) > ordem.indexOf(atual) ? sugerido : null;
}

/** Data de hoje em yyyy-mm-dd, para o valor padrão do <input type="date">. */
function hojeMais(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function PainelLead({ lead, aoFechar }: { lead: LeadView; aoFechar: () => void }) {
  const [historico, setHistorico] = useState<Interacao[] | null>(null);
  const [stageEscolhido, setStageEscolhido] = useState<ProspectStage>(proximoStage(lead.stage));
  const [editandoDecisor, setEditandoDecisor] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // Histórico só é carregado ao abrir o painel — carregá-lo para todos os leads
  // na lista seriam milhares de linhas para exibir uma frase.
  useEffect(() => {
    let vivo = true;
    historicoAction(lead.id).then((h) => vivo && setHistorico(h));
    return () => {
      vivo = false;
    };
  }, [lead.id]);

  // Esc fecha e a página atrás não rola, como nas gavetas do painel.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", onKey);
    };
  }, [aoFechar]);

  const atrasado = estaAtrasado(lead);
  const dias = diasAte(lead.proximaAcaoEm);
  const encerrado = ENCERRADOS.includes(lead.stage);
  const temDecisor = Boolean(lead.decisorNome || lead.decisorTelefone);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Lead ${lead.nome}`}
        className="absolute inset-y-0 right-0 flex w-[30rem] max-w-[95vw] flex-col overflow-y-auto bg-white shadow-2xl"
      >
        {/* ── Identificação ─────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-black/5 bg-white/95 p-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold">{lead.nome}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_ESTAGIO[lead.stage]}`}>
                {ROTULO_ESTAGIO[lead.stage]}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold tabular-nums">
                score {lead.score}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {lead.nicho}
              {lead.nota ? ` · ${lead.nota} de nota` : ""} · {lead.avaliacoes} avaliações ·{" "}
              {presencaDe(lead)}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          {/* ── Contato ─────────────────────────────────────────────────── */}
          <div>
            <div className="flex flex-wrap gap-2">
              {lead.telefone && (
                <a
                  href={`https://wa.me/${`55${lead.telefone}`.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-white"
                >
                  <Phone className="size-4" /> {lead.telefone}
                </a>
              )}
              {lead.maps && (
                <a href={lead.maps} target="_blank" rel="noreferrer" className={BOTAO_SEC}>
                  <MapPin className="size-4" /> Maps
                </a>
              )}
              {lead.site && (
                <a href={lead.site} target="_blank" rel="noreferrer" className={BOTAO_SEC}>
                  <ExternalLink className="size-4" /> Site
                </a>
              )}
            </div>
            {lead.endereco && (
              <p className="mt-2 text-xs text-[var(--color-muted)]">{lead.endereco}</p>
            )}
          </div>

          {/* ── Estado atual, sem precisar ler o histórico ──────────────── */}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-black/10 bg-[var(--color-surface)] p-3 text-xs">
            <div>
              <p className="text-[11px] font-bold uppercase text-[var(--color-muted)]">Último contato</p>
              <p className="mt-0.5 font-semibold">
                {lead.ultimaInteracao ? formatarData(lead.ultimaInteracao.criadoEm) : "Nunca"}
              </p>
              {lead.ultimaInteracao?.resultado && (
                <p className="text-[var(--color-muted)]">
                  {ROTULO_RESULTADO[lead.ultimaInteracao.resultado]}
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-[var(--color-muted)]">Próxima ação</p>
              <p className={`mt-0.5 font-semibold ${atrasado ? "text-red-700" : ""}`}>
                {encerrado
                  ? "—"
                  : lead.proximaAcaoEm
                    ? `${formatarData(lead.proximaAcaoEm)}${dias === 0 ? " · hoje" : dias !== null && dias < 0 ? ` · atrasada ${Math.abs(dias)}d` : ""}`
                    : "Nenhuma"}
              </p>
              {!encerrado && lead.proximaAcao && (
                <p className="text-[var(--color-muted)]">{lead.proximaAcao}</p>
              )}
            </div>
          </div>

          {/* ── Quem decide ─────────────────────────────────────────────── */}
          <div className="rounded-xl border border-black/10 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[var(--color-muted)]">
              <UserRound className="size-3.5" /> Quem decide
            </p>

            {temDecisor && !editandoDecisor ? (
              <div className="mt-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{lead.decisorNome ?? "—"}</p>
                  {lead.decisorCargo && (
                    <p className="text-xs text-[var(--color-muted)]">{lead.decisorCargo}</p>
                  )}
                  {lead.decisorTelefone && (
                    <a
                      href={`https://wa.me/${`55${lead.decisorTelefone}`.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)]"
                    >
                      <Phone className="size-3" /> {lead.decisorTelefone}
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditandoDecisor(true)}
                  className="shrink-0 text-xs font-bold text-[var(--color-muted)] hover:underline"
                >
                  Editar
                </button>
              </div>
            ) : editandoDecisor || !temDecisor ? (
              <form
                action={(fd) =>
                  iniciar(async () => {
                    setErro(null);
                    const r = await salvarDecisorAction(lead.id, fd);
                    if (r.ok) setEditandoDecisor(false);
                    else setErro(r.erro);
                  })
                }
                className="mt-2 space-y-2"
              >
                {!temDecisor && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Ainda não identificado. O telefone acima costuma ser o da recepção.
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    name="decisorNome"
                    defaultValue={lead.decisorNome ?? ""}
                    placeholder="Nome"
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <input
                    name="decisorCargo"
                    defaultValue={lead.decisorCargo ?? ""}
                    placeholder="Cargo"
                    className={`${INPUT} w-28`}
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    name="decisorTelefone"
                    defaultValue={lead.decisorTelefone ?? ""}
                    placeholder="Telefone direto"
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <button disabled={pendente} className={BOTAO_SEC}>Salvar</button>
                </div>
              </form>
            ) : null}
          </div>

          {/* ── Oportunidade ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-black/10 bg-[var(--color-surface)] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[var(--color-muted)]">
              <Target className="size-3.5" /> Oportunidade
            </p>
            <p className="mt-1 text-sm font-bold">{ofertaDe(lead)}</p>
            {lead.motivos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lead.motivos.map((m) => (
                  <span
                    key={m}
                    className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Próxima ação ────────────────────────────────────────────── */}
          {!encerrado && (
            <div
              className={`rounded-xl border p-3 ${
                atrasado ? "border-red-200 bg-red-50" : "border-black/10 bg-white"
              }`}
            >
              <p
                className={`flex items-center gap-1.5 text-[11px] font-bold uppercase ${
                  atrasado ? "text-red-700" : "text-[var(--color-muted)]"
                }`}
              >
                {atrasado ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
                Próxima ação
                {dias !== null && (
                  <span className="normal-case">
                    {dias < 0 ? `· atrasada ${Math.abs(dias)}d` : dias === 0 ? "· hoje" : `· em ${dias}d`}
                  </span>
                )}
              </p>
              <form
                action={(fd) =>
                  iniciar(async () => {
                    setErro(null);
                    const r = await reagendarAction(lead.id, fd);
                    if (!r.ok) setErro(r.erro);
                  })
                }
                className="mt-2 flex flex-wrap gap-2"
              >
                <input
                  name="proximaAcao"
                  defaultValue={lead.proximaAcao ?? ""}
                  placeholder="Ex.: ligar de novo pela manhã"
                  className={`${INPUT} min-w-0 flex-1`}
                />
                <input
                  name="proximaAcaoEm"
                  type="date"
                  defaultValue={lead.proximaAcaoEm?.slice(0, 10) ?? ""}
                  className={INPUT}
                />
                <button disabled={pendente} className={BOTAO_SEC}>Salvar</button>
              </form>
            </div>
          )}

          {/* ── Registrar contato ───────────────────────────────────────── */}
          <div className="rounded-xl border border-black/10 p-3">
            <p className="text-sm font-bold">Registrar contato</p>
            <p className="text-xs text-[var(--color-muted)]">
              Por onde falou, o que saiu disso, e o próximo passo — tudo de uma vez.
            </p>
            <form
              action={(fd) =>
                iniciar(async () => {
                  setErro(null);
                  const r = await registrarContatoAction(lead.id, fd);
                  if (r.ok) {
                    setHistorico(await historicoAction(lead.id));
                    (document.getElementById(`form-${lead.id}`) as HTMLFormElement | null)?.reset();
                  } else setErro(r.erro);
                })
              }
              id={`form-${lead.id}`}
              className="mt-2 space-y-2"
            >
              <div className="flex gap-2">
                <select name="canal" className={`${INPUT} w-32`} defaultValue="LIGACAO">
                  {Object.entries(ROTULO_CANAL).map(([v, r]) => (
                    <option key={v} value={v}>{r}</option>
                  ))}
                </select>
                {/* Escolher o resultado já move a etapa para o lugar provável —
                    e a etapa continua editável logo abaixo, para a exceção. */}
                <select
                  name="resultado"
                  defaultValue=""
                  onChange={(e) => {
                    const r = RESULTADOS.find((x) => x.valor === e.target.value);
                    const sugerido = sugestaoValida(lead.stage, r?.sugere ?? null);
                    if (sugerido) setStageEscolhido(sugerido);
                  }}
                  className={`${INPUT} min-w-0 flex-1`}
                >
                  <option value="">O que aconteceu?</option>
                  {RESULTADOS.map((r) => (
                    <option key={r.valor} value={r.valor}>{r.rotulo}</option>
                  ))}
                </select>
              </div>

              <select
                name="paraStage"
                value={stageEscolhido}
                onChange={(e) => setStageEscolhido(e.target.value as ProspectStage)}
                className={INPUT}
              >
                {TODOS_ESTAGIOS.map((s) => (
                  <option key={s} value={s}>
                    {s === lead.stage ? `Continua em ${ROTULO_ESTAGIO[s]}` : `→ ${ROTULO_ESTAGIO[s]}`}
                  </option>
                ))}
              </select>

              <textarea
                name="resumo"
                rows={2}
                placeholder="Detalhe (opcional): agenda no caderno, pediu para chamar depois das 14h..."
                className={INPUT}
              />

              {/* Motivo só aparece quando é perda — e aí é obrigatório, porque é
                  ele que alimenta o gráfico de por que você perde venda. */}
              {stageEscolhido === "PERDIDO" && (
                <select name="motivoPerda" required defaultValue="" className={INPUT}>
                  <option value="" disabled>Por que perdeu?</option>
                  {MOTIVOS_PERDA.map((m) => (
                    <option key={m.valor} value={m.valor}>{m.rotulo}</option>
                  ))}
                </select>
              )}

              {stageEscolhido !== "PERDIDO" && stageEscolhido !== "GANHO" && (
                <div className="flex gap-2">
                  <input
                    name="proximaAcao"
                    placeholder="Próximo passo"
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <input name="proximaAcaoEm" type="date" defaultValue={hojeMais(3)} className={INPUT} />
                </div>
              )}

              <button disabled={pendente} className={BOTAO}>
                {pendente ? "Salvando..." : "Registrar"}
              </button>
            </form>
          </div>

          {erro && (
            <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {erro}
            </p>
          )}

          {lead.motivoPerda && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              Perdido: {ROTULO_MOTIVO[lead.motivoPerda]}
            </p>
          )}

          {/* ── Anotações ───────────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-bold">Anotações</p>
            <form
              action={(fd) =>
                iniciar(async () => {
                  await salvarObservacaoAction(lead.id, String(fd.get("observacao") ?? ""));
                })
              }
              className="mt-2 space-y-2"
            >
              <textarea
                name="observacao"
                defaultValue={lead.observacao ?? ""}
                rows={3}
                placeholder="Contexto que não muda: melhor horário, como chegou até ele, concorrente que já usa..."
                className={INPUT}
              />
              <button disabled={pendente} className={BOTAO_SEC}>Salvar anotação</button>
            </form>
          </div>

          {/* ── Histórico ───────────────────────────────────────────────── */}
          <div>
            <p className="text-sm font-bold">Histórico</p>
            {historico === null ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">Nenhum contato registrado ainda.</p>
            ) : (
              <ol className="mt-2 space-y-3 border-l border-black/10 pl-4">
                {historico.map((i) => (
                  <li key={i.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[var(--color-primary)]" />
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {new Date(i.criadoEm).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                    <p className="text-xs font-semibold">
                      {ROTULO_CANAL[i.canal]}
                      {i.resultado && ` · ${ROTULO_RESULTADO[i.resultado]}`}
                      {i.paraStage && (
                        <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${COR_ESTAGIO[i.paraStage]}`}>
                          → {ROTULO_ESTAGIO[i.paraStage]}
                        </span>
                      )}
                    </p>
                    {i.resumo && <p className="text-sm">{i.resumo}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <p className="pb-4 text-[11px] text-[var(--color-muted)]">
            Na carteira desde {formatarData(lead.contatadoEm)}
            {lead.telefone ? "" : " · sem telefone"}
          </p>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60";
const BOTAO =
  "w-full rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const BOTAO_SEC =
  "flex items-center gap-1.5 rounded-xl border border-black/10 px-3 py-2 text-sm font-bold hover:bg-[var(--color-surface)] disabled:opacity-50";
