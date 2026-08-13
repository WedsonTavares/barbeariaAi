"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";

import type { ProspectStage } from "@barbearia-ai/core";
import {
  historicoAction,
  reagendarAction,
  registrarContatoAction,
  salvarObservacaoAction,
} from "./actions";
import {
  COR_ESTAGIO,
  ENCERRADOS,
  FUNIL,
  MOTIVOS_PERDA,
  RESULTADOS,
  ROTULO_CANAL,
  ROTULO_ESTAGIO,
  ROTULO_MOTIVO,
  ROTULO_RESULTADO,
  TODOS_ESTAGIOS,
  diasAte,
  estaAtrasado,
  formatarData,
  respostaWhatsappDe,
  type Interacao,
  type LeadView,
} from "./tipos";

/** Sugestões podem avançar o funil, mas nunca regredir uma negociação. */
function sugestaoValida(
  atual: ProspectStage,
  sugerido: ProspectStage | null
): ProspectStage | null {
  if (!sugerido) return null;
  if (sugerido === "PERDIDO") return sugerido;
  const ordem = FUNIL.map((f) => f.stage);
  return ordem.indexOf(sugerido) > ordem.indexOf(atual) ? sugerido : null;
}

export function PainelLead({ lead, aoFechar }: { lead: LeadView; aoFechar: () => void }) {
  const [historico, setHistorico] = useState<Interacao[] | null>(null);
  const [stageEscolhido, setStageEscolhido] = useState<ProspectStage>(lead.stage);
  const [editandoProximaAcao, setEditandoProximaAcao] = useState(
    !lead.proximaAcao && !lead.proximaAcaoEm
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    const carregar = () => {
      historicoAction(lead.id).then((h) => vivo && setHistorico(h));
    };
    carregar();
    const timer = window.setInterval(carregar, 10_000);
    return () => {
      vivo = false;
      window.clearInterval(timer);
    };
  }, [lead.id]);

  useEffect(() => {
    setStageEscolhido(lead.stage);
    setEditandoProximaAcao(!lead.proximaAcao && !lead.proximaAcaoEm);
  }, [lead.id, lead.stage, lead.proximaAcao, lead.proximaAcaoEm]);

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
  const ultimaResposta = historico?.find((i) => respostaWhatsappDe(i.resumo) !== null) ?? null;
  const textoUltimaResposta = ultimaResposta ? respostaWhatsappDe(ultimaResposta.resumo) : null;

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
        <header className="sticky top-0 z-10 flex items-start gap-2 border-b border-black/5 bg-white/95 p-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold">{lead.nome}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_ESTAGIO[lead.stage]}`}>
                {ROTULO_ESTAGIO[lead.stage]}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {lead.nicho}
              {lead.nota ? ` · nota ${lead.nota}` : ""} · {lead.avaliacoes} avaliações
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
        </header>

        <div className="space-y-4 p-4">
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

          {ultimaResposta && textoUltimaResposta && (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <MessageCircle className="size-4" /> Resposta no WhatsApp
                </h2>
                <p className="text-[11px] text-emerald-700">
                  {new Date(ultimaResposta.criadoEm).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-emerald-950">
                {textoUltimaResposta}
              </p>
            </section>
          )}

          {!encerrado && (
            <section
              className={`rounded-xl border p-3 ${
                atrasado ? "border-red-200 bg-red-50" : "border-black/10 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2
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
                </h2>
                {!editandoProximaAcao && (
                  <button
                    type="button"
                    onClick={() => setEditandoProximaAcao(true)}
                    className="text-xs font-bold text-[var(--color-primary)] hover:underline"
                  >
                    Editar
                  </button>
                )}
              </div>

              {editandoProximaAcao ? (
                <form
                  action={(fd) =>
                    iniciar(async () => {
                      setErro(null);
                      const r = await reagendarAction(lead.id, fd);
                      if (r.ok) setEditandoProximaAcao(false);
                      else setErro(r.erro);
                    })
                  }
                  className="mt-2 flex flex-wrap gap-2"
                >
                  <input
                    name="proximaAcao"
                    defaultValue={lead.proximaAcao ?? ""}
                    placeholder="Ex.: enviar mensagem à tarde"
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <input
                    name="proximaAcaoEm"
                    type="date"
                    defaultValue={lead.proximaAcaoEm?.slice(0, 10) ?? ""}
                    className={INPUT}
                  />
                  <button disabled={pendente} className={BOTAO_SEC}>Salvar</button>
                  {(lead.proximaAcao || lead.proximaAcaoEm) && (
                    <button
                      type="button"
                      onClick={() => setEditandoProximaAcao(false)}
                      className="text-xs font-bold text-[var(--color-muted)]"
                    >
                      Cancelar
                    </button>
                  )}
                </form>
              ) : (
                <div className="mt-1.5">
                  <p className="text-sm font-semibold">{lead.proximaAcao || "Sem descrição"}</p>
                  <p className={`text-xs ${atrasado ? "text-red-700" : "text-[var(--color-muted)]"}`}>
                    {lead.proximaAcaoEm ? formatarData(lead.proximaAcaoEm) : "Sem data"}
                  </p>
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border border-black/10 p-3">
            <h2 className="text-sm font-bold">Registrar andamento</h2>
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
                <select name="canal" className={`${INPUT} w-32`} defaultValue="WHATSAPP">
                  {Object.entries(ROTULO_CANAL).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
                <select
                  name="resultado"
                  defaultValue=""
                  onChange={(e) => {
                    const resultado = RESULTADOS.find((r) => r.valor === e.target.value);
                    const sugerido = sugestaoValida(lead.stage, resultado?.sugere ?? null);
                    setStageEscolhido(sugerido ?? lead.stage);
                  }}
                  className={`${INPUT} min-w-0 flex-1`}
                >
                  <option value="">O que aconteceu?</option>
                  {RESULTADOS.map((resultado) => (
                    <option key={resultado.valor} value={resultado.valor}>{resultado.rotulo}</option>
                  ))}
                </select>
              </div>

              <label className="block text-[11px] font-bold uppercase text-[var(--color-muted)]">
                Etapa após o registro
                <select
                  name="paraStage"
                  value={stageEscolhido}
                  onChange={(e) => setStageEscolhido(e.target.value as ProspectStage)}
                  className={`${INPUT} mt-1 w-full font-normal normal-case text-black`}
                >
                  {TODOS_ESTAGIOS.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage === lead.stage ? `Continua em ${ROTULO_ESTAGIO[stage]}` : `→ ${ROTULO_ESTAGIO[stage]}`}
                    </option>
                  ))}
                </select>
              </label>

              <textarea
                name="resumo"
                rows={2}
                placeholder="Detalhe opcional"
                className={INPUT}
              />

              {stageEscolhido === "PERDIDO" && (
                <select name="motivoPerda" required defaultValue="" className={INPUT}>
                  <option value="" disabled>Por que perdeu?</option>
                  {MOTIVOS_PERDA.map((motivo) => (
                    <option key={motivo.valor} value={motivo.valor}>{motivo.rotulo}</option>
                  ))}
                </select>
              )}

              <button disabled={pendente} className={BOTAO}>
                {pendente ? "Salvando..." : "Registrar"}
              </button>
            </form>
          </section>

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

          <details className="rounded-xl border border-black/10 p-3">
            <summary className="cursor-pointer text-sm font-bold">Anotações</summary>
            <form
              action={(fd) =>
                iniciar(async () => {
                  await salvarObservacaoAction(lead.id, String(fd.get("observacao") ?? ""));
                })
              }
              className="mt-3 space-y-2"
            >
              <textarea
                name="observacao"
                defaultValue={lead.observacao ?? ""}
                rows={3}
                placeholder="Contexto permanente sobre este lead"
                className={INPUT}
              />
              <button disabled={pendente} className={BOTAO_SEC}>Salvar anotação</button>
            </form>
          </details>

          <section>
            <h2 className="text-sm font-bold">Histórico</h2>
            {historico === null ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">Carregando...</p>
            ) : historico.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">Nenhum contato registrado ainda.</p>
            ) : (
              <ol className="mt-2 space-y-3 border-l border-black/10 pl-4">
                {historico.map((item) => <HistoricoItem key={item.id} item={item} />)}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function HistoricoItem({ item }: { item: Interacao }) {
  const resposta = respostaWhatsappDe(item.resumo);
  return (
    <li className="relative">
      <span
        className={`absolute -left-[21px] top-1.5 size-2 rounded-full ${
          resposta ? "bg-emerald-500" : "bg-[var(--color-primary)]"
        }`}
      />
      <p className="text-[11px] text-[var(--color-muted)]">
        {new Date(item.criadoEm).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>
      <p className={`text-xs font-semibold ${resposta ? "text-emerald-800" : ""}`}>
        {resposta ? "Resposta no WhatsApp" : ROTULO_CANAL[item.canal]}
        {item.resultado && ` · ${ROTULO_RESULTADO[item.resultado]}`}
        {item.paraStage && (
          <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] ${COR_ESTAGIO[item.paraStage]}`}>
            → {ROTULO_ESTAGIO[item.paraStage]}
          </span>
        )}
      </p>
      <p className="whitespace-pre-wrap text-sm">{resposta ?? item.resumo}</p>
    </li>
  );
}

const INPUT =
  "rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60";
const BOTAO =
  "w-full rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const BOTAO_SEC =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-bold hover:bg-[var(--color-surface)] disabled:opacity-50";
