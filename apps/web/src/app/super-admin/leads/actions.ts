"use server";

import { requireSuperAdmin } from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";
import {
  buscarCelula,
  detalhar,
  grade,
  paraLead,
  passaNoFiltro,
  PlacesConfigError,
  RAIO_CELULA_M,
  type Lead,
  type LugarBruto,
} from "@/lib/places";

/**
 * Prospecção de leads pela Places API.
 *
 * A busca é feita em LOTES conduzidos pelo cliente, e não numa chamada só, por
 * um motivo concreto: varrer 8 km de raio são ~61 células, e uma server action
 * tem limite de duração na Vercel — a chamada única estouraria no meio e você
 * perderia tudo, já tendo gastado a cota. Em lotes, cada chamada é curta, dá
 * pra mostrar progresso e uma falha no meio não joga fora o que já veio.
 */

/** Quantas células por chamada. Mantém cada action bem abaixo do limite. */
const CELULAS_POR_LOTE = 8;
/** Quantos detalhes por chamada. Cada um é uma requisição à API. */
const DETALHES_POR_LOTE = 10;

export type Ponto = { lat: number; lng: number };
export type Plano = { pontos: Ponto[]; celulas: number; raioCelulaM: number; lotes: number };

async function guarda() {
  requireSuperAdmin(await getAuthContext());
}

function mensagemDeErro(e: unknown): string {
  if (e instanceof PlacesConfigError) return e.message;
  console.error("[leads] falhou", e);
  return e instanceof Error ? e.message : "Falha inesperada";
}

/**
 * Monta a grade SEM gastar cota nenhuma — é só matemática.
 * Serve pra tela mostrar o tamanho da varredura antes de você mandar rodar.
 */
export async function planejarAction(lat: number, lng: number, raio: number): Promise<Plano> {
  await guarda();
  const pontos = grade(lat, lng, raio);
  return {
    pontos,
    celulas: pontos.length,
    raioCelulaM: RAIO_CELULA_M,
    lotes: Math.ceil(pontos.length / CELULAS_POR_LOTE),
  };
}

export type ResultadoLote =
  | { ok: true; lugares: LugarBruto[] }
  | { ok: false; erro: string };

/** Fase 1: varre um lote de células com os campos baratos. */
export async function buscarLoteAction(pontos: Ponto[]): Promise<ResultadoLote> {
  try {
    await guarda();
    const lotes = await Promise.all(
      pontos.slice(0, CELULAS_POR_LOTE).map((p) => buscarCelula(p.lat, p.lng).catch(() => []))
    );
    return { ok: true, lugares: lotes.flat() };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e) };
  }
}

export type ResultadoDetalhe =
  | { ok: true; leads: Lead[] }
  | { ok: false; erro: string };

/**
 * Fase 2: telefone e site — a chamada CARA. Recebe só quem já passou no filtro,
 * então o que chega aqui é o que vale pagar.
 */
export async function detalharLoteAction(lugares: LugarBruto[]): Promise<ResultadoDetalhe> {
  try {
    await guarda();
    const alvo = lugares.slice(0, DETALHES_POR_LOTE);
    const detalhes = await Promise.all(
      alvo.map(async (p) => ({ ...p, ...(await detalhar(p.id).catch(() => ({}))) }))
    );
    return { ok: true, leads: detalhes.map(paraLead) };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e) };
  }
}

/** Filtro roda no servidor para a regra viver num lugar só. */
export async function filtrarAction(lugares: LugarBruto[], minAvaliacoes: number): Promise<LugarBruto[]> {
  await guarda();
  const vistos = new Set<string>();
  return lugares.filter((p) => {
    if (vistos.has(p.id)) return false; // células se sobrepõem: o mesmo lugar aparece várias vezes
    vistos.add(p.id);
    return passaNoFiltro(p, minAvaliacoes);
  });
}
