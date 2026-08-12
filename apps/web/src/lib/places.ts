/**
 * Cliente da Google Places API (New) para prospecção de leads.
 *
 * Server-only: a chave nunca vai pro navegador.
 *
 * POR QUE A API E NÃO SCRAPING DO MAPS
 *   Raspar o Maps viola os termos do Google, quebra quando eles mudam o HTML e
 *   leva bloqueio de IP. Para um processo comercial recorrente não é fundação.
 *
 * COMO O CUSTO É CONTROLADO
 *   A Places API cobra por SKU conforme os campos pedidos, e telefone e site
 *   são do SKU mais caro. Por isso a busca tem duas fases: a varredura usa só
 *   campos baratos, e o telefone só é buscado para quem passou no filtro.
 */
const BASE = "https://places.googleapis.com/v1/places";

/** Tipos do Google que correspondem ao nosso público: serviço com hora marcada. */
const TIPOS = ["hair_care", "beauty_salon", "nail_salon", "spa"];

/** Raio de cada célula da grade. Menor = mais cobertura e mais chamadas. */
export const RAIO_CELULA_M = 1200;

/** Campos BARATOS. Telefone e site ficam de fora de propósito — ver o topo. */
const MASK_BUSCA = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
].join(",");

/**
 * Campos CAROS (SKU superior). Só para quem passou no filtro.
 *
 * ⚠️ E-MAIL NÃO EXISTE NA PLACES API. Ela não guarda esse dado — nem no SKU
 * mais caro. Quem precisa de e-mail tem que abrir o `websiteUri` e procurar na
 * página de contato, o que é outra etapa (e quebra quando o site muda).
 */
const MASK_DETALHE = [
  "id",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "regularOpeningHours.weekdayDescriptions",
].join(",");

export type LugarBruto = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
};

export type Nicho = "Barbearia" | "Salão de beleza" | "Manicure" | "Estética/Spa" | "Outro";

/**
 * Nicho a partir dos tipos do Google.
 *
 * A ordem importa: um lugar costuma vir marcado com vários tipos ao mesmo
 * tempo ("hair_care" + "beauty_salon"), e quem decide é o mais específico.
 * Barbearia antes de salão porque é o nosso alvo principal.
 */
export function nichoDe(p: LugarBruto): Nicho {
  const tipos = new Set([p.primaryType, ...(p.types ?? [])].filter(Boolean) as string[]);
  const nome = (p.displayName?.text ?? "").toLowerCase();

  // O tipo "barber_shop" existe mas o Google usa pouco no Brasil — o nome do
  // estabelecimento acaba sendo o sinal mais confiável.
  if (tipos.has("barber_shop") || /barbearia|barber|barbeiro/.test(nome)) return "Barbearia";
  if (tipos.has("nail_salon") || /manicure|nail|unhas/.test(nome)) return "Manicure";
  if (tipos.has("spa") || /est[ée]tica|spa|massagem/.test(nome)) return "Estética/Spa";
  if (tipos.has("hair_care") || tipos.has("beauty_salon")) return "Salão de beleza";
  return "Outro";
}

export type Lead = {
  id: string;
  nome: string;
  nicho: Nicho;
  endereco: string;
  telefone: string | null;
  /** Formato +55… — é o que o link do WhatsApp precisa. */
  telefoneInternacional: string | null;
  site: string | null;
  maps: string | null;
  horario: string[] | null;
  nota: number | null;
  avaliacoes: number;
  score: number;
  motivos: string[];
};

export class PlacesConfigError extends Error {}

function chave(): string {
  const k = process.env.GOOGLE_MAPS_API_KEY;
  if (!k) {
    throw new PlacesConfigError(
      "GOOGLE_MAPS_API_KEY não está definida. Crie a chave no Google Cloud com a Places API (New) habilitada e adicione nas variáveis de ambiente."
    );
  }
  return k;
}

/**
 * Pontos que cobrem o círculo pedido.
 *
 * O passo é raio×1.5 e não raio×2 de propósito: círculos que apenas se tocam
 * deixam vãos nos cantos entre eles, e é exatamente ali que some um lead.
 *
 * É puro e exportado porque a tela precisa dele para estimar o custo ANTES de
 * gastar cota — e para conduzir a busca em lotes.
 */
export function grade(lat: number, lng: number, raioTotalM: number): { lat: number; lng: number }[] {
  const passo = RAIO_CELULA_M * 1.5;
  const grausLat = passo / 111_320;
  const grausLng = passo / (111_320 * Math.cos((lat * Math.PI) / 180));
  const n = Math.floor(raioTotalM / passo) + 1;

  const pontos: { lat: number; lng: number }[] = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const pLat = lat + i * grausLat;
      const pLng = lng + j * grausLng;
      const dx = (pLng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180);
      const dy = (pLat - lat) * 111_320;
      if (Math.hypot(dx, dy) <= raioTotalM) pontos.push({ lat: pLat, lng: pLng });
    }
  }
  return pontos;
}

/** Fase 1 — varredura barata de UMA célula. */
export async function buscarCelula(lat: number, lng: number): Promise<LugarBruto[]> {
  const res = await fetch(`${BASE}:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": chave(),
      "X-Goog-FieldMask": MASK_BUSCA,
    },
    body: JSON.stringify({
      includedTypes: TIPOS,
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: RAIO_CELULA_M } },
      languageCode: "pt-BR",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Places searchNearby ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { places?: LugarBruto[] };
  return j.places ?? [];
}

/** Fase 2 — telefone e site de UM lugar (chamada cara). */
export async function detalhar(placeId: string): Promise<Partial<LugarBruto>> {
  const res = await fetch(`${BASE}/${placeId}`, {
    headers: { "X-Goog-Api-Key": chave(), "X-Goog-FieldMask": MASK_DETALHE },
    cache: "no-store",
  });
  if (!res.ok) return {};
  return (await res.json()) as Partial<LugarBruto>;
}

/**
 * Quem nem vale gastar a chamada cara de telefone.
 *
 * Fechado não interessa, e pouquíssima avaliação costuma ser cadastro morto,
 * autônomo sem movimento ou registro duplicado.
 */
export function passaNoFiltro(p: LugarBruto, minAvaliacoes: number): boolean {
  if (p.businessStatus !== "OPERATIONAL") return false;
  return (p.userRatingCount ?? 0) >= minAvaliacoes;
}

/**
 * Prioridade do lead, de 0 a 100, com o motivo escrito.
 *
 * A lógica vem do que a gente vende: um negócio com MOVIMENTO e SEM SISTEMA.
 * Volume de avaliação é a melhor proxy pública de movimento; a ausência de site
 * é a melhor proxy de "atende tudo no braço, pelo WhatsApp".
 */
export function pontuar(p: LugarBruto): { score: number; motivos: string[] } {
  let score = 0;
  const motivos: string[] = [];

  const n = p.userRatingCount ?? 0;
  if (n >= 300) { score += 40; motivos.push("muito movimento (300+ avaliações)"); }
  else if (n >= 100) { score += 32; motivos.push("bom movimento (100+ avaliações)"); }
  else if (n >= 40) { score += 22; motivos.push("movimento moderado (40+)"); }
  else { score += 10; motivos.push("pouco movimento"); }

  // O sinal mais forte: tem cliente e não tem sistema.
  const site = (p.websiteUri ?? "").toLowerCase();
  if (!site) { score += 30; motivos.push("SEM SITE — atende no braço"); }
  else if (/instagram\.|facebook\.|linktr\.ee|linktree|wa\.me|beacons\./.test(site)) {
    score += 22; motivos.push("só rede social, sem sistema próprio");
  } else { score += 4; motivos.push("já tem site próprio"); }

  const nota = p.rating;
  if (nota == null) score += 5;
  else if (nota >= 4.8) { score += 10; motivos.push(`reputação excelente (${nota})`); }
  // Faixa mais fértil para o pós-atendimento: liga para reputação e tem o que melhorar.
  else if (nota >= 4.3) { score += 20; motivos.push(`nota ${nota} — cabe pós-atendimento`); }
  else if (nota >= 3.5) { score += 14; motivos.push(`nota ${nota} — precisa de reputação`); }
  else { score += 6; motivos.push(`nota baixa (${nota})`); }

  // Sem telefone você não consegue abordar — o lead não serve, por melhor que
  // seja o resto.
  if (p.nationalPhoneNumber) score += 10;
  else { score -= 25; motivos.push("SEM TELEFONE"); }

  return { score: Math.max(0, Math.min(100, score)), motivos };
}

export function paraLead(p: LugarBruto): Lead {
  const { score, motivos } = pontuar(p);
  return {
    id: p.id,
    nome: p.displayName?.text ?? "(sem nome)",
    nicho: nichoDe(p),
    endereco: p.formattedAddress ?? "",
    telefone: p.nationalPhoneNumber ?? null,
    telefoneInternacional: p.internationalPhoneNumber ?? null,
    site: p.websiteUri ?? null,
    maps: p.googleMapsUri ?? null,
    horario: p.regularOpeningHours?.weekdayDescriptions ?? null,
    nota: p.rating ?? null,
    avaliacoes: p.userRatingCount ?? 0,
    score,
    motivos,
  };
}
