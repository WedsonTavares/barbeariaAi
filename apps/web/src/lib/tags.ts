/**
 * Catálogo de tags marcáveis por checkbox nas Conversas e no Funil.
 *
 * `pos-atendimento` funciona igual a `atendimento-humano`: marcar/desmarcar na mão
 * tem o MESMO efeito de arrastar o card pra coluna Pós-atendimento no Funil — inclusive
 * dispara a mesma mensagem automática (ver toggleTag no core + os dois lugares
 * que chamam `sendPosAtendimentoAutoMessage`). Os dois modos coexistem de propósito.
 *
 * `agendado` continua de fora: espelha um agendamento ativo (não uma escolha do
 * atendente), então não faz sentido virar checkbox — marcar não criaria agendamento
 * nenhum, só deixaria o card mentindo.
 */
export const TAG_CATALOG: { tag: string; label: string; hint?: string }[] = [
  { tag: "atendimento-humano", label: "Atendimento humano", hint: "pausa a IA" },
  { tag: "desligar-ia", label: "Desligar IA", hint: "pausa a IA" },
  { tag: "pos-atendimento", label: "Pós-atendimento", hint: "envia mensagem" },
  { tag: "cliente-vip", label: "Cliente VIP" },
  { tag: "orcamento-enviado", label: "Orçamento enviado" },
  { tag: "nao-responde", label: "Não responde" },
];

/** Tags governadas só pelo funil (sem equivalente manual) — read-only nas telas. */
export const STAGE_ONLY_TAGS = new Set(["novo-lead", "agendado", "interessado"]);

/** Tags que silenciam a IA (espelha BOT_SILENCING_TAGS do core). */
export const SILENCING_TAGS = new Set(["desligar-ia", "atendimento-humano"]);

/** Normaliza uma tag digitada à mão: minúscula, sem espaço nas pontas, com hífen. */
export function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
}
