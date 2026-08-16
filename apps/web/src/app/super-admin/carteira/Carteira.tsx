"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Upload, Download, Phone, AlertTriangle, Check, X, LayoutList, Columns3, Clock,
  HelpCircle, ChevronDown, MessageCircle, MapPin, LoaderCircle,
} from "lucide-react";

import type { ProspectStage } from "@barbearia-ai/core";
import { completarCoordenadasAction, importarCsvAction, moverStageAction } from "./actions";
import { PainelLead } from "./PainelLead";
import {
  COR_ESTAGIO, ENCERRADOS, FUNIL, ROTULO_CANAL, ROTULO_ESTAGIO, ROTULO_MOTIVO,
  ROTULO_ORDEM, ROTULO_RESULTADO, RAIOS, bairroDe, diasAte, distanciaAte, estaAtrasado,
  estaLargado, formatarData, formatarDistancia, ordenar, presencaDe, respostaWhatsappDe,
  type LeadView, type Ordem, type Ponto,
} from "./tipos";

/** Quantos leads por página na lista. */
const POR_PAGINA = 50;

/**
 * Atalhos de filtro da barra.
 *
 * São as três perguntas do dia: quem vale a pena atacar, quem já recebeu
 * mensagem e está calado, e com quem estou conversando agora. As demais
 * combinações continuam saindo dos gráficos e da busca.
 */
const RAPIDOS: { rotulo: string; filtro: { tipo: "prioridade" | "stage"; valor: string } }[] = [
  { rotulo: "Score 80+", filtro: { tipo: "prioridade", valor: "80" } },
  { rotulo: "Contatado", filtro: { tipo: "stage", valor: "CONTATADO" } },
  { rotulo: "Em conversa", filtro: { tipo: "stage", valor: "RESPONDEU" } },
];

type Filtro =
  | { tipo: "nicho" | "presenca" | "stage" | "motivo" | "bairro"; valor: string; rotulo: string }
  | { tipo: "prioridade" | "atrasados" | "largados"; valor: string; rotulo: string }
  | null;

export function Carteira({ leads }: { leads: LeadView[] }) {
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"lista" | "quadro">("lista");
  const [mostrarAnalise, setMostrarAnalise] = useState(true);
  const [ordem, setOrdem] = useState<Ordem>("urgencia");
  const [pagina, setPagina] = useState(0);
  /** Onde você está agora. Só existe depois de você autorizar o navegador. */
  const [aqui, setAqui] = useState<Ponto | null>(null);
  const [raio, setRaio] = useState(1000);
  const [localizando, setLocalizando] = useState(false);
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
        case "bairro": return bairroDe(l) === filtro.valor;
        case "prioridade": return l.score >= 80;
        case "atrasados": return estaAtrasado(l);
        case "largados": return estaLargado(l);
      }
    });
    // Proximidade é filtro à parte: combina com qualquer outro. Estando no
    // bairro, dá para ver "quem está a 1 km E ainda não foi abordado".
    const perto = aqui
      ? filtrados.filter((l) => {
          const d = distanciaAte(l, aqui);
          return d !== null && d <= raio;
        })
      : filtrados;
    // Perto de mim ordena por distância: o critério passa a ser o deslocamento.
    if (aqui) {
      return [...perto].sort(
        (a, b) => (distanciaAte(a, aqui) ?? Infinity) - (distanciaAte(b, aqui) ?? Infinity)
      );
    }
    return ordenar(perto, ordem);
  }, [leads, filtro, busca, ordem, aqui, raio]);

  // Filtrar ou reordenar com a página 3 aberta mostraria um pedaço do meio de um
  // conjunto que o usuário acabou de trocar. Qualquer mudança volta para o começo.
  useEffect(() => setPagina(0), [filtro, busca, ordem, aqui, raio]);

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
  // Só bairro com 2+ leads: ir até um bairro para visitar UMA barbearia não
  // compensa o deslocamento, e a lista ficaria com 90 linhas de ruído.
  const porBairro = agrupar(
    leads.filter((l) => bairroDe(l)),
    (l) => bairroDe(l)!
  ).filter(([, n]) => n >= 2);
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

  /** Leads sem coordenada: enquanto houver, o botão de completar aparece. */
  const semCoordenada = leads.filter((l) => l.lat == null).length;

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

  /**
   * Pede a posição ao navegador.
   *
   * Exige HTTPS e permissão explícita — a coordenada nunca sai do navegador,
   * não é gravada nem enviada ao servidor. O filtro roda todo no cliente.
   */
  function localizar() {
    if (!navigator.geolocation) {
      return setMsg({ ok: false, texto: "Este navegador não informa localização." });
    }
    setLocalizando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAqui({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocalizando(false);
      },
      () => {
        setLocalizando(false);
        setMsg({
          ok: false,
          texto: "Não consegui a localização. Autorize o acesso no navegador e tente de novo.",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  /**
   * Busca a coordenada dos leads importados antes das colunas existirem.
   *
   * O laço fica AQUI, no cliente, e não no servidor: a Vercel corta requisição
   * por duração, e 300 chamadas ao Google não cabem numa só. Cada volta grava o
   * lote e devolve quantos faltam — se a aba fechar no meio, o que já gravou
   * está gravado, e clicar de novo continua de onde parou.
   */
  function completarCoordenadas() {
    iniciar(async () => {
      let total = 0;
      for (let volta = 0; volta < 12; volta++) {
        const r = await completarCoordenadasAction();
        if (!r.ok) return setMsg({ ok: false, texto: r.erro });
        total += r.preenchidos;
        setMsg({
          ok: true,
          texto: r.restantes
            ? `${total} localizados · faltam ${r.restantes}...`
            : `${total} leads localizados. Recarregue para ver as distâncias.`,
        });
        // Nada preenchido e ainda restam: são leads cuja ficha o Google não
        // devolve mais. Insistir só gastaria cota.
        if (!r.restantes || r.preenchidos === 0) return;
      }
    });
  }

  function mover(id: string, stage: ProspectStage) {
    iniciar(async () => {
      const r = await moverStageAction(id, stage);
      if (!r.ok) setMsg({ ok: false, texto: r.erro });
    });
  }

  return (
    <div className="mt-6 space-y-3">
      {/* ── Ações ──────────────────────────────────────────────────────────
          Importar e baixar são raros no dia a dia — viram dois botões
          discretos no topo em vez de um bloco com parágrafo ocupando a
          primeira dobra, que é onde o trabalho de verdade deveria estar. */}
      <div className="flex flex-wrap items-center gap-2">
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
          title="Reimportar a mesma região atualiza nota e avaliações e preserva estágio, histórico e anotações"
          className={BOTAO_ACAO}
        >
          <Upload className="size-4" /> {pendente ? "Processando..." : "Importar CSV"}
        </button>
        <button
          type="button"
          onClick={() => baixarCsv(visiveis)}
          disabled={!visiveis.length}
          title="Baixa o que está na tela, com filtro e ordem aplicados"
          className={BOTAO_ACAO}
        >
          <Download className="size-4" /> Baixar CSV
        </button>
        {total > 0 && (
          <button
            type="button"
            onClick={aqui ? () => setAqui(null) : localizar}
            disabled={localizando}
            title={aqui ? "Voltar à lista completa" : "Mostra quem está por perto, para visita presencial"}
            className={`${BOTAO_ACAO} ${aqui ? "border-[var(--color-primary)] bg-blue-50 text-[var(--color-primary)]" : ""}`}
          >
            {localizando ? <LoaderCircle className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            {localizando ? "Localizando..." : aqui ? "Perto de mim ✕" : "Perto de mim"}
          </button>
        )}
        {semCoordenada > 0 && (
          <button
            type="button"
            onClick={completarCoordenadas}
            disabled={pendente}
            title="Busca a localização no Google pelos dados que já temos. Uma vez só."
            className={BOTAO_ACAO}
          >
            <MapPin className="size-4" /> Localizar {semCoordenada}
          </button>
        )}
        {aqui && (
          <select
            value={raio}
            onChange={(e) => setRaio(Number(e.target.value))}
            aria-label="Raio"
            className="rounded-xl border border-black/10 bg-white px-2 py-1.5 text-sm font-bold shadow-sm"
          >
            {RAIOS.map((r) => (
              <option key={r.m} value={r.m}>{r.rotulo}</option>
            ))}
          </select>
        )}
        {total > 0 && (
          <button
            type="button"
            onClick={() => setMostrarAnalise((v) => !v)}
            aria-expanded={mostrarAnalise}
            className={`${BOTAO_ACAO} ml-auto`}
          >
            <ChevronDown className={`size-4 transition-transform ${mostrarAnalise ? "" : "-rotate-90"}`} />
            Análise
          </button>
        )}
      </div>

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
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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

          {/* ── Análise ─────────────────────────────────────────────────────
              Lado a lado em vez de empilhado: a altura passa a ser a do maior
              gráfico (6 barras) e não a soma dos três (13), o que tira a lista
              de trabalho de baixo de meia tela de gráfico. Recolhível porque
              isto se olha de vez em quando, não a cada lead. */}
          {mostrarAnalise && (
            <section className="grid gap-3 lg:grid-cols-3">
              <Painel titulo="Funil" nota="Cumulativo. A queda mostra onde trava.">
                {funil.map((f, i) => {
                  const anterior = i > 0 ? funil[i - 1]!.qtd : null;
                  const taxa = anterior && anterior > 0 ? Math.round((f.qtd / anterior) * 100) : null;
                  return (
                    <Barra
                      key={f.stage}
                      rotulo={f.rotulo}
                      valor={f.qtd}
                      maximo={funil[0]!.qtd}
                      sufixo={taxa !== null ? `${taxa}%` : undefined}
                      aoClicar={() => setFiltro({ tipo: "stage", valor: f.stage, rotulo: f.rotulo })}
                    />
                  );
                })}
              </Painel>

              <Painel titulo="Por nicho" nota="A abordagem muda conforme o negócio.">
                {porNicho.map(([nicho, qtd]) => (
                  <Barra key={nicho} rotulo={nicho} valor={qtd} maximo={porNicho[0]![1]}
                    aoClicar={() => setFiltro({ tipo: "nicho", valor: nicho, rotulo: nicho })} />
                ))}
              </Painel>

              <Painel titulo="Presença digital" nota="Sem site é presença + automação.">
                {porPresenca.map(([p, qtd]) => (
                  <Barra key={p} rotulo={p} valor={qtd} maximo={porPresenca[0]![1]}
                    aoClicar={() => setFiltro({ tipo: "presenca", valor: p, rotulo: p })} />
                ))}
              </Painel>

              {/* Bairro é a única noção de proximidade que o endereço permite
                  sem guardar coordenada. Resolve o caso de verdade: estando na
                  região, quem mais dá para visitar a pé no mesmo dia. */}
              {porBairro.length > 0 && (
                <div className="lg:col-span-3">
                  <Painel
                    titulo="Onde ir"
                    nota="Bairros com mais de um lead — visita presencial rende quando dá para andar entre eles."
                  >
                    {porBairro.slice(0, 10).map(([b, qtd]) => (
                      <Barra key={b} rotulo={b} valor={qtd} maximo={porBairro[0]![1]}
                        aoClicar={() => setFiltro({ tipo: "bairro", valor: b, rotulo: b })} />
                    ))}
                  </Painel>
                </div>
              )}

              {/* Só aparece quando há perda registrada — gráfico vazio não informa. */}
              {porMotivo.length > 0 && (
                <div className="lg:col-span-3">
                  <Painel
                    titulo="Por que você perde"
                    nota="Muito 'não vê necessidade' é comunicação de valor; muito 'preço' é posicionamento."
                  >
                    {porMotivo.map(([m, qtd]) => (
                      <Barra key={m} rotulo={m} valor={qtd} maximo={porMotivo[0]![1]}
                        aoClicar={() => {
                          const chave = Object.entries(ROTULO_MOTIVO).find(([, r]) => r === m)?.[0];
                          if (chave) setFiltro({ tipo: "motivo", valor: chave, rotulo: m });
                        }} />
                    ))}
                  </Painel>
                </div>
              )}
            </section>
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

              {/* Atalhos do dia a dia. São alternadores: clicar no que já está
                  ativo desliga, em vez de obrigar a ir no chip para limpar. */}
              {RAPIDOS.map((r) => {
                const ativo = filtro?.tipo === r.filtro.tipo && filtro.valor === r.filtro.valor;
                return (
                  <button
                    key={r.rotulo}
                    type="button"
                    onClick={() => setFiltro(ativo ? null : { ...r.filtro, rotulo: r.rotulo })}
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${
                      ativo
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                        : "border-black/10 hover:bg-[var(--color-surface)]"
                    }`}
                  >
                    {r.rotulo}
                  </button>
                );
              })}
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
                <Lista leads={daPagina} aoAbrir={setAberto} aqui={aqui} />
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

function Lista({
  leads,
  aoAbrir,
  aqui = null,
}: {
  leads: LeadView[];
  aoAbrir: (id: string) => void;
  aqui?: Ponto | null;
}) {
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
            const respostaWhatsapp = l.ultimaInteracao
              ? respostaWhatsappDe(l.ultimaInteracao.resumo)
              : null;
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
                    {(() => {
                      const d = distanciaAte(l, aqui);
                      return d === null ? null : (
                        <span className="ml-1 font-bold text-[var(--color-primary)]">
                          · {formatarDistancia(d)} daqui
                        </span>
                      );
                    })()}
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
                      {respostaWhatsapp ? (
                        <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <MessageCircle className="size-3" /> Resposta no WhatsApp
                        </p>
                      ) : l.ultimaInteracao.resultado && (
                        <p className="text-xs font-semibold">
                          {ROTULO_RESULTADO[l.ultimaInteracao.resultado]}
                        </p>
                      )}
                      <p className="truncate text-xs text-[var(--color-muted)]">
                        {respostaWhatsapp ?? l.ultimaInteracao.resumo}
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
                  ) : estaLargado(l) ? (
                    /* O alerta é só para lead JÁ trabalhado que ficou sem plano.
                       Em quem nunca foi abordado isso é o estado natural, e
                       pintar 177 linhas de laranja ensina o olho a ignorar o
                       aviso exatamente quando ele significa alguma coisa. */
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-amber-700">
                      <Clock className="size-3 shrink-0" /> sem próxima ação
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">—</span>
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
                const respostaWhatsapp = l.ultimaInteracao
                  ? respostaWhatsappDe(l.ultimaInteracao.resumo)
                  : null;
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
                        <div className="mt-1">
                          {respostaWhatsapp && (
                            <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                              <MessageCircle className="size-3" /> Resposta no WhatsApp
                            </p>
                          )}
                          <p className="line-clamp-2 text-[11px] text-[var(--color-muted)]">
                            {respostaWhatsapp ?? l.ultimaInteracao.resumo}
                          </p>
                        </div>
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

/**
 * Exporta a carteira como planilha.
 *
 * Leva o que você TRABALHOU, não só o que veio do Google: etapa, último
 * resultado, próximo passo, decisor e motivo de perda. Sem isso o arquivo seria
 * uma cópia do CSV da Prospecção e não serviria para acompanhar nada fora daqui.
 *
 * O `place_id` vai na primeira coluna de propósito — é ele que deduplica na
 * reimportação. Um arquivo sem essa coluna volta como leads novos e apaga seu
 * histórico de abordagem.
 */
function baixarCsv(leads: LeadView[]) {
  const cab = [
    "place_id", "nome", "nicho", "etapa", "score", "telefone", "bairro", "endereco",
    "nota", "avaliacoes", "presenca_digital", "site", "maps",
    "decisor", "decisor_cargo", "decisor_telefone",
    "ultimo_contato_em", "ultimo_contato_canal", "ultimo_contato_resultado", "ultimo_contato_resumo",
    "proxima_acao", "proxima_acao_em", "dias_ate_acao",
    "motivo_perda", "na_carteira_desde", "observacao", "por_que_entrou",
  ];

  const linha = (l: LeadView) => {
    const u = l.ultimaInteracao;
    const dias = ENCERRADOS.includes(l.stage) ? null : diasAte(l.proximaAcaoEm);
    return [
      l.placeId, l.nome, l.nicho, ROTULO_ESTAGIO[l.stage], l.score, l.telefone ?? "",
      bairroDe(l) ?? "", l.endereco ?? "",
      l.nota ?? "", l.avaliacoes, presencaDe(l), l.site ?? "", l.maps ?? "",
      l.decisorNome ?? "", l.decisorCargo ?? "", l.decisorTelefone ?? "",
      u ? formatarData(u.criadoEm) : "", u ? ROTULO_CANAL[u.canal] : "",
      u?.resultado ? ROTULO_RESULTADO[u.resultado] : "", u?.resumo ?? "",
      l.proximaAcao ?? "", l.proximaAcaoEm ? formatarData(l.proximaAcaoEm) : "",
      dias ?? "", l.motivoPerda ? ROTULO_MOTIVO[l.motivoPerda] : "",
      formatarData(l.contatadoEm), l.observacao ?? "", l.motivos.join(" · "),
    ];
  };

  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const corpo = leads.map((l) => linha(l).map(escapar).join(",")).join("\n");
  // BOM para o Excel abrir a acentuação certa.
  const blob = new Blob(["﻿" + cab.join(",") + "\n" + corpo], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `carteira-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const BOTAO_ACAO =
  "flex items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-sm font-bold shadow-sm hover:bg-[var(--color-surface)] disabled:opacity-40";

const BOTAO_PAGINA =
  "rounded-xl border border-black/10 px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-surface)] disabled:opacity-40";

function agrupar<T>(itens: T[], chave: (i: T) => string): [string, number][] {
  const mapa = new Map<string, number>();
  for (const i of itens) mapa.set(chave(i), (mapa.get(chave(i)) ?? 0) + 1);
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

function Painel({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold">{titulo}</h2>
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{nota}</p>
      <div className="mt-2.5 space-y-1">{children}</div>
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
      className="flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-[var(--color-surface)]"
    >
      {/* Larguras enxutas: em três colunas o rótulo largo de antes não deixava
          espaço para a própria barra. O título completo fica no `title`. */}
      <span className="w-28 shrink-0 truncate text-xs font-semibold">{rotulo}</span>
      <span className="h-4 min-w-0 flex-1 overflow-hidden rounded-sm bg-[var(--color-surface)]">
        <span
          className="block h-full rounded-r-sm bg-[var(--color-primary)]"
          style={{ width: `${Math.max(pct, valor > 0 ? 2 : 0)}%` }}
        />
      </span>
      <span className="w-8 shrink-0 text-right text-xs font-extrabold tabular-nums">{valor}</span>
      {sufixo && (
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--color-muted)]">{sufixo}</span>
      )}
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
      className={`flex items-baseline gap-2 rounded-xl border px-3 py-2 text-left shadow-sm ${
        alerta ? "border-red-200 bg-red-50" : "border-black/5 bg-white"
      } ${aoClicar ? "hover:border-[var(--color-primary)]" : ""}`}
    >
      {/* Número e rótulo na mesma linha: quatro tiles altos empurravam a lista
          para baixo sem dizer mais do que dizem assim. */}
      <span className={`text-xl font-extrabold tabular-nums ${alerta ? "text-red-700" : ""}`}>{valor}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-xs font-bold ${alerta ? "text-red-700" : ""}`}>{rotulo}</span>
        <span className={`block truncate text-[11px] ${alerta ? "text-red-800" : "text-[var(--color-muted)]"}`}>
          {detalhe}
        </span>
      </span>
    </Tag>
  );
}
