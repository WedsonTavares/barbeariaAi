import type { LugarBruto } from "./places";

/**
 * Prospecção pela Apify — segunda fonte, ao lado do Google Places.
 *
 * Este módulo é SERVER-SIDE. O token nunca vai para o browser: não existe
 * `NEXT_PUBLIC_APIFY_TOKEN` e nem deve existir. Quem fala com a Apify é a
 * server action; a tela só recebe o resultado já normalizado.
 *
 * A saída é `LugarBruto`, o mesmo formato do Google Places, de propósito: assim
 * `nichoDe`, `pontuar` e `paraLead` são reusados sem alteração e o score de um
 * lead da Apify é comparável ao de um lead do Places. Duas escalas de score
 * convivendo na mesma Carteira tornariam a ordenação por prioridade mentirosa.
 */

export class ApifyConfigError extends Error {}
export class ApifyError extends Error {}

/**
 * Actor do Google Maps. Configurável porque a Apify troca de actor recomendado
 * com o tempo e não vale prender o código a um id.
 */
const ACTOR_PADRAO = "compass~crawler-google-places";
const BASE = "https://api.apify.com/v2";

/** A Apify cobra por resultado; teto duro para um clique não virar uma conta. */
const LIMITE_MAXIMO = 300;

function token(): string {
  const t = process.env.APIFY_TOKEN?.trim();
  if (!t) {
    throw new ApifyConfigError(
      "APIFY_TOKEN não está definido. Crie o token em apify.com → Settings → Integrations e adicione nas variáveis de ambiente do servidor."
    );
  }
  return t;
}

/**
 * Nota mínima aceita pelo actor.
 *
 * A API não recebe número: é uma lista fechada de apelidos. Mandar `4.5` ou
 * `07` devolve 400 com "must be equal to one of the allowed values" — foi o que
 * aconteceu na primeira busca com filtro. A tela oferece só estes valores.
 */
export const NOTAS_MINIMAS = [
  { valor: "", rotulo: "Qualquer nota" },
  { valor: "two", rotulo: "2,0 ou mais" },
  { valor: "twoAndHalf", rotulo: "2,5 ou mais" },
  { valor: "three", rotulo: "3,0 ou mais" },
  { valor: "threeAndHalf", rotulo: "3,5 ou mais" },
  { valor: "four", rotulo: "4,0 ou mais" },
  { valor: "fourAndHalf", rotulo: "4,5 ou mais" },
] as const;

export type NotaMinima = (typeof NOTAS_MINIMAS)[number]["valor"];

export type BuscaApify = {
  /** O que procurar: "barbearia", "salão de beleza"… */
  termo: string;
  /** Cidade/região por extenso: "Ribeirão Preto, SP". */
  local: string;
  limite: number;
  /** Um dos valores de `NOTAS_MINIMAS`. Vazio = sem filtro. */
  notaMinima?: string;
};

/** O que o actor de Google Maps devolve, no recorte que usamos. */
type ItemApify = {
  placeId?: string;
  title?: string;
  categoryName?: string;
  categories?: string[];
  address?: string;
  street?: string;
  city?: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  url?: string;
  totalScore?: number;
  reviewsCount?: number;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  openingHours?: { day?: string; hours?: string }[];
};

/**
 * Traduz o item da Apify para o formato do Google Places.
 *
 * As categorias da Apify são texto livre ("Barber shop", "Beauty salon"), não os
 * tipos do Google. Vão em `types` mesmo assim porque `nichoDe` casa por
 * substring no nome quando o tipo não bate — e o nome é o sinal mais confiável
 * no Brasil, como o próprio comentário de `nichoDe` explica.
 */
export function paraLugarBruto(item: ItemApify): LugarBruto | null {
  // Sem placeId não há deduplicação possível: o lead voltaria como novo a cada
  // importação e apagaria o histórico de abordagem. Melhor descartar.
  if (!item.placeId) return null;

  const categorias = [item.categoryName, ...(item.categories ?? [])]
    .filter(Boolean)
    .map((c) => String(c).toLowerCase().replace(/\s+/g, "_"));

  return {
    id: item.placeId,
    displayName: { text: item.title ?? "(sem nome)" },
    formattedAddress: item.address ?? [item.street, item.city].filter(Boolean).join(", "),
    rating: item.totalScore,
    userRatingCount: item.reviewsCount ?? 0,
    types: categorias,
    primaryType: categorias[0],
    nationalPhoneNumber: item.phone ?? undefined,
    internationalPhoneNumber: item.phoneUnformatted ?? undefined,
    websiteUri: item.website ?? undefined,
    googleMapsUri: item.url ?? undefined,
    regularOpeningHours: item.openingHours?.length
      ? { weekdayDescriptions: item.openingHours.map((h) => `${h.day ?? ""} ${h.hours ?? ""}`.trim()) }
      : undefined,
  };
}

/**
 * Roda o actor e devolve os itens.
 *
 * Usa `run-sync-get-dataset-items`: a Apify executa e responde na mesma
 * requisição, o que dispensa guardar `runId` e ficar consultando estado. O
 * preço é o teto de tempo — por isso o limite baixo e o timeout explícito.
 */
export async function buscarLocais(busca: BuscaApify): Promise<LugarBruto[]> {
  const actor = process.env.APIFY_GOOGLE_MAPS_ACTOR?.trim() || ACTOR_PADRAO;
  const limite = Math.min(Math.max(1, Math.trunc(busca.limite)), LIMITE_MAXIMO);

  const entrada: Record<string, unknown> = {
    searchStringsArray: [busca.termo.trim()],
    locationQuery: busca.local.trim(),
    maxCrawledPlacesPerSearch: limite,
    language: "pt-BR",
    skipClosedPlaces: true,
    // O actor busca detalhe de contato por padrão; deixamos explícito para o
    // dia em que o padrão mudar — telefone e site são a razão de existir aqui.
    scrapeContacts: true,
  };
  // Só entra se for um apelido reconhecido. Valor estranho vindo do cliente é
  // descartado em silêncio em vez de derrubar a busca inteira com 400.
  const nota = NOTAS_MINIMAS.find((n) => n.valor === busca.notaMinima)?.valor;
  if (nota) entrada.placeMinimumStars = nota;

  const url = `${BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token())}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entrada),
      // Teto de 4 min: acima disso o usuário já desistiu da tela, e a Apify
      // continua rodando do lado dela sem nos prender.
      signal: AbortSignal.timeout(240_000),
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new ApifyError(
        "A busca passou de 4 minutos e foi interrompida. Tente um limite menor ou uma região mais específica."
      );
    }
    throw new ApifyError("Não foi possível falar com a Apify. Verifique a conexão do servidor.");
  }

  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    // O token não pode vazar para a tela nem para o log de erro.
    if (res.status === 401 || res.status === 403) {
      throw new ApifyConfigError("A Apify recusou o token. Confira o APIFY_TOKEN no servidor.");
    }
    if (res.status === 404) {
      throw new ApifyConfigError(`Actor "${actor}" não encontrado na sua conta Apify.`);
    }
    throw new ApifyError(`Apify respondeu ${res.status}. ${corpo.slice(0, 160)}`);
  }

  const itens = (await res.json().catch(() => [])) as ItemApify[];
  if (!Array.isArray(itens)) return [];

  return itens
    .filter((i) => !i.permanentlyClosed && !i.temporarilyClosed)
    .map(paraLugarBruto)
    .filter((l): l is LugarBruto => l !== null);
}
