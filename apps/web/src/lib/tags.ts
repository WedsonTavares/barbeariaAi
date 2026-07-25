/**
 * Catálogo de tags marcáveis por checkbox nas Conversas.
 *
 * Nem toda tag entra aqui: `agendado` e `pos-festa` são espelho da COLUNA do
 * funil (ver STAGE_TAG no core) — quem manda nelas é arrastar o card, então
 * marcá-las à mão criaria conversa em duas etapas ao mesmo tempo. Elas continuam
 * aparecendo como chip, só não são editáveis por aqui.
 */
export const TAG_CATALOG: { tag: string; label: string; hint?: string }[] = [
  { tag: "atendimento-humano", label: "Atendimento humano", hint: "pausa a IA" },
  { tag: "desligar-ia", label: "Desligar IA", hint: "pausa a IA" },
  { tag: "cliente-vip", label: "Cliente VIP" },
  { tag: "orcamento-enviado", label: "Orçamento enviado" },
  { tag: "aguardando-sinal", label: "Aguardando sinal" },
  { tag: "nao-responde", label: "Não responde" },
];

/** Tags governadas pelo funil — read-only na tela de conversas. */
export const STAGE_ONLY_TAGS = new Set(["novo-lead", "agendado", "pos-festa"]);

/** Tags que silenciam a IA (espelha BOT_SILENCING_TAGS do core). */
export const SILENCING_TAGS = new Set(["desligar-ia", "atendimento-humano"]);

/** Normaliza uma tag digitada à mão: minúscula, sem espaço nas pontas, com hífen. */
export function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
}
